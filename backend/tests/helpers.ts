import crypto from 'crypto';
import type { Express } from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { MailInput } from '../src/services/email/mailer.js';

/**
 * Starts the real Express app against a throw-away in-memory MongoDB, with
 * emails captured in `outbox` and every outside network call blocked, so no
 * test can ever reach the production database, send an email or call a paid AI.
 */
export const outbox: MailInput[] = [];
let replset: MongoMemoryReplSet | null = null;

export const startApp = async (): Promise<Express> => {
  replset = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  Object.assign(process.env, {
    NODE_ENV: 'test',
    MONGODB_URI: replset.getUri('vaidyacure_test'),
    JWT_SECRET: `test-${crypto.randomBytes(24).toString('hex')}`,
    CONFIG_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'),
    // Defined (empty) so the project's .env file cannot fill them in
    LLM_BASE_URL: '',
    LLM_API_KEY: '',
    CRON_SECRET: 'test-cron-secret-0123456789',
  });
  delete process.env.VERCEL;

  // Safety net: nothing may leave this machine during tests
  globalThis.fetch = (async (url: unknown) => {
    throw new Error(`Network access is disabled in tests (${String(url)})`);
  }) as typeof fetch;

  const { default: app } = await import('../src/server.js');
  const { useTestOutbox } = await import('../src/services/email/mailer.js');
  const { connectDB } = await import('../src/config/db.js');
  useTestOutbox(outbox);
  await connectDB();
  // Unique indexes must exist before the race-condition tests run
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  return app;
};

export const stopApp = async () => {
  await mongoose.disconnect();
  await replset?.stop();
};

/** The newest 6-digit login code emailed to this address (the admin can change the email's wording) */
export const lastCodeFor = (email: string): string | null => {
  const mail = [...outbox].reverse().find((m) => m.to === email && /\b\d{6}\b/.test(m.text));
  return mail?.text.match(/\b(\d{6})\b/)?.[1] ?? null;
};

/* -------------------------------------------------------------------------- */
/* ACCOUNTS                                                                   */
/* -------------------------------------------------------------------------- */
export const createAdmin = async (app: Express, role: 'superadmin' | 'moderator' | 'editor' | 'viewer' = 'superadmin') => {
  const { Admin } = await import('../src/models/Admin.js');
  const email = `${role}-${crypto.randomBytes(4).toString('hex')}@test.in`;
  await Admin.create({ name: `Test ${role}`, email, password: 'Admin-pass-123', role });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'Admin-pass-123' });
  if (res.status !== 200) throw new Error(`admin login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { email, token: res.body.token as string };
};

export const loginPatient = async (app: Express, email = `p-${crypto.randomBytes(4).toString('hex')}@test.in`) => {
  const deviceId = `device-${crypto.randomBytes(8).toString('hex')}`;
  const req = await request(app).post('/api/patient/auth/request-otp').set('X-Device-Id', deviceId).send({ email });
  if (req.status !== 200) throw new Error(`otp request failed: ${req.status} ${JSON.stringify(req.body)}`);
  const code = lastCodeFor(email);
  const res = await request(app).post('/api/patient/auth/verify-otp').set('X-Device-Id', deviceId).send({ email, code });
  if (res.status !== 200) throw new Error(`otp verify failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { email, deviceId, token: res.body.data.token as string, id: res.body.data.patient.id as string };
};

export const ALL_WEEK = {
  weekly: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, start: '00:00', end: '23:59' })),
  daysOff: [],
};

/** A real doctor created by the admin, logged in, password changed, terms accepted, hours set */
export const createReadyDoctor = async (app: Express, adminToken: string, overrides: Record<string, unknown> = {}) => {
  const suffix = crypto.randomBytes(4).toString('hex');
  const created = await request(app)
    .post('/api/admin/market/doctors')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      name: `Dr Test ${suffix}`,
      email: `doctor-${suffix}@test.in`,
      qualification: 'MBBS, MD',
      specialization: 'General Physician',
      registrationNumber: `REG-${suffix}`,
      registrationCouncil: 'Bihar Medical Council',
      feeInr: 500,
      consultMinutes: 15,
      plan: { amountInr: 1000, utr: '123456789012' },
      ...overrides,
    });
  if (created.status !== 201) throw new Error(`doctor create failed: ${created.status} ${JSON.stringify(created.body)}`);
  const { login, doctor } = created.body.data;
  const first = await request(app).post('/api/auth/login').send({ email: login.doctorCode, password: login.password });
  if (first.status !== 200 || first.body.accountType !== 'doctor') throw new Error(`doctor login failed: ${JSON.stringify(first.body)}`);
  const newPassword = 'Doctor-pass-456';
  const changed = await request(app)
    .post('/api/doctor/auth/change-password')
    .set('Authorization', `Bearer ${first.body.token}`)
    .send({ currentPassword: login.password, newPassword });
  const token = changed.body.token as string;
  await request(app).post('/api/doctor/auth/accept-terms').set('Authorization', `Bearer ${token}`).send({});
  const hours = await request(app).put('/api/doctor/availability').set('Authorization', `Bearer ${token}`).send(ALL_WEEK);
  if (hours.status !== 200) throw new Error(`availability failed: ${JSON.stringify(hours.body)}`);
  return { id: doctor.id as string, code: login.doctorCode as string, email: login.email as string, password: newPassword, token };
};

/** Tomorrow (India) is always more than the minimum lead time away */
export const tomorrowKey = () => new Date(Date.now() + 330 * 60_000 + 86_400_000).toISOString().slice(0, 10);

export const freeSlot = async (app: Express, doctorId: string, index = 0) => {
  const res = await request(app).get(`/api/market/doctors/${doctorId}/slots?date=${tomorrowKey()}&fresh=1`);
  const free = (res.body.data?.slots ?? []).filter((s: { available: boolean }) => s.available);
  if (!free[index]) throw new Error(`no free slot: ${JSON.stringify(res.body).slice(0, 300)}`);
  return free[index].start as string;
};

export const PATIENT_INFO = {
  name: 'Ravi Kumar',
  age: 30,
  gender: 'male',
  heightCm: 172,
  weightKg: 70,
  pregnancy: 'not_applicable',
  problem: 'Fever and body pain since 2 days',
};

let utrCounter = 100000000000 + Math.floor(Math.random() * 1000000);
export const nextUtr = () => String(utrCounter++);

/** Booking → UTR → admin approval: a confirmed paid booking */
export const confirmedBooking = async (app: Express, patientToken: string, adminToken: string, doctorId: string, slotIndex = 0) => {
  const slotStart = await freeSlot(app, doctorId, slotIndex);
  const created = await request(app)
    .post('/api/patient/bookings')
    .set('Authorization', `Bearer ${patientToken}`)
    .send({ doctorId, slotStart, patient: PATIENT_INFO });
  if (created.status !== 201) throw new Error(`booking failed: ${created.status} ${JSON.stringify(created.body)}`);
  const id = created.body.data.booking.id as string;
  const paid = await request(app)
    .post(`/api/patient/bookings/${id}/payment`)
    .set('Authorization', `Bearer ${patientToken}`)
    .send({ utr: nextUtr(), payerUpi: 'ravi@okaxis' });
  if (paid.status !== 200) throw new Error(`payment failed: ${JSON.stringify(paid.body)}`);
  const ok = await request(app).post(`/api/admin/market/payments/bookings/${id}/approve`).set('Authorization', `Bearer ${adminToken}`).send({});
  if (ok.status !== 200) throw new Error(`approve failed: ${JSON.stringify(ok.body)}`);
  return id;
};

/** Moves a booking's time so that it starts `minutesAgo` minutes ago (tests cannot wait for real time) */
export const startBookingNow = async (publicId: string, minutesAgo = 0) => {
  const { Booking } = await import('../src/models/Booking.js');
  const b = await Booking.findOne({ publicId });
  if (!b) throw new Error('booking not found');
  const start = new Date(Date.now() - minutesAgo * 60_000);
  await Booking.updateOne({ _id: b._id }, { $set: { slotStart: start, slotEnd: new Date(start.getTime() + b.consultMinutes * 60_000) } });
};

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
