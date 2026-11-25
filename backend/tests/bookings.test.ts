import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import {
  PATIENT_INFO,
  bearer,
  confirmedBooking,
  createAdmin,
  createReadyDoctor,
  freeSlot,
  loginPatient,
  nextUtr,
  outbox,
  startApp,
  stopApp,
} from './helpers.js';

let app: Express;
let admin: { token: string };
let doctor: Awaited<ReturnType<typeof createReadyDoctor>>;
let otherDoctor: Awaited<ReturnType<typeof createReadyDoctor>>;
let alice: Awaited<ReturnType<typeof loginPatient>>;
let bob: Awaited<ReturnType<typeof loginPatient>>;

beforeAll(async () => {
  app = await startApp();
  admin = await createAdmin(app);
  doctor = await createReadyDoctor(app, admin.token);
  otherDoctor = await createReadyDoctor(app, admin.token);
  alice = await loginPatient(app);
  bob = await loginPatient(app);
});
afterAll(stopApp);

const book = (token: string, body: Record<string, unknown>) => request(app).post('/api/patient/bookings').set(bearer(token)).send(body);

describe('booking a real doctor', () => {
  it('shows the doctor with the app price (fee + 10% commission) and no private details', async () => {
    const res = await request(app).get('/api/market/doctors?fresh=1');
    const d = res.body.data.find((x: { id: string }) => x.id === doctor.id);
    expect(d.price).toBe(550);
    const json = JSON.stringify(res.body);
    expect(json).not.toContain(doctor.email);
    expect(json).not.toMatch(/bank|password|tokenVersion/i);
  });

  it('takes the price from the server, never from the request', async () => {
    const slotStart = await freeSlot(app, doctor.id);
    const res = await book(alice.token, { doctorId: doctor.id, slotStart, patient: PATIENT_INFO, price: { totalPaise: 1 }, totalInr: 1, status: 'confirmed' });
    expect(res.status).toBe(201);
    expect(res.body.data.booking.price).toEqual({ fee: 500, commission: 50, total: 550 });
    expect(res.body.data.booking.status).toBe('awaiting_payment');
  });

  it('only accepts real free slots that are far enough ahead', async () => {
    const slotStart = await freeSlot(app, doctor.id, 1);
    const offGrid = new Date(new Date(slotStart).getTime() + 7 * 60_000).toISOString();
    expect((await book(alice.token, { doctorId: doctor.id, slotStart: offGrid, patient: PATIENT_INFO })).status).toBe(400);
    const past = new Date(Date.now() - 3_600_000).toISOString();
    expect((await book(alice.token, { doctorId: doctor.id, slotStart: past, patient: PATIENT_INFO })).status).toBe(400);
    expect((await book(alice.token, { doctorId: 'x'.repeat(24), slotStart, patient: PATIENT_INFO })).status).toBe(400);
  });

  it('lets only one of many simultaneous patients take the same slot', async () => {
    const slotStart = await freeSlot(app, doctor.id, 2);
    const patients = await Promise.all(Array.from({ length: 6 }, () => loginPatient(app)));
    const results = await Promise.all(patients.map((p) => book(p.token, { doctorId: doctor.id, slotStart, patient: PATIENT_INFO })));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(5);
  });

  it('frees the slot again when the payment window runs out', async () => {
    const slotStart = await freeSlot(app, doctor.id, 3);
    const first = await book(alice.token, { doctorId: doctor.id, slotStart, patient: PATIENT_INFO });
    expect(first.status).toBe(201);
    expect((await book(bob.token, { doctorId: doctor.id, slotStart, patient: PATIENT_INFO })).status).toBe(409);
    const { Booking } = await import('../src/models/Booking.js');
    await Booking.updateOne({ publicId: first.body.data.booking.id }, { $set: { holdUntil: new Date(Date.now() - 1000) } });
    expect((await book(bob.token, { doctorId: doctor.id, slotStart, patient: PATIENT_INFO })).status).toBe(201);
    const pay = await request(app)
      .post(`/api/patient/bookings/${first.body.data.booking.id}/payment`)
      .set(bearer(alice.token))
      .send({ utr: nextUtr(), payerUpi: 'alice@okaxis' });
    expect(pay.status).toBe(409);
  });
});

describe('privacy between patients (IDOR)', () => {
  it("another patient cannot see, pay, cancel or chat on someone else's booking", async () => {
    const slotStart = await freeSlot(app, doctor.id, 4);
    const created = await book(alice.token, { doctorId: doctor.id, slotStart, patient: PATIENT_INFO });
    const id = created.body.data.booking.id;
    expect((await request(app).get(`/api/patient/bookings/${id}`).set(bearer(bob.token))).status).toBe(404);
    expect((await request(app).post(`/api/patient/bookings/${id}/payment`).set(bearer(bob.token)).send({ utr: nextUtr(), payerUpi: 'bob@okaxis' })).status).toBe(404);
    expect((await request(app).post(`/api/patient/bookings/${id}/cancel`).set(bearer(bob.token)).send({})).status).toBe(404);
    expect((await request(app).get(`/api/patient/bookings/${id}/messages`).set(bearer(bob.token))).status).toBe(404);
    expect((await request(app).post(`/api/patient/bookings/${id}/messages`).set(bearer(bob.token)).send({ text: 'hi' })).status).toBe(404);
    const list = await request(app).get('/api/patient/bookings').set(bearer(bob.token));
    expect(list.body.data.map((b: { id: string }) => b.id)).not.toContain(id);
  });
});

describe('UPI payments', () => {
  it('validates the UTR and never accepts the same UTR twice (bookings or wallet)', async () => {
    const [p1, p2] = await Promise.all([loginPatient(app), loginPatient(app)]);
    const s1 = await freeSlot(app, otherDoctor.id, 0);
    const s2 = await freeSlot(app, otherDoctor.id, 1);
    const b1 = await book(p1.token, { doctorId: otherDoctor.id, slotStart: s1, patient: PATIENT_INFO });
    const b2 = await book(p2.token, { doctorId: otherDoctor.id, slotStart: s2, patient: PATIENT_INFO });
    const pay = (token: string, id: string, utr: string, payerUpi = 'ravi@okaxis') =>
      request(app).post(`/api/patient/bookings/${id}/payment`).set(bearer(token)).send({ utr, payerUpi });
    expect((await pay(p1.token, b1.body.data.booking.id, '12345')).status).toBe(400);
    expect((await pay(p1.token, b1.body.data.booking.id, 'abcdefghijkl')).status).toBe(400);
    expect((await pay(p1.token, b1.body.data.booking.id, nextUtr(), 'not a upi id')).status).toBe(400);
    const utr = nextUtr();
    expect((await pay(p1.token, b1.body.data.booking.id, utr)).status).toBe(200);
    expect((await pay(p2.token, b2.body.data.booking.id, utr)).status).toBe(409);
    const topup = await request(app).post('/api/patient/wallet/topups').set(bearer(p2.token)).send({ amountInr: 100, utr });
    expect(topup.status).toBe(409);
  });

  it('only a super admin can confirm a payment, and only once', async () => {
    const p = await loginPatient(app);
    const slotStart = await freeSlot(app, otherDoctor.id, 2);
    const created = await book(p.token, { doctorId: otherDoctor.id, slotStart, patient: PATIENT_INFO });
    const id = created.body.data.booking.id;
    await request(app).post(`/api/patient/bookings/${id}/payment`).set(bearer(p.token)).send({ utr: nextUtr(), payerUpi: 'ravi@okaxis' });
    const moderator = await createAdmin(app, 'moderator');
    expect((await request(app).post(`/api/admin/market/payments/bookings/${id}/approve`).set(bearer(moderator.token)).send({})).status).toBe(403);
    expect((await request(app).post(`/api/admin/market/payments/bookings/${id}/approve`).set(bearer(otherDoctor.token)).send({})).status).toBe(401);
    expect((await request(app).post(`/api/admin/market/payments/bookings/${id}/approve`).set(bearer(p.token)).send({})).status).toBe(401);
    const [a, b] = await Promise.all([
      request(app).post(`/api/admin/market/payments/bookings/${id}/approve`).set(bearer(admin.token)).send({}),
      request(app).post(`/api/admin/market/payments/bookings/${id}/approve`).set(bearer(admin.token)).send({}),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
  });

  it('a rejected payment frees the slot and tells the patient', async () => {
    const [p, q] = await Promise.all([loginPatient(app), loginPatient(app)]);
    const slotStart = await freeSlot(app, otherDoctor.id, 3);
    const created = await book(p.token, { doctorId: otherDoctor.id, slotStart, patient: PATIENT_INFO });
    const id = created.body.data.booking.id;
    await request(app).post(`/api/patient/bookings/${id}/payment`).set(bearer(p.token)).send({ utr: nextUtr(), payerUpi: 'ravi@okaxis' });
    const rej = await request(app).post(`/api/admin/market/payments/bookings/${id}/reject`).set(bearer(admin.token)).send({ reason: 'No money received' });
    expect(rej.status).toBe(200);
    expect(rej.body.data.status).toBe('payment_rejected');
    expect(outbox.some((m) => m.to === p.email && /could not be verified/i.test(m.subject))).toBe(true);
    expect((await book(q.token, { doctorId: otherDoctor.id, slotStart, patient: PATIENT_INFO })).status).toBe(201);
  });
});

describe('what doctors can see', () => {
  it('a doctor sees only their own confirmed consultations, without payment or email details', async () => {
    const p = await loginPatient(app);
    const id = await confirmedBooking(app, p.token, admin.token, doctor.id, 5);
    const list = await request(app).get('/api/doctor/bookings').set(bearer(doctor.token));
    expect(list.status).toBe(200);
    const mine = list.body.data.find((b: { id: string }) => b.id === id);
    expect(mine).toBeTruthy();
    const json = JSON.stringify(list.body);
    expect(json).not.toContain(p.email);
    expect(json).not.toMatch(/utr|payerUpi/i);
    // Unpaid holds are not shown to the doctor
    expect(list.body.data.every((b: { status: string }) => b.status !== 'awaiting_payment')).toBe(true);

    for (const path of [`/api/doctor/bookings/${id}`, `/api/doctor/bookings/${id}/messages`]) {
      expect((await request(app).get(path).set(bearer(otherDoctor.token))).status, path).toBe(404);
    }
    expect((await request(app).post(`/api/doctor/bookings/${id}/messages`).set(bearer(otherDoctor.token)).send({ text: 'hello' })).status).toBe(404);
    expect((await request(app).post(`/api/doctor/bookings/${id}/report`).set(bearer(otherDoctor.token)).send({ diagnosis: 'Fake' })).status).toBe(404);
  });
});
