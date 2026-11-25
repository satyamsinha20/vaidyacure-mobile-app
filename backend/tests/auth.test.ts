import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import type { Express } from 'express';
import { bearer, createAdmin, createReadyDoctor, loginPatient, startApp, stopApp } from './helpers.js';

let app: Express;
let admin: { token: string };
let doctor: Awaited<ReturnType<typeof createReadyDoctor>>;
let patient: Awaited<ReturnType<typeof loginPatient>>;

beforeAll(async () => {
  app = await startApp();
  admin = await createAdmin(app);
  doctor = await createReadyDoctor(app, admin.token);
  patient = await loginPatient(app);
});
afterAll(stopApp);

describe('token types never cross over', () => {
  it('rejects a doctor token on admin routes', async () => {
    for (const path of ['/api/auth/me', '/api/admin/market/summary', '/api/admin/content/feedback', '/api/admin/ai/settings', '/api/users/count']) {
      const res = await request(app).get(path).set(bearer(doctor.token));
      expect(res.status, path).toBe(401);
    }
  });

  it('rejects an admin token on doctor routes', async () => {
    const res = await request(app).get('/api/doctor/me').set(bearer(admin.token));
    expect(res.status).toBe(401);
  });

  it('rejects a patient token on admin and doctor routes', async () => {
    expect((await request(app).get('/api/admin/market/summary').set(bearer(patient.token))).status).toBe(401);
    expect((await request(app).get('/api/doctor/me').set(bearer(patient.token))).status).toBe(401);
  });

  it('rejects admin/doctor tokens on patient routes', async () => {
    expect((await request(app).get('/api/patient/me').set(bearer(admin.token))).status).toBe(401);
    expect((await request(app).get('/api/patient/me').set(bearer(doctor.token))).status).toBe(401);
  });

  it('rejects forged tokens (wrong secret, alg none, doctor claims with an admin id)', async () => {
    const wrongSecret = jwt.sign({ id: doctor.id, typ: 'doctor', ver: 1 }, 'not-the-secret');
    expect((await request(app).get('/api/doctor/me').set(bearer(wrongSecret))).status).toBe(401);

    const none = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${Buffer.from(
      JSON.stringify({ id: doctor.id, typ: 'doctor', ver: 1 })
    ).toString('base64url')}.`;
    expect((await request(app).get('/api/doctor/me').set(bearer(none))).status).toBe(401);

    // A real doctor token re-labelled as admin is still refused (it is signed for typ=doctor)
    const [h, p, s] = doctor.token.split('.');
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
    const tampered = `${h}.${Buffer.from(JSON.stringify({ ...payload, typ: 'admin', role: 'superadmin' })).toString('base64url')}.${s}`;
    expect((await request(app).get('/api/admin/market/summary').set(bearer(tampered))).status).toBe(401);
  });

  it('refuses non-superadmin admins on money and doctor management', async () => {
    const moderator = await createAdmin(app, 'moderator');
    for (const path of ['/api/admin/market/summary', '/api/admin/market/doctors', '/api/admin/market/payments/bookings', '/api/admin/market/chats']) {
      expect((await request(app).get(path).set(bearer(moderator.token))).status, path).toBe(403);
    }
  });
});

describe('doctor login', () => {
  it('works with the doctor ID or the email, and fails with a wrong password', async () => {
    const byCode = await request(app).post('/api/auth/login').send({ email: doctor.code, password: doctor.password });
    expect(byCode.status).toBe(200);
    expect(byCode.body.accountType).toBe('doctor');
    expect(byCode.body.admin.role).toBe('doctor');
    const byEmail = await request(app).post('/api/auth/login').send({ email: doctor.email, password: doctor.password });
    expect(byEmail.status).toBe(200);
    const wrong = await request(app).post('/api/auth/login').send({ email: doctor.code, password: 'Wrong-pass-1' });
    expect(wrong.status).toBe(401);
  });

  it('blocks NoSQL operator injection in the login form', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: { $gt: '' }, password: { $gt: '' } });
    expect(res.status).toBe(400);
  });

  it('forces a password change and terms before anything else', async () => {
    const fresh = await request(app)
      .post('/api/admin/market/doctors')
      .set(bearer(admin.token))
      .send({
        name: 'Dr New',
        email: 'new-doctor@test.in',
        qualification: 'MBBS',
        specialization: 'Physician',
        registrationNumber: 'REG-NEW-1',
        registrationCouncil: 'Delhi Medical Council',
        feeInr: 300,
        plan: { amountInr: 0 },
      });
    expect(fresh.status).toBe(201);
    // The temporary password is returned once and never stored in plain text
    const { Doctor } = await import('../src/models/Doctor.js');
    const stored = await Doctor.findOne({ email: 'new-doctor@test.in' }).select('+password').lean();
    expect(stored?.password).not.toContain(fresh.body.data.login.password);
    expect(stored?.password?.startsWith('$2')).toBe(true);

    const login = await request(app).post('/api/auth/login').send({ email: 'new-doctor@test.in', password: fresh.body.data.login.password });
    const token = login.body.token;
    expect((await request(app).get('/api/doctor/bookings').set(bearer(token))).body.code).toBe('password_change_required');
    const weak = await request(app)
      .post('/api/doctor/auth/change-password')
      .set(bearer(token))
      .send({ currentPassword: fresh.body.data.login.password, newPassword: 'short' });
    expect(weak.status).toBe(400);
    const changed = await request(app)
      .post('/api/doctor/auth/change-password')
      .set(bearer(token))
      .send({ currentPassword: fresh.body.data.login.password, newPassword: 'Strong-pass-789' });
    expect(changed.status).toBe(200);
    // The old token stops working after a password change
    expect((await request(app).get('/api/doctor/me').set(bearer(token))).status).toBe(401);
    const newToken = changed.body.token;
    expect((await request(app).get('/api/doctor/bookings').set(bearer(newToken))).body.code).toBe('terms_required');
    await request(app).post('/api/doctor/auth/accept-terms').set(bearer(newToken)).send({});
    expect((await request(app).get('/api/doctor/bookings').set(bearer(newToken))).status).toBe(200);
  });

  it('logs out a disabled doctor and refuses new logins', async () => {
    const other = await createReadyDoctor(app, admin.token);
    const off = await request(app).put(`/api/admin/market/doctors/${other.id}`).set(bearer(admin.token)).send({ isActive: false });
    expect(off.status).toBe(200);
    expect((await request(app).get('/api/doctor/me').set(bearer(other.token))).status).toBe(401);
    const login = await request(app).post('/api/auth/login').send({ email: other.code, password: other.password });
    expect(login.status).toBe(403);
  });

  it('a doctor cannot change their own fee, name or registration directly', async () => {
    await request(app)
      .put('/api/doctor/profile')
      .set(bearer(doctor.token))
      .send({ about: 'Hello', feeInr: 10, name: 'Hacker', registrationNumber: 'FAKE', isActive: false, planValidUntil: '2099-01-01' });
    const me = await request(app).get('/api/doctor/me').set(bearer(doctor.token));
    expect(me.body.data.feeInr).toBe(500);
    expect(me.body.data.name).not.toBe('Hacker');
    expect(me.body.data.registrationNumber).not.toBe('FAKE');
    expect(me.body.data.about).toBe('Hello');
  });
});

describe('basic hardening', () => {
  it('hides the framework and refuses unknown browser origins', async () => {
    const res = await request(app).get('/api/health').set('Origin', 'https://evil.example');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('the cron endpoint needs its secret', async () => {
    expect((await request(app).get('/api/cron/tick')).status).toBe(401);
    expect((await request(app).get('/api/cron/tick?key=' + 'a'.repeat(48))).status).toBe(401);
    expect((await request(app).get('/api/cron/tick').set(bearer('test-cron-secret-0123456789'))).status).toBe(200);
  });

  it('never caches personal responses', async () => {
    const res = await request(app).get('/api/patient/me').set(bearer(patient.token));
    expect(res.headers['cache-control']).toBe('no-store');
  });
});
