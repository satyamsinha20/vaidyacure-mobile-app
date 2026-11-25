import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { bearer, createAdmin, createReadyDoctor, lastCodeFor, loginPatient, outbox, startApp, stopApp } from './helpers.js';

let app: Express;
let admin: { token: string };

beforeAll(async () => {
  app = await startApp();
  admin = await createAdmin(app);
});
afterAll(stopApp);

describe('Settings > SMTP: email texts', () => {
  it('lists every email with its placeholders; the login code must stay in the login email', async () => {
    const res = await request(app).get('/api/admin/settings/email-templates').set(bearer(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(18);
    const otp = res.body.data.find((t: { key: string }) => t.key === 'otp');
    expect(otp.required).toEqual(['code']);

    const noCode = await request(app).put('/api/admin/settings/email-templates/otp').set(bearer(admin.token)).send({ subject: 'Your code', body: 'Hello, here is no code at all.' });
    expect(noCode.status).toBe(400);
    const unknown = await request(app)
      .put('/api/admin/settings/email-templates/otp')
      .set(bearer(admin.token))
      .send({ subject: 'Code {{code}}', body: 'Your code {{code}} for {{diagnosis}}' });
    expect(unknown.status).toBe(400);
    expect((await request(app).put('/api/admin/settings/email-templates/not_a_template').set(bearer(admin.token)).send({ subject: 'x x x', body: 'x'.repeat(20) })).status).toBe(404);
  });

  it('a saved text is used for real emails, and "reset" brings the default back', async () => {
    const saved = await request(app)
      .put('/api/admin/settings/email-templates/otp')
      .set(bearer(admin.token))
      .send({ subject: 'VaidyaCure code: {{code}}', body: 'Namaste! Aapka login code hai {{code}}. Kisi ko mat batana.' });
    expect(saved.status).toBe(200);
    const p = await loginPatient(app);
    const mail = [...outbox].reverse().find((m) => m.to === p.email)!;
    expect(mail.subject).toMatch(/^VaidyaCure code: \d{6}$/);
    expect(mail.text).toContain('Aapka login code hai');
    expect(lastCodeFor(p.email)).toMatch(/^\d{6}$/);

    await request(app).delete('/api/admin/settings/email-templates/otp').set(bearer(admin.token));
    const q = await loginPatient(app);
    const again = [...outbox].reverse().find((m) => m.to === q.email)!;
    expect(again.subject).toMatch(/is your VaidyaCure login code$/);
  });

  it('escapes HTML in the admin text and in every value (no HTML or script injection)', async () => {
    await request(app)
      .put('/api/admin/settings/email-templates/payment_rejected')
      .set(bearer(admin.token))
      .send({ subject: 'Payment problem', body: '<b>Bold?</b> Booking with {{doctor}} at {{time}}: {{reason}}' });
    const { renderMail, invalidateTemplates } = await import('../src/services/email/templates.js');
    invalidateTemplates();
    const mail = await renderMail('payment_rejected', 'x@test.in', {
      doctor: '<script>alert(1)</script>',
      time: '10:00',
      reason: '<img src=x onerror=alert(1)>',
    });
    expect(mail.html).not.toMatch(/<script>|<img|<b>/);
    expect(mail.html).toContain('&lt;script&gt;');
    expect(mail.html).toContain('&lt;b&gt;Bold?&lt;/b&gt;');
  });

  it('preview shows the email with example values', async () => {
    const res = await request(app)
      .post('/api/admin/settings/email-templates/refund_paid/preview')
      .set(bearer(admin.token))
      .send({ subject: 'Refund {{amount}}', body: 'We sent {{amount}} (UTR {{utr}}).' });
    expect(res.body.data.subject).toBe('Refund ₹550');
    expect(res.body.data.text).toContain('UTR 412345678901');
  });

  it('only the super admin can change settings', async () => {
    const moderator = await createAdmin(app, 'moderator');
    const doctor = await createReadyDoctor(app, admin.token);
    for (const token of [moderator.token]) {
      expect((await request(app).get('/api/admin/settings/email').set(bearer(token))).status).toBe(403);
      expect((await request(app).put('/api/admin/settings/email-templates/otp').set(bearer(token)).send({ subject: 'x {{code}}', body: 'code {{code}} here' })).status).toBe(403);
    }
    expect((await request(app).get('/api/admin/settings/email-templates').set(bearer(doctor.token))).status).toBe(401);
    const p = await loginPatient(app);
    expect((await request(app).get('/api/admin/settings/email').set(bearer(p.token))).status).toBe(401);
  });
});

describe('Settings > Search', () => {
  it('turns the mic off and changes its language, without touching the chat rules', async () => {
    const before = (await request(app).get('/api/admin/ai/settings').set(bearer(admin.token))).body.data;
    const res = await request(app).put('/api/admin/ai/settings').set(bearer(admin.token)).send({ voiceSearchEnabled: false, voiceSearchLanguage: 'hi-IN', photoAiEnabled: false });
    expect(res.status).toBe(200);
    expect(res.body.data.premiumPriceInr).toBe(before.premiumPriceInr);
    expect(res.body.data.adsRequired).toBe(before.adsRequired);

    const config = await request(app).get('/api/search/config?fresh=1');
    expect(config.body.data).toMatchObject({ voice: false, voiceLanguage: 'hi-IN', photo: false, internet: false });
    // The app never sees models, keys or limits
    expect(JSON.stringify(config.body)).not.toMatch(/model|key|PerDay|mistral|qwen|gemma/i);
    expect((await request(app).put('/api/admin/ai/settings').set(bearer(admin.token)).send({ voiceSearchLanguage: 'fr-FR' })).status).toBe(400);
  });
});

describe('Login stays on', () => {
  it('a session renews itself when the app is used', async () => {
    const p = await loginPatient(app);
    const { PatientSession } = await import('../src/models/PatientSession.js');
    await PatientSession.updateMany({ patient: p.id }, { $set: { expiresAt: new Date(Date.now() + 10 * 86_400_000) } });
    expect((await request(app).get('/api/patient/me').set(bearer(p.token))).status).toBe(200);
    const session = await PatientSession.findOne({ patient: p.id }).lean();
    expect(session!.expiresAt.getTime()).toBeGreaterThan(Date.now() + 360 * 86_400_000);
  });
});
