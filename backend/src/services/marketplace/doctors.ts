import { z } from 'zod';
import { Doctor, type IDoctor } from '../../models/Doctor.js';
import { Booking } from '../../models/Booking.js';
import { decryptSecret, encryptSecret } from '../../utils/secretBox.js';
import { DAY_MS, addDaysToKey, istDateKey } from '../../utils/time.js';
import { priceForFee, paiseToRupees } from '../../utils/money.js';
import { AppError } from '../http.js';
import { AvailabilityInputSchema, cleanAvailability, slotsForDate } from './availability.js';
import { expireOldHolds, isDoctorBookable } from './bookings.js';
import { getMarketplaceSettings } from './settings.js';
import { doctorCard } from './views.js';
import { EmailSchema } from '../patient/auth.js';
import { generateDoctorCode, generateTempPassword } from '../doctor/auth.js';

/* -------------------------------------------------------------------------- */
/* PUBLIC (mobile app)                                                        */
/* -------------------------------------------------------------------------- */
/** Real doctors patients can book, with the app price (fee + commission) */
export const listBookableDoctors = async () => {
  const s = await getMarketplaceSettings();
  const now = new Date();
  const doctors = await Doctor.find({ isActive: true, planValidUntil: { $gt: now }, feeInr: { $gt: 0 } }).sort({ createdAt: 1 }).lean<IDoctor[]>();
  return doctors
    .filter((d) => isDoctorBookable(d, now))
    .map((d) => {
      const price = priceForFee(d.feeInr, s.commissionPercent);
      return { ...doctorCard(d), price: paiseToRupees(price.totalPaise) };
    });
};

/** Free and taken times of one doctor on one India date */
export const doctorSlots = async (doctorId: string, dateKey: string) => {
  const s = await getMarketplaceSettings();
  const doctor = await Doctor.findById(doctorId).lean<IDoctor>();
  const now = new Date();
  if (!doctor || !isDoctorBookable(doctor, now)) throw new AppError(404, 'This doctor is not taking bookings right now.', 'doctor_unavailable');
  const today = istDateKey(now);
  if (dateKey < today || dateKey > addDaysToKey(today, s.bookingDaysAhead)) return { date: dateKey, slots: [] };

  const slots = slotsForDate(doctor.availability, dateKey, doctor.consultMinutes, s.slotGapMinutes).filter(
    (slot) => !doctor.planValidUntil || slot.end <= doctor.planValidUntil
  );
  if (!slots.length) return { date: dateKey, slots: [] };
  await expireOldHolds({ doctor: doctor._id }, now);
  const taken = await Booking.find({
    doctor: doctor._id,
    slotLock: true,
    slotStart: { $gte: slots[0].start, $lte: slots[slots.length - 1].start },
  })
    .select('slotStart')
    .lean();
  const takenSet = new Set(taken.map((b) => b.slotStart.getTime()));
  const earliest = now.getTime() + s.minLeadMinutes * 60_000;
  return {
    date: dateKey,
    slots: slots.map((slot) => ({
      start: slot.start,
      end: slot.end,
      available: !takenSet.has(slot.start.getTime()) && slot.start.getTime() >= earliest,
      // Free follow-ups may be booked closer to the time (no payment to verify)
      availableForFollowUp: !takenSet.has(slot.start.getTime()) && slot.start.getTime() >= now.getTime() + 10 * 60_000,
    })),
  };
};

/* -------------------------------------------------------------------------- */
/* BANK DETAILS (doctor writes, admin reads)                                  */
/* -------------------------------------------------------------------------- */
export const BankSchema = z
  .object({
    accountName: z.string().trim().min(2).max(80),
    accountNumber: z.string().trim().regex(/^\d{9,18}$/, 'Account number must be 9 to 18 digits').or(z.literal('')),
    ifsc: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'IFSC looks wrong (e.g. SBIN0001234)')
      .or(z.literal('')),
    bankName: z.string().trim().max(80).default(''),
    upiId: z
      .string()
      .trim()
      .regex(/^[a-zA-Z0-9._-]{2,64}@[a-zA-Z]{2,64}$/, 'UPI id looks wrong (e.g. name@okaxis)')
      .or(z.literal('')),
  })
  .refine((v) => (v.accountNumber && v.ifsc) || v.upiId, 'Add a bank account with IFSC, or a UPI id');

export type BankDetails = z.infer<typeof BankSchema>;

const bankHintOf = (b: BankDetails) =>
  [b.accountNumber ? `A/c ••••${b.accountNumber.slice(-4)} · ${b.ifsc}` : '', b.upiId ? `UPI ${b.upiId.replace(/^(.{2}).*(@.*)$/, '$1•••$2')}` : '']
    .filter(Boolean)
    .join(' · ');

export const saveBankDetails = async (doctor: IDoctor, input: BankDetails) => {
  await Doctor.updateOne(
    { _id: doctor._id },
    { $set: { bankEnc: encryptSecret(JSON.stringify(input), 'doctor-bank'), bankHint: bankHintOf(input), bankUpdatedAt: new Date() } }
  );
  return bankHintOf(input);
};

/** Full bank details for the admin's payout screen */
export const readBankDetails = async (doctorId: string): Promise<BankDetails | null> => {
  const doctor = await Doctor.findById(doctorId).select('+bankEnc').lean();
  if (!doctor) throw new AppError(404, 'Doctor not found.');
  if (!doctor.bankEnc) return null;
  try {
    return JSON.parse(decryptSecret(doctor.bankEnc, 'doctor-bank')) as BankDetails;
  } catch {
    throw new AppError(500, 'Could not read the bank details (server key changed?).');
  }
};

/* -------------------------------------------------------------------------- */
/* ADMIN                                                                      */
/* -------------------------------------------------------------------------- */
const feeField = z
  .number()
  .int()
  .min(10, 'Minimum fee is ₹10')
  .max(20000)
  .refine((v) => v % 10 === 0, 'Fee must be a multiple of ₹10');

export const DoctorProfileSchema = z.object({
  name: z.string().trim().min(2).max(60),
  email: EmailSchema,
  qualification: z.string().trim().min(2).max(80),
  specialization: z.string().trim().min(2).max(60),
  registrationNumber: z.string().trim().min(3).max(40),
  registrationCouncil: z.string().trim().min(3).max(80),
  experienceYears: z.number().int().min(0).max(70).default(0),
  about: z.string().trim().max(300).default(''),
  languages: z.array(z.string().trim().min(2).max(20)).max(8).default([]),
  avatarColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#0E7490'),
  feeInr: feeField,
  consultMinutes: z.number().int().min(10).max(30).default(15),
});

export const PlanPaymentSchema = z.object({
  amountInr: z.number().min(0).max(1000000),
  utr: z.string().trim().max(40).default(''),
  /** Valid until this India date (inclusive); default one year from now or from the current end */
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const CreateDoctorSchema = DoctorProfileSchema.extend({ plan: PlanPaymentSchema });

export const UpdateDoctorSchema = DoctorProfileSchema.partial().extend({
  isActive: z.boolean().optional(),
  availability: AvailabilityInputSchema.optional(),
});

const planEnd = (validUntil: string | undefined, currentEnd: Date | null): Date => {
  if (validUntil) return new Date(`${validUntil}T23:59:59+05:30`);
  const base = currentEnd && currentEnd.getTime() > Date.now() ? currentEnd : new Date();
  return new Date(base.getTime() + 365 * DAY_MS);
};

export const adminDoctorView = (d: IDoctor) => ({
  ...doctorCard(d),
  doctorCode: d.doctorCode,
  email: d.email,
  feeInr: d.feeInr,
  requestedFeeInr: d.requestedFeeInr,
  availability: d.availability,
  planValidUntil: d.planValidUntil,
  planPayments: d.planPayments,
  bankHint: d.bankHint,
  bankUpdatedAt: d.bankUpdatedAt,
  bankChanged: Boolean(d.bankUpdatedAt && (!d.bankReviewedAt || d.bankUpdatedAt > d.bankReviewedAt)),
  isActive: d.isActive,
  mustChangePassword: d.mustChangePassword,
  termsAcceptedAt: d.termsAcceptedAt,
  lastLoginAt: d.lastLoginAt,
  bookable: isDoctorBookable(d),
  createdAt: d.createdAt,
});

export const createDoctor = async (adminEmail: string, input: z.infer<typeof CreateDoctorSchema>) => {
  if (await Doctor.exists({ email: input.email })) throw new AppError(409, 'A doctor with this email already exists.', 'email_taken');
  const password = generateTempPassword();
  const validUntil = planEnd(input.plan.validUntil, null);
  const { plan, ...profile } = input;
  const doctor = await Doctor.create({
    ...profile,
    doctorCode: await generateDoctorCode(),
    password,
    mustChangePassword: true,
    planValidUntil: validUntil,
    planPayments: [{ amountInr: plan.amountInr, utr: plan.utr, paidOn: new Date(), validUntil, recordedBy: adminEmail }],
  });
  // The temporary password is returned once, for the admin to share; it is never stored in plain text
  return { doctor, password };
};

export const updateDoctor = async (doctorId: string, input: z.infer<typeof UpdateDoctorSchema>) => {
  const doctor = await Doctor.findById(doctorId);
  if (!doctor) throw new AppError(404, 'Doctor not found.');
  if (input.email && input.email !== doctor.email && (await Doctor.exists({ email: input.email }))) {
    throw new AppError(409, 'A doctor with this email already exists.', 'email_taken');
  }
  const { availability, ...rest } = input;
  Object.assign(doctor, rest);
  if (availability) doctor.availability = cleanAvailability(availability);
  if (input.feeInr !== undefined && doctor.requestedFeeInr === input.feeInr) doctor.requestedFeeInr = null;
  // Turning a doctor off also ends their open logins
  if (input.isActive === false) doctor.tokenVersion += 1;
  await doctor.save();
  return doctor;
};

export const recordPlanPayment = async (adminEmail: string, doctorId: string, input: z.infer<typeof PlanPaymentSchema>) => {
  const doctor = await Doctor.findById(doctorId);
  if (!doctor) throw new AppError(404, 'Doctor not found.');
  const validUntil = planEnd(input.validUntil, doctor.planValidUntil);
  doctor.planValidUntil = validUntil;
  doctor.planPayments.push({ amountInr: input.amountInr, utr: input.utr, paidOn: new Date(), validUntil, recordedBy: adminEmail });
  await doctor.save();
  return doctor;
};

export const resetDoctorPassword = async (doctorId: string) => {
  const doctor = await Doctor.findById(doctorId).select('+password');
  if (!doctor) throw new AppError(404, 'Doctor not found.');
  const password = generateTempPassword();
  doctor.password = password;
  doctor.mustChangePassword = true;
  doctor.tokenVersion += 1;
  await doctor.save();
  return { doctor, password };
};

export const decideFeeRequest = async (doctorId: string, approve: boolean) => {
  const doctor = await Doctor.findById(doctorId);
  if (!doctor) throw new AppError(404, 'Doctor not found.');
  if (doctor.requestedFeeInr === null) throw new AppError(409, 'There is no fee change request.', 'no_request');
  if (approve) doctor.feeInr = doctor.requestedFeeInr;
  doctor.requestedFeeInr = null;
  await doctor.save();
  return doctor;
};

export const FeeRequestSchema = z.object({ feeInr: feeField });
