import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import {
  bearer,
  confirmedBooking,
  createAdmin,
  createReadyDoctor,
  freeSlot,
  loginPatient,
  nextUtr,
  outbox,
  startApp,
  startBookingNow,
  stopApp,
  PATIENT_INFO,
} from './helpers.js';

let app: Express;
let admin: { token: string };
let doctor: Awaited<ReturnType<typeof createReadyDoctor>>;

beforeAll(async () => {
  app = await startApp();
  admin = await createAdmin(app);
  doctor = await createReadyDoctor(app, admin.token);
});
afterAll(stopApp);

const docSend = (id: string, text: string, token = doctor.token) => request(app).post(`/api/doctor/bookings/${id}/messages`).set(bearer(token)).send({ text });
const patSend = (token: string, id: string, text: string) => request(app).post(`/api/patient/bookings/${id}/messages`).set(bearer(token)).send({ text });
const patBooking = async (token: string, id: string) => (await request(app).get(`/api/patient/bookings/${id}`).set(bearer(token))).body.data;
const setFields = async (id: string, fields: Record<string, unknown>) => {
  const { Booking } = await import('../src/models/Booking.js');
  await Booking.updateOne({ publicId: id }, { $set: fields });
};

describe('a full paid consultation', () => {
  it('runs: doctor starts → patient replies → report → earnings', async () => {
    const patient = await loginPatient(app);
    const id = await confirmedBooking(app, patient.token, admin.token, doctor.id, 0);

    // Before the time, nobody can start
    expect((await docSend(id, 'Hello')).body.code).toBe('too_early');
    await startBookingNow(id, 0);
    // The patient cannot write before the doctor starts the chat
    expect((await patSend(patient.token, id, 'I am here')).body.code).toBe('wait_for_doctor');

    const first = await docSend(id, 'Namaste, I am your doctor. What is the problem?');
    expect(first.status).toBe(201);
    expect(first.body.data.state.status).toBe('in_progress');
    expect(first.body.data.state.replyBy).toBeTruthy();

    expect((await patSend(patient.token, id, 'Fever since 2 days, 101 F')).status).toBe(201);
    const msgs = await request(app).get(`/api/doctor/bookings/${id}/messages?after=0`).set(bearer(doctor.token));
    expect(msgs.body.data.messages.map((m: { from: string }) => m.from)).toEqual(['doctor', 'patient']);

    const report = await request(app)
      .post(`/api/doctor/bookings/${id}/report`)
      .set(bearer(doctor.token))
      .send({
        diagnosis: 'Viral fever',
        advice: 'Rest and fluids',
        medicines: [{ name: 'Paracetamol 500 mg', dose: '1 tablet', frequency: 'Every 6 hours if fever', duration: '3 days' }],
        tests: ['CBC if fever stays beyond 3 days'],
      });
    expect(report.status).toBe(200);
    expect(report.body.data.status).toBe('completed');
    expect(report.body.data.earnings.amount).toBe(500);

    // Only the patient (and the doctor) can read the report; the email never contains it
    const view = await patBooking(patient.token, id);
    expect(view.report.diagnosis).toBe('Viral fever');
    expect(view.report.doctor.registrationNumber).toMatch(/^REG-/);
    const stranger = await loginPatient(app);
    expect((await request(app).get(`/api/patient/bookings/${id}`).set(bearer(stranger.token))).status).toBe(404);
    const mail = outbox.find((m) => m.to === patient.email && /report/i.test(m.subject));
    expect(mail).toBeTruthy();
    expect(mail!.text).not.toContain('Viral fever');

    // Reports cannot be sent twice, and the chat is closed now
    expect((await request(app).post(`/api/doctor/bookings/${id}/report`).set(bearer(doctor.token)).send({ diagnosis: 'Changed' })).status).toBe(409);
    await new Promise((resolve) => setTimeout(resolve, 1100)); // stay under the 2-messages-per-second limit
    expect((await patSend(patient.token, id, 'one more question')).status).toBe(409);

    const { Booking } = await import('../src/models/Booking.js');
    const stored = await Booking.findOne({ publicId: id }).lean();
    expect(stored!.earnings).toMatchObject({ doctorPaise: 50000, adminPaise: 5000 });
  });
});

describe('keeping money and contacts inside VaidyaCure', () => {
  it('hides phone numbers, emails, UPI ids and account numbers, and flags them for the admin', async () => {
    const patient = await loginPatient(app);
    const id = await confirmedBooking(app, patient.token, admin.token, doctor.id, 1);
    await startBookingNow(id, 0);
    await docSend(id, 'Hello, tell me your problem');
    await patSend(patient.token, id, 'Call me on 9876543210 or pay to ravi@okaxis, mail ravi@gmail.com, a/c 123456789012');
    const seen = await request(app).get(`/api/doctor/bookings/${id}/messages?after=0`).set(bearer(doctor.token));
    const text = seen.body.data.messages[1].text;
    expect(text).not.toContain('9876543210');
    expect(text).not.toContain('ravi@okaxis');
    expect(text).not.toContain('ravi@gmail.com');
    expect(text).not.toContain('123456789012');
    expect(JSON.stringify(seen.body)).not.toMatch(/original|flags/);

    // The admin's safety log has the original text and the flags, and records who opened it
    const log = await request(app).get(`/api/admin/market/chats/${id}`).set(bearer(admin.token));
    expect(log.status).toBe(200);
    expect(log.body.data.messages[1].text).toContain('9876543210');
    expect(log.body.data.messages[1].flags).toEqual(expect.arrayContaining(['phone', 'upi', 'email', 'payment_words']));
    const { AuditLog } = await import('../src/models/AuditLog.js');
    expect(await AuditLog.exists({ action: 'chat.view', target: id })).toBeTruthy();
    // Neither the patient nor the doctor can open the safety log
    expect((await request(app).get(`/api/admin/market/chats/${id}`).set(bearer(doctor.token))).status).toBe(401);
    expect((await request(app).get(`/api/admin/market/chats/${id}`).set(bearer(patient.token))).status).toBe(401);
  });

  it('limits message length and speed', async () => {
    const patient = await loginPatient(app);
    const id = await confirmedBooking(app, patient.token, admin.token, doctor.id, 2);
    await startBookingNow(id, 0);
    expect((await docSend(id, 'x'.repeat(1001))).status).toBe(400);
    await docSend(id, 'Hello');
    const burst = await Promise.all(Array.from({ length: 6 }, (_, i) => patSend(patient.token, id, `msg ${i}`)));
    expect(burst.some((r) => r.status === 429)).toBe(true);
  });
});

describe('no-shows and refunds', () => {
  it('doctor did not start within 5 minutes → full refund of ₹550 within 24 hours', async () => {
    const patient = await loginPatient(app);
    const id = await confirmedBooking(app, patient.token, admin.token, doctor.id, 3);
    await startBookingNow(id, 6);
    const view = await patBooking(patient.token, id);
    expect(view.status).toBe('doctor_no_show');
    expect(view.refund).toMatchObject({ status: 'due', amount: 550, reason: 'doctor_no_show' });
    expect((await docSend(id, 'Sorry I am late')).status).toBe(409);
    expect(outbox.some((m) => m.to === patient.email && /did not join/i.test(m.subject))).toBe(true);

    // Admin pays the refund back with a UTR (once)
    const refunds = await request(app).get('/api/admin/market/refunds').set(bearer(admin.token));
    const row = refunds.body.data.find((r: { id: string }) => r.id === id);
    expect(row.refundTo).toBe('ravi@okaxis');
    const paid = await request(app).post(`/api/admin/market/refunds/${id}/paid`).set(bearer(admin.token)).send({ utr: nextUtr() });
    expect(paid.status).toBe(200);
    expect((await request(app).post(`/api/admin/market/refunds/${id}/paid`).set(bearer(admin.token)).send({ utr: nextUtr() })).status).toBe(409);
    expect((await patBooking(patient.token, id)).refund.status).toBe('paid');
  });

  it('patient did not reply within 5 minutes → 30% kept (₹16.50 admin, ₹148.50 doctor), ₹385 refunded', async () => {
    const patient = await loginPatient(app);
    const id = await confirmedBooking(app, patient.token, admin.token, doctor.id, 4);
    await startBookingNow(id, 1);
    await docSend(id, 'Hello, are you there?');
    await setFields(id, { replyBy: new Date(Date.now() - 1000) });
    const view = await patBooking(patient.token, id);
    expect(view.status).toBe('patient_no_show');
    expect(view.refund).toMatchObject({ status: 'due', amount: 385, reason: 'patient_no_show' });
    const { Booking } = await import('../src/models/Booking.js');
    const stored = await Booking.findOne({ publicId: id }).lean();
    expect(stored!.earnings).toMatchObject({ doctorPaise: 14850, adminPaise: 1650 });
    expect((await patSend(patient.token, id, 'sorry I was late')).status).toBe(409);
  });

  it('the scheduler and many parallel reads apply a no-show exactly once', async () => {
    const patient = await loginPatient(app);
    const id = await confirmedBooking(app, patient.token, admin.token, doctor.id, 5);
    await startBookingNow(id, 7);
    const before = outbox.length;
    await Promise.all([
      ...Array.from({ length: 5 }, () => request(app).get(`/api/patient/bookings/${id}`).set(bearer(patient.token))),
      request(app).get('/api/cron/tick').set(bearer('test-cron-secret-0123456789')),
    ]);
    const mails = outbox.slice(before).filter((m) => m.to === patient.email && /did not join/i.test(m.subject));
    expect(mails).toHaveLength(1);
  });

  it('an unverified payment at slot time expires and is listed as a refund to check', async () => {
    const patient = await loginPatient(app);
    const slotStart = await freeSlot(app, doctor.id, 6);
    const created = await request(app).post('/api/patient/bookings').set(bearer(patient.token)).send({ doctorId: doctor.id, slotStart, patient: PATIENT_INFO });
    const id = created.body.data.booking.id;
    await request(app).post(`/api/patient/bookings/${id}/payment`).set(bearer(patient.token)).send({ utr: nextUtr(), payerUpi: 'ravi@okaxis' });
    await startBookingNow(id, 0);
    const view = await patBooking(patient.token, id);
    expect(view.status).toBe('expired');
    expect(view.refund).toMatchObject({ status: 'due', reason: 'not_verified' });
    expect((await request(app).post(`/api/admin/market/payments/bookings/${id}/approve`).set(bearer(admin.token)).send({})).status).toBe(409);
    expect((await request(app).post(`/api/admin/market/refunds/${id}/dismiss`).set(bearer(admin.token)).send({})).status).toBe(200);
  });
});

describe('free follow-ups (3 within 120 hours, same doctor)', () => {
  it('allows exactly 3 free follow-ups and only for the patient who paid', async () => {
    const patient = await loginPatient(app);
    const id = await confirmedBooking(app, patient.token, admin.token, doctor.id, 7);
    await startBookingNow(id, 0);
    await docSend(id, 'Hello');
    await patSend(patient.token, id, 'Cough');
    await request(app).post(`/api/doctor/bookings/${id}/report`).set(bearer(doctor.token)).send({ diagnosis: 'Common cold' });
    const done = await patBooking(patient.token, id);
    expect(done.followUps).toMatchObject({ used: 0, limit: 3 });

    // Someone else cannot use this consultation for a free follow-up
    const stranger = await loginPatient(app);
    const s0 = await freeSlot(app, doctor.id, 8);
    const steal = await request(app).post('/api/patient/bookings').set(bearer(stranger.token)).send({ doctorId: doctor.id, slotStart: s0, patient: PATIENT_INFO, followUpOf: id });
    expect(steal.status).toBe(400);
    // Nor with another doctor
    const other = await createReadyDoctor(app, admin.token);
    const sOther = await freeSlot(app, other.id, 0);
    expect(
      (await request(app).post('/api/patient/bookings').set(bearer(patient.token)).send({ doctorId: other.id, slotStart: sOther, patient: PATIENT_INFO, followUpOf: id })).status
    ).toBe(400);

    // Four parallel requests: three succeed free of charge, the fourth is refused
    const slots = await Promise.all([9, 10, 11, 12].map((i) => freeSlot(app, doctor.id, i)));
    const results = await Promise.all(
      slots.map((slotStart) =>
        request(app).post('/api/patient/bookings').set(bearer(patient.token)).send({ doctorId: doctor.id, slotStart, patient: PATIENT_INFO, followUpOf: id })
      )
    );
    const ok = results.filter((r) => r.status === 201);
    expect(ok).toHaveLength(3);
    ok.forEach((r) => {
      expect(r.body.data.booking.status).toBe('confirmed');
      expect(r.body.data.booking.price.total).toBe(0);
    });
    expect(results.filter((r) => r.status === 409)).toHaveLength(1);

    // After 120 hours no new free follow-up is possible
    await setFields(id, { followUpsUsed: 0, chatEndedAt: new Date(Date.now() - 121 * 3_600_000) });
    const late = await request(app)
      .post('/api/patient/bookings')
      .set(bearer(patient.token))
      .send({ doctorId: doctor.id, slotStart: await freeSlot(app, doctor.id, 13), patient: PATIENT_INFO, followUpOf: id });
    expect(late.status).toBe(409);
  });

  it('the doctor sees the earlier chat and report in a follow-up', async () => {
    const patient = await loginPatient(app);
    const id = await confirmedBooking(app, patient.token, admin.token, doctor.id, 14);
    await startBookingNow(id, 0);
    await docSend(id, 'Hello');
    await patSend(patient.token, id, 'Headache');
    await request(app).post(`/api/doctor/bookings/${id}/report`).set(bearer(doctor.token)).send({ diagnosis: 'Tension headache' });
    const follow = await request(app)
      .post('/api/patient/bookings')
      .set(bearer(patient.token))
      .send({ doctorId: doctor.id, slotStart: await freeSlot(app, doctor.id, 15), patient: PATIENT_INFO, followUpOf: id });
    const detail = await request(app).get(`/api/doctor/bookings/${follow.body.data.booking.id}`).set(bearer(doctor.token));
    expect(detail.status).toBe(200);
    const first = detail.body.data.thread.find((t: { id: string }) => t.id === id);
    expect(first.report.diagnosis).toBe('Tension headache');
    expect(first.messages.length).toBe(2);
  });
});

describe('weekly payouts', () => {
  it('pays only finished weeks, links earnings to the payout, and never pays twice', async () => {
    const doc2 = await createReadyDoctor(app, admin.token);
    const patient = await loginPatient(app);
    const id = await confirmedBooking(app, patient.token, admin.token, doc2.id, 0);
    await startBookingNow(id, 0);
    await docSend(id, 'Hello', doc2.token);
    await patSend(patient.token, id, 'Back pain');
    await request(app).post(`/api/doctor/bookings/${id}/report`).set(bearer(doc2.token)).send({ diagnosis: 'Muscle strain' });

    // Current week: not payable yet
    expect((await request(app).post(`/api/admin/market/payouts/${doc2.id}/settle`).set(bearer(admin.token)).send({ utr: 'UTR123456' })).status).toBe(409);
    await setFields(id, { 'earnings.weekStart': '2026-01-05' });
    const overview = await request(app).get('/api/admin/market/payouts').set(bearer(admin.token));
    expect(overview.body.data.doctors.find((d: { doctorId: string }) => d.doctorId === doc2.id).payable).toBe(500);

    // A doctor cannot mark their own payout as paid
    expect((await request(app).post(`/api/admin/market/payouts/${doc2.id}/settle`).set(bearer(doc2.token)).send({ utr: 'UTR123456' })).status).toBe(401);
    const [a, b] = await Promise.all([
      request(app).post(`/api/admin/market/payouts/${doc2.id}/settle`).set(bearer(admin.token)).send({ utr: 'UTR123456' }),
      request(app).post(`/api/admin/market/payouts/${doc2.id}/settle`).set(bearer(admin.token)).send({ utr: 'UTR123457' }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses[0]).toBe(200);
    expect(statuses[1]).toBe(409);
    const ok = a.status === 200 ? a : b;
    expect(ok.body.data.amount).toBe(500);

    const earnings = await request(app).get('/api/doctor/earnings').set(bearer(doc2.token));
    expect(earnings.body.data.totals).toMatchObject({ earned: 500, settled: 500, pending: 0 });
    expect(earnings.body.data.settlements[0].utr).toMatch(/^UTR12345/);
    expect(outbox.some((m) => m.to === doc2.email && /payout/i.test(m.subject))).toBe(true);
  });
});

describe('bank details', () => {
  it('are encrypted at rest, masked for the doctor, and readable only by the admin (audited)', async () => {
    const res = await request(app)
      .put('/api/doctor/bank')
      .set(bearer(doctor.token))
      .send({ accountName: 'Dr Test', accountNumber: '998877665544', ifsc: 'SBIN0001234', bankName: 'SBI', upiId: 'drtest@oksbi' });
    expect(res.status).toBe(200);
    expect(res.body.data.bankHint).toContain('••••5544');
    const { Doctor } = await import('../src/models/Doctor.js');
    const raw = await Doctor.findById(doctor.id).select('+bankEnc').lean();
    expect(JSON.stringify(raw)).not.toContain('998877665544');
    const me = await request(app).get('/api/doctor/me').set(bearer(doctor.token));
    expect(JSON.stringify(me.body)).not.toContain('998877665544');

    const full = await request(app).get(`/api/admin/market/doctors/${doctor.id}/bank`).set(bearer(admin.token));
    expect(full.body.data.accountNumber).toBe('998877665544');
    const { AuditLog } = await import('../src/models/AuditLog.js');
    expect(await AuditLog.exists({ action: 'doctor.bank_view', target: doctor.id })).toBeTruthy();
    expect((await request(app).get(`/api/admin/market/doctors/${doctor.id}/bank`).set(bearer(doctor.token))).status).toBe(401);
  });

  it('rejects wrong IFSC / account formats', async () => {
    const res = await request(app).put('/api/doctor/bank').set(bearer(doctor.token)).send({ accountName: 'Dr Test', accountNumber: '12', ifsc: 'WRONG', upiId: '' });
    expect(res.status).toBe(400);
  });
});

describe('fee changes', () => {
  it('a doctor can only request a new fee; the admin approves it', async () => {
    const doc3 = await createReadyDoctor(app, admin.token);
    expect((await request(app).post('/api/doctor/fee-request').set(bearer(doc3.token)).send({ feeInr: 555 })).status).toBe(400);
    expect((await request(app).post('/api/doctor/fee-request').set(bearer(doc3.token)).send({ feeInr: 700 })).status).toBe(200);
    expect((await request(app).get('/api/doctor/me').set(bearer(doc3.token))).body.data.feeInr).toBe(500);
    const ok = await request(app).post(`/api/admin/market/doctors/${doc3.id}/fee/approve`).set(bearer(admin.token)).send({});
    expect(ok.body.data.feeInr).toBe(700);
    const list = await request(app).get('/api/market/doctors?fresh=1');
    expect(list.body.data.find((d: { id: string }) => d.id === doc3.id).price).toBe(770);
  });
});

describe('admin dashboards and settings', () => {
  it('summary, earnings, lists and settings all respond correctly', async () => {
    const auth = bearer(admin.token);
    const summary = await request(app).get('/api/admin/market/summary').set(auth);
    expect(summary.status).toBe(200);
    expect(summary.body.data).toHaveProperty('paymentsToCheck');
    expect(summary.body.data).toHaveProperty('flaggedChats');
    for (const range of ['week', 'month', 'all']) {
      const e = await request(app).get(`/api/admin/market/earnings?range=${range}`).set(auth);
      expect(e.status, range).toBe(200);
      expect(e.body.data.income).toHaveProperty('total');
    }
    const all = await request(app).get('/api/admin/market/earnings?range=all').set(auth);
    expect(all.body.data.income.commission).toBeGreaterThan(0);
    for (const path of ['/bookings', '/bookings?status=completed&kind=real', '/payouts', '/chats', '/chats?flagged=1', '/refunds?status=paid', '/payments/topups?status=approved', '/doctors']) {
      expect((await request(app).get(`/api/admin/market${path}`).set(auth)).status, path).toBe(200);
    }

    const settings = await request(app).get('/api/admin/market/settings').set(auth);
    expect(settings.status).toBe(200);
    const next = { ...settings.body.data.settings, upiId: 'vaidyacure@okaxis', commissionPercent: 12 };
    const saved = await request(app).put('/api/admin/market/settings').set(auth).send(next);
    expect(saved.body.data.commissionPercent).toBe(12);
    expect((await request(app).put('/api/admin/market/settings').set(auth).send({ ...next, upiId: 'not a upi' })).status).toBe(400);
    const info = await request(app).get('/api/market/info?fresh=1');
    expect(info.body.data.payTo.upiId).toBe('vaidyacure@okaxis');
    await request(app).put('/api/admin/market/settings').set(auth).send({ ...next, commissionPercent: 10 });

    // SMTP password is stored encrypted and never returned
    const email = await request(app)
      .put('/api/admin/settings/email')
      .set(auth)
      .send({ enabled: true, host: 'smtp.gmail.com', port: 465, secure: true, user: 'sender@gmail.com', password: 'abcd efgh ijkl mnop', fromName: 'VaidyaCure', fromEmail: '' });
    expect(email.status).toBe(200);
    const after = await request(app).get('/api/admin/settings/email').set(auth);
    expect(after.body.data.hasPassword).toBe(true);
    expect(JSON.stringify(after.body)).not.toContain('abcdefghijklmnop');
    const { EmailSettings } = await import('../src/models/EmailSettings.js');
    const raw = await EmailSettings.findOne({ key: 'global' }).select('+pass').lean();
    expect(JSON.stringify(raw)).not.toContain('abcdefghijklmnop');

    // A cron key works once created, and only that key
    const key = await request(app).post('/api/admin/settings/cron-key').set(auth).send({});
    expect(key.body.data.key).toMatch(/^[a-f0-9]{48}$/);
    expect((await request(app).get(`/api/cron/tick?key=${key.body.data.key}`)).status).toBe(200);
    expect((await request(app).get(`/api/cron/tick?key=${'b'.repeat(48)}`)).status).toBe(401);
  });
});
