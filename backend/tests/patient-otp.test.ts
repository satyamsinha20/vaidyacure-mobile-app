import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { bearer, lastCodeFor, loginPatient, outbox, startApp, stopApp } from './helpers.js';

let app: Express;
beforeAll(async () => {
  app = await startApp();
});
afterAll(stopApp);

const ask = (email: unknown, deviceId = 'device-otp-tests-1') =>
  request(app).post('/api/patient/auth/request-otp').set('X-Device-Id', deviceId).send({ email });
const verify = (email: unknown, code: unknown) => request(app).post('/api/patient/auth/verify-otp').send({ email, code });

/** The resend cooldown is 45 seconds; tests move the last send time back instead of waiting */
const skipCooldown = async (email: string) => {
  const { EmailOtp } = await import('../src/models/EmailOtp.js');
  await EmailOtp.updateOne({ email }, { $set: { sentAt: new Date(Date.now() - 60_000) } });
};

describe('email OTP login', () => {
  it('sends the code by email only (never in the API response) and logs in', async () => {
    const res = await ask('Asha@Test.in');
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/\b\d{6}\b/);
    const code = lastCodeFor('asha@test.in');
    expect(code).toMatch(/^\d{6}$/);
    const ok = await verify('asha@test.in', code);
    expect(ok.status).toBe(200);
    expect(ok.body.data.token).toMatch(/^vcp_[a-f0-9]{64}$/);
    expect(ok.body.data.patient.email).toBe('asha@test.in');
  });

  it('stores only a keyed hash of the code', async () => {
    await ask('hash@test.in');
    const code = lastCodeFor('hash@test.in')!;
    const { EmailOtp } = await import('../src/models/EmailOtp.js');
    const doc = await EmailOtp.findOne({ email: 'hash@test.in' }).lean();
    expect(JSON.stringify(doc)).not.toContain(code);
  });

  it('works only once', async () => {
    await ask('once@test.in');
    const code = lastCodeFor('once@test.in');
    expect((await verify('once@test.in', code)).status).toBe(200);
    expect((await verify('once@test.in', code)).status).toBe(400);
  });

  it('deletes the code after 5 wrong tries (the right code then fails too)', async () => {
    await ask('guess@test.in');
    const code = lastCodeFor('guess@test.in')!;
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) expect((await verify('guess@test.in', wrong)).status).toBe(400);
    const res = await verify('guess@test.in', code);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('otp_expired');
  });

  it('cannot be brute-forced in parallel beyond the attempt limit', async () => {
    await ask('parallel@test.in');
    const code = lastCodeFor('parallel@test.in')!;
    const guesses = Array.from({ length: 20 }, (_, i) => String(i).padStart(6, '0')).filter((g) => g !== code);
    const results = await Promise.all(guesses.map((g) => verify('parallel@test.in', g)));
    expect(results.every((r) => r.status === 400)).toBe(true);
    const { EmailOtp } = await import('../src/models/EmailOtp.js');
    const doc = await EmailOtp.findOne({ email: 'parallel@test.in' }).lean();
    // Either deleted, or never more than 5 counted attempts
    expect(doc === null || doc.attempts <= 5).toBe(true);
    expect((await verify('parallel@test.in', code)).status).toBe(400);
  });

  it('rejects an expired code', async () => {
    await ask('late@test.in');
    const code = lastCodeFor('late@test.in');
    const { EmailOtp } = await import('../src/models/EmailOtp.js');
    await EmailOtp.updateOne({ email: 'late@test.in' }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await verify('late@test.in', code)).status).toBe(400);
  });

  it('limits how often codes can be requested', async () => {
    const email = 'spam@test.in';
    expect((await ask(email)).status).toBe(200);
    expect((await ask(email)).status).toBe(429); // 45 second cooldown
    for (let i = 0; i < 4; i++) {
      await skipCooldown(email);
      expect((await ask(email, `device-spam-${i}-xxxxxx`)).status).toBe(200);
    }
    await skipCooldown(email);
    expect((await ask(email, 'device-spam-last-xxxxx')).status).toBe(429); // 5 per hour per email
  });

  it('validates input and blocks operator injection', async () => {
    expect((await ask('not-an-email')).status).toBe(400);
    expect((await ask({ $gt: '' })).status).toBe(400);
    expect((await verify('a@test.in', { $ne: '1' })).status).toBe(400);
    expect((await verify({ $ne: null }, '123456')).status).toBe(400);
  });
});

describe('patient session', () => {
  it('logout ends the session; random or malformed tokens are refused', async () => {
    const p = await loginPatient(app);
    expect((await request(app).get('/api/patient/me').set(bearer(p.token))).status).toBe(200);
    await request(app).post('/api/patient/auth/logout').set(bearer(p.token)).send({});
    expect((await request(app).get('/api/patient/me').set(bearer(p.token))).status).toBe(401);
    expect((await request(app).get('/api/patient/me').set(bearer(`vcp_${'a'.repeat(64)}`))).status).toBe(401);
    expect((await request(app).get('/api/patient/me').set(bearer('vcp_../../etc'))).status).toBe(401);
  });

  it('a patient cannot give themselves wallet money through the profile', async () => {
    const p = await loginPatient(app);
    const res = await request(app).put('/api/patient/me').set(bearer(p.token)).send({ name: 'Ravi', walletPaise: 99999999, wallet: 9999, isBlocked: false, email: 'other@test.in' });
    expect(res.status).toBe(200);
    expect(res.body.data.wallet).toBe(0);
    expect(res.body.data.email).toBe(p.email);
    expect(res.body.data.name).toBe('Ravi');
  });

  it('the session token is stored only as a hash', async () => {
    const p = await loginPatient(app);
    const { PatientSession } = await import('../src/models/PatientSession.js');
    const all = await PatientSession.find().lean();
    expect(JSON.stringify(all)).not.toContain(p.token.slice(4));
    expect(outbox.length).toBeGreaterThan(0);
  });
});
