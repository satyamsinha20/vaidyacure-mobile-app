import { z } from 'zod';
import { AiDoctor } from '../../models/AiDoctor.js';
import { Booking, type IBooking } from '../../models/Booking.js';
import type { IPatient } from '../../models/Patient.js';
import { UnlockToken } from '../../models/UnlockToken.js';
import { UsageCounter } from '../../models/UsageCounter.js';
import { WalletTxn } from '../../models/Wallet.js';
import { FREE_PRICE, rupeesToPaise } from '../../utils/money.js';
import { DAY_MS, MINUTE_MS, addDaysToKey, istDateKey } from '../../utils/time.js';
import { randomToken, sha256 } from '../../utils/secretBox.js';
import { getAiSettings } from '../ai/configStore.js';
import { withTransaction } from '../db/transaction.js';
import { AppError, objectIdParam } from '../http.js';
import { PatientSchema, type PatientInput } from '../diagnosis/schemas.js';
import { startBookedConsultation } from '../consult/consultService.js';
import { findSlot, hasAnyHours, slotsForDate } from './availability.js';
import { aiSlotKey, getPatientBooking, STATUS_LABELS } from './bookings.js';
import { debitWallet } from './wallet.js';

/**
 * Booking a time with an AI doctor that has fixed hours. The unlock happens
 * when booking: nothing for the Library Doctor, ads for free doctors, the
 * wallet for premium doctors (refunded to the wallet if the slot is missed).
 */
export const AiBookingSchema = z.object({
  doctorId: objectIdParam,
  slotStart: z.iso.datetime(),
  unlockToken: z.string().regex(/^[a-f0-9]{48}$/).optional(),
  requestId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/).optional(),
});

export const StartAiBookingSchema = z.object({ patient: PatientSchema });

const AI_BOOKING_DAYS = 14;
const START_EARLY_MS = 5 * MINUTE_MS;
const MAX_UPCOMING_AI_BOOKINGS = 3;

const minutesOf = (doctor: { consultMinutes?: number | null }, consultationSeconds: number) =>
  doctor.consultMinutes ?? Math.max(1, Math.round(consultationSeconds / 60));

export const aiDoctorSlots = async (doctorId: string, dateKey: string) => {
  const settings = await getAiSettings();
  const doctor = await AiDoctor.findById(doctorId).lean();
  if (!doctor || !doctor.isActive) throw new AppError(404, 'Doctor not found.', 'not_found');
  if (doctor.alwaysAvailable !== false || !hasAnyHours(doctor.availability)) return { date: dateKey, slots: [] };
  const today = istDateKey();
  if (dateKey < today || dateKey > addDaysToKey(today, AI_BOOKING_DAYS)) return { date: dateKey, slots: [] };
  const slots = slotsForDate(doctor.availability, dateKey, minutesOf(doctor, settings.consultationSeconds), 0);
  const counters = await UsageCounter.find({ key: { $in: slots.map((s) => aiSlotKey(doctor._id, s.start)) } }).lean();
  const used = new Map(counters.map((c) => [c.key, c.count]));
  const now = Date.now();
  return {
    date: dateKey,
    slots: slots.map((s) => ({
      start: s.start,
      end: s.end,
      available: s.start.getTime() > now && (used.get(aiSlotKey(doctor._id, s.start)) ?? 0) < (doctor.slotCapacity ?? 20),
    })),
  };
};

export const createAiBooking = async (patient: IPatient, deviceId: string | undefined, input: z.infer<typeof AiBookingSchema>): Promise<IBooking> => {
  const settings = await getAiSettings();
  const doctor = await AiDoctor.findById(input.doctorId).lean();
  if (!doctor || !doctor.isActive) throw new AppError(404, 'This doctor is not available.', 'not_found');
  if (doctor.alwaysAvailable !== false || !hasAnyHours(doctor.availability)) {
    throw new AppError(400, 'This doctor is available any time, so you can start the consultation directly.', 'always_available');
  }
  const minutes = minutesOf(doctor, settings.consultationSeconds);
  const slot = findSlot(doctor.availability, new Date(input.slotStart), minutes, 0);
  const now = Date.now();
  if (!slot || slot.start.getTime() <= now) throw new AppError(400, 'Please pick one of the available times.', 'invalid_slot');
  if (slot.start.getTime() > now + AI_BOOKING_DAYS * DAY_MS) throw new AppError(400, 'Please pick an earlier date.', 'too_far');

  const tier = doctor.tier;
  if (tier === 'free' && (!input.unlockToken || !deviceId)) {
    throw new AppError(402, `Watch ${settings.adsRequired} short ads to book this doctor.`, 'ads_required');
  }
  if (tier === 'premium' && !settings.walletEnabled) throw new AppError(503, 'Premium consultations are not available right now.');

  // Retried premium booking (same requestId): return the booking that was already paid for
  if (tier === 'premium' && input.requestId) {
    const txn = await WalletTxn.findOne({ idempotencyKey: `aibook:${patient._id}:${input.requestId}` }).lean();
    const existing = txn ? await Booking.findOne({ publicId: txn.ref, patient: patient._id }) : null;
    if (existing) return existing;
  }
  if (await Booking.exists({ patient: patient._id, aiDoctor: doctor._id, slotStart: slot.start, status: 'confirmed' })) {
    throw new AppError(409, 'You have already booked this time.', 'already_booked');
  }
  // One person cannot reserve a doctor's whole day
  const upcoming = await Booking.countDocuments({ patient: patient._id, kind: 'ai', status: 'confirmed', slotEnd: { $gt: new Date(now) } });
  if (upcoming >= MAX_UPCOMING_AI_BOOKINGS) {
    throw new AppError(429, `You can have at most ${MAX_UPCOMING_AI_BOOKINGS} upcoming AI bookings.`, 'too_many_bookings');
  }

  // Reserve a place: the conditional upsert fails with a duplicate key once the slot is full
  const key = aiSlotKey(doctor._id, slot.start);
  try {
    await UsageCounter.findOneAndUpdate(
      { key, count: { $lt: doctor.slotCapacity ?? 20 } },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(slot.end.getTime() + 7 * DAY_MS) } },
      { upsert: true }
    );
  } catch (error: any) {
    if (error?.code === 11000) throw new AppError(409, 'This time is full. Please pick another time.', 'slot_full');
    throw error;
  }

  const base = {
    publicId: randomToken(16),
    patient: patient._id,
    kind: 'ai' as const,
    aiDoctor: doctor._id,
    slotStart: slot.start,
    slotEnd: slot.end,
    consultMinutes: minutes,
    status: 'confirmed' as const,
    slotLock: true,
    holdUntil: null,
  };

  try {
    if (tier === 'premium') {
      const pricePaise = rupeesToPaise(settings.premiumPriceInr);
      const booking = await withTransaction(async (session) => {
        await debitWallet(session, patient._id, pricePaise, {
          kind: 'ai_chat',
          ref: base.publicId,
          note: `Premium booking: ${doctor.name}`,
          ...(input.requestId ? { idempotencyKey: `aibook:${patient._id}:${input.requestId}` } : {}),
        });
        const [created] = await Booking.create(
          [{ ...base, unlock: 'wallet', price: { feePaise: pricePaise, commissionPaise: 0, totalPaise: pricePaise } }],
          { session }
        );
        return created;
      });
      return booking;
    }
    if (tier === 'free') {
      const token = await UnlockToken.findOneAndUpdate(
        { tokenHash: sha256(input.unlockToken!), deviceId, usedAt: null, expiresAt: { $gt: new Date() } },
        { $set: { usedAt: new Date() } }
      );
      if (!token) throw new AppError(402, 'Your ad unlock has expired or was already used. Please watch the ads again.', 'ads_required');
    }
    return await Booking.create({ ...base, unlock: tier === 'free' ? 'ads' : 'free', price: FREE_PRICE });
  } catch (error) {
    // Give the reserved place back
    await UsageCounter.updateOne({ key, count: { $gt: 0 } }, { $inc: { count: -1 } });
    throw error;
  }
};

export const startAiBooking = async (patient: IPatient, publicId: string, deviceId: string, input: PatientInput) => {
  const booking = await getPatientBooking(patient, publicId);
  if (booking.kind !== 'ai') throw new AppError(400, 'This is not an AI doctor booking.');
  if (booking.status !== 'confirmed') throw new AppError(409, `This booking is ${STATUS_LABELS[booking.status]}.`, 'not_startable');
  const now = Date.now();
  if (now < booking.slotStart.getTime() - START_EARLY_MS) {
    throw new AppError(409, 'You can start 5 minutes before the booked time.', 'too_early');
  }
  if (now >= booking.slotEnd.getTime()) throw new AppError(409, 'The booked time is over.', 'missed');
  return startBookedConsultation(deviceId, booking, input, patient);
};
