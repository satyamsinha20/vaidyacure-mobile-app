import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { bearer, createAdmin, loginPatient, nextUtr, startApp, stopApp } from './helpers.js';

/**
 * The AI model is replaced by a fake: no test ever calls a paid model.
 * The fake report recommends one library remedy and one invented medicine,
 * to prove the Library Doctor keeps only library items.
 */
vi.mock('../src/services/ai/llmClient.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/ai/llmClient.js')>();
  const remedySystem = (items: Array<{ name: string }>) => ({
    available: true,
    unavailable_reason: null,
    note: null,
    items: items.map((i) => ({ name: i.name, purpose: 'Helps', dosage: 'As directed', how_to_take: 'After food', duration: '3 days', precautions: 'None' })),
  });
  return {
    ...actual,
    createChatCompletion: vi.fn(async (_creds: unknown, options: { messages: Array<{ role: string; content: unknown }> }) => {
      const all = options.messages.map((m) => String(m.content)).join('\n');
      if (all.includes('"ready_for_report"')) {
        return { content: JSON.stringify({ reply: 'Since when?', ready_for_report: false, emergency: false, off_topic: false }), ms: 5 };
      }
      return {
        ms: 5,
        content: JSON.stringify({
          input_check: { status: 'ok', message: '' },
          assessment: {
            triage: { level: 'self_care', headline: 'Rest at home', reason: 'Mild symptoms' },
            immediate_actions: ['Drink water'],
            summary: 'Mild indigestion.',
            conditions: [{ name: 'Indigestion', icd10: 'K30', probability: 70, severity: 'mild', explanation: 'Upset stomach', supporting: [], against: [] }],
            red_flags: [],
            warning_signs: [],
            recommended_tests: [],
            specialist: 'General Physician',
            remedies: {
              allopathy: remedySystem([{ name: 'Inventedomycin 500' }]),
              ayurveda: remedySystem([{ name: 'Curry Leaves' }, { name: 'Magic Herbal Syrup' }]),
              homeopathy: remedySystem([{ name: 'Fake Homeo 30C' }]),
            },
            home_care: [],
            diet: { favor: [], avoid: [] },
            confidence: { level: 'moderate', note: '' },
          },
        }),
      };
    }),
  };
});

let app: Express;
let admin: { token: string };
const ids: Record<'library' | 'free' | 'premium', string> = { library: '', free: '', premium: '' };

const PATIENT = { age: 30, gender: 'male', heightCm: 170, weightKg: 70, pregnancy: 'not_applicable' };

beforeAll(async () => {
  app = await startApp();
  admin = await createAdmin(app);
  const { AiProvider } = await import('../src/models/AiProvider.js');
  const { AiDoctor } = await import('../src/models/AiDoctor.js');
  const { Remedy } = await import('../src/models/Remedy.js');
  const { encryptSecret } = await import('../src/utils/secretBox.js');
  const provider = await AiProvider.create({ name: 'Fake', baseUrl: 'https://fake.invalid', apiKey: encryptSecret('fake-key'), keyHint: 'fake' });
  for (const tier of ['library', 'free', 'premium'] as const) {
    const d = await AiDoctor.create({ name: `Dr ${tier}`, designation: 'Physician', tier, provider: provider._id, modelId: 'fake/model' });
    ids[tier] = String(d._id);
  }
  await Remedy.create({
    name: 'Curry Leaves / Kadi Patta (Murraya koenigii)',
    category: 'herbs',
    description: 'Leaves',
    symptoms: ['Indigestion', 'Nausea'],
    uses: ['Digestion'],
    dosage: '8 to 10 leaves a day',
    status: 'Verified',
    addedBy: 'test',
    addedOn: '1/1/2026',
  });
});
afterAll(stopApp);

const start = (body: Record<string, unknown>, headers: Record<string, string>) => request(app).post('/api/consult/start').set(headers).send(body);

const fundWallet = async (patientToken: string, rupees: number) => {
  const req = await request(app).post('/api/patient/wallet/topups').set(bearer(patientToken)).send({ amountInr: rupees, utr: nextUtr() });
  expect(req.status).toBe(201);
  const ok = await request(app).post(`/api/admin/market/payments/topups/${req.body.data.id}/approve`).set(bearer(admin.token)).send({});
  expect(ok.status).toBe(200);
  return req.body.data.id as string;
};

describe('AI doctor tiers', () => {
  it('the Library Doctor is free without ads', async () => {
    const res = await start({ doctorId: ids.library, patient: PATIENT }, { 'X-Device-Id': 'device-library-0001' });
    expect(res.status).toBe(201);
  });

  it('a free AI doctor needs ads; the old test "Pay" button is gone', async () => {
    const deviceId = 'device-free-ads-0001';
    expect((await start({ doctorId: ids.free, patient: PATIENT }, { 'X-Device-Id': deviceId })).body.code).toBe('ads_required');
    expect((await request(app).post('/api/consult/premium/purchase').set('X-Device-Id', deviceId).send({})).status).toBe(410);
    let token: string | null = null;
    for (let i = 0; i < 3; i++) {
      if (i) await new Promise((resolve) => setTimeout(resolve, 5100)); // one ad per 5 seconds at most
      const r = await request(app).post('/api/consult/ads/reward').set('X-Device-Id', deviceId).send({});
      expect(r.status).toBe(200);
      token = r.body.data.unlockToken;
    }
    expect(token).toMatch(/^[a-f0-9]{48}$/);
    // Bound to the device that watched the ads, and usable once
    expect((await start({ doctorId: ids.free, patient: PATIENT, unlockToken: token }, { 'X-Device-Id': 'device-other-00001' })).status).toBe(402);
    expect((await start({ doctorId: ids.free, patient: PATIENT, unlockToken: token }, { 'X-Device-Id': deviceId })).status).toBe(201);
    expect((await start({ doctorId: ids.free, patient: PATIENT, unlockToken: token }, { 'X-Device-Id': deviceId })).status).toBe(402);
  }, 30_000);

  it('a premium AI doctor needs login and enough wallet balance', async () => {
    const patient = await loginPatient(app);
    const headers = { 'X-Device-Id': patient.deviceId };
    expect((await start({ doctorId: ids.premium, patient: PATIENT, payWithWallet: true }, headers)).body.code).toBe('login_required');
    const authed = { ...headers, ...bearer(patient.token) };
    expect((await start({ doctorId: ids.premium, patient: PATIENT }, authed)).body.code).toBe('premium_required');
    expect((await start({ doctorId: ids.premium, patient: PATIENT, payWithWallet: true }, authed)).body.code).toBe('wallet_low');

    await fundWallet(patient.token, 50);
    const ok = await start({ doctorId: ids.premium, patient: PATIENT, payWithWallet: true, requestId: 'req-premium-001' }, authed);
    expect(ok.status).toBe(201);
    // A retry with the same request id is not charged again
    const retry = await start({ doctorId: ids.premium, patient: PATIENT, payWithWallet: true, requestId: 'req-premium-001' }, authed);
    expect(retry.body.data.consultationId).toBe(ok.body.data.consultationId);
    const wallet = await request(app).get('/api/patient/wallet').set(bearer(patient.token));
    expect(wallet.body.data.balance).toBe(15);
    expect(wallet.body.data.transactions.filter((t: { kind: string }) => t.kind === 'ai_chat')).toHaveLength(1);
  });

  it('parallel premium starts can never spend more than the balance', async () => {
    const patient = await loginPatient(app);
    await fundWallet(patient.token, 70); // enough for two chats of ₹35
    const authed = { 'X-Device-Id': patient.deviceId, ...bearer(patient.token) };
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) => start({ doctorId: ids.premium, patient: PATIENT, payWithWallet: true, requestId: `parallel-req-${i}` }, authed))
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(2);
    const wallet = await request(app).get('/api/patient/wallet').set(bearer(patient.token));
    expect(wallet.body.data.balance).toBe(0);
    const { Patient } = await import('../src/models/Patient.js');
    expect((await Patient.findById(patient.id).lean())!.walletPaise).toBe(0);
  });
});

describe('wallet top-ups', () => {
  it('credits once even if approved twice at the same moment', async () => {
    const patient = await loginPatient(app);
    const req = await request(app).post('/api/patient/wallet/topups').set(bearer(patient.token)).send({ amountInr: 100, utr: nextUtr() });
    const id = req.body.data.id;
    const results = await Promise.all(
      Array.from({ length: 3 }, () => request(app).post(`/api/admin/market/payments/topups/${id}/approve`).set(bearer(admin.token)).send({}))
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect((await request(app).get('/api/patient/wallet').set(bearer(patient.token))).body.data.balance).toBe(100);
  });

  it('validates amounts, limits pending requests, and lets the admin credit what was really received', async () => {
    const patient = await loginPatient(app);
    const send = (amountInr: unknown) => request(app).post('/api/patient/wallet/topups').set(bearer(patient.token)).send({ amountInr, utr: nextUtr() });
    for (const bad of [0, -100, 5, 5001, 10.5, '100']) expect((await send(bad)).status, String(bad)).toBe(400);
    const first = await send(200);
    await send(100);
    await send(100);
    expect((await send(100)).status).toBe(429); // at most 3 waiting
    const ok = await request(app).post(`/api/admin/market/payments/topups/${first.body.data.id}/approve`).set(bearer(admin.token)).send({ amountInr: 150 });
    expect(ok.body.data.credited).toBe(150);
    // A patient cannot approve their own top-up
    const second = (await request(app).get('/api/patient/wallet').set(bearer(patient.token))).body.data.topups.find((t: { status: string }) => t.status === 'pending');
    expect((await request(app).post(`/api/admin/market/payments/topups/${second.id}/approve`).set(bearer(patient.token)).send({})).status).toBe(401);
  });
});

describe('Library Doctor report', () => {
  it('keeps only remedies from the VaidyaCure library', async () => {
    const deviceId = 'device-library-report-01';
    const started = await start({ doctorId: ids.library, patient: PATIENT }, { 'X-Device-Id': deviceId });
    const cid = started.body.data.consultationId;
    const msg = await request(app).post(`/api/consult/${cid}/message`).set('X-Device-Id', deviceId).send({ text: 'Indigestion and nausea since yesterday' });
    expect(msg.status).toBe(200);
    const report = await request(app).post(`/api/consult/${cid}/report`).set('X-Device-Id', deviceId).send({});
    expect(report.status).toBe(200);
    const r = report.body.data;
    const names = [...r.remedies.allopathy.items, ...r.remedies.ayurveda.items, ...r.remedies.homeopathy.items].map((i: { name: string }) => i.name);
    expect(names).toEqual(['Curry Leaves / Kadi Patta (Murraya koenigii)']);
    expect(r.remedies.allopathy.available).toBe(false);
    expect(r.library[0].name).toContain('Curry Leaves');
  });
});

describe('AI doctor hours and bookings', () => {
  const setHours = async (tier: 'premium' | 'library', capacity: number) => {
    const { AiDoctor } = await import('../src/models/AiDoctor.js');
    const day = (new Date(Date.now() + 330 * 60_000).getUTCDay() + 3) % 7; // three days from today: never "now"
    await AiDoctor.updateOne(
      { _id: ids[tier] },
      { $set: { alwaysAvailable: false, availability: { weekly: [{ day, start: '10:00', end: '11:00' }], daysOff: [] }, slotCapacity: capacity, consultMinutes: 10 } }
    );
    const { invalidateAiConfigCache } = await import('../src/services/ai/configStore.js');
    invalidateAiConfigCache();
    const target = new Date(Date.now() + 330 * 60_000);
    while (target.getUTCDay() !== day) target.setUTCDate(target.getUTCDate() + 1);
    return target.toISOString().slice(0, 10);
  };

  it('outside its hours an AI doctor cannot be started, only booked; a full slot is refused', async () => {
    const date = await setHours('premium', 1);
    const patient = await loginPatient(app);
    const authed = { 'X-Device-Id': patient.deviceId, ...bearer(patient.token) };
    expect((await start({ doctorId: ids.premium, patient: PATIENT, payWithWallet: true }, authed)).body.code).toBe('not_available');

    const slots = await request(app).get(`/api/consult/doctors/${ids.premium}/slots?date=${date}&fresh=1`);
    expect(slots.body.data.slots.length).toBe(6); // 10:00-11:00 in 10-minute consultations
    const slotStart = slots.body.data.slots[0].start;

    await fundWallet(patient.token, 35);
    const booked = await request(app).post('/api/patient/bookings/ai').set(authed).send({ doctorId: ids.premium, slotStart, requestId: 'ai-book-0001' });
    expect(booked.status).toBe(201);
    expect(booked.body.data.status).toBe('confirmed');
    expect((await request(app).get('/api/patient/wallet').set(bearer(patient.token))).body.data.balance).toBe(0);

    const other = await loginPatient(app);
    await fundWallet(other.token, 35);
    const full = await request(app)
      .post('/api/patient/bookings/ai')
      .set({ 'X-Device-Id': other.deviceId, ...bearer(other.token) })
      .send({ doctorId: ids.premium, slotStart });
    expect(full.body.code).toBe('slot_full');
    // The refused booking did not take the other patient's money
    expect((await request(app).get('/api/patient/wallet').set(bearer(other.token))).body.data.balance).toBe(35);

    // Too early to start
    const early = await request(app).post(`/api/patient/bookings/${booked.body.data.id}/start-ai`).set(authed).send({ patient: PATIENT });
    expect(early.body.code).toBe('too_early');
  });

  it('a missed premium AI booking gives the money back to the wallet, once', async () => {
    const date = await setHours('premium', 5);
    const patient = await loginPatient(app);
    const authed = { 'X-Device-Id': patient.deviceId, ...bearer(patient.token) };
    await fundWallet(patient.token, 35);
    const slots = await request(app).get(`/api/consult/doctors/${ids.premium}/slots?date=${date}&fresh=1`);
    const booked = await request(app).post('/api/patient/bookings/ai').set(authed).send({ doctorId: ids.premium, slotStart: slots.body.data.slots[1].start });
    const { Booking } = await import('../src/models/Booking.js');
    await Booking.updateOne({ publicId: booked.body.data.id }, { $set: { slotStart: new Date(Date.now() - 20 * 60_000), slotEnd: new Date(Date.now() - 10 * 60_000) } });
    const reads = await Promise.all(Array.from({ length: 4 }, () => request(app).get(`/api/patient/bookings/${booked.body.data.id}`).set(bearer(patient.token))));
    expect(reads.every((r) => r.body.data.status === 'missed')).toBe(true);
    const wallet = (await request(app).get('/api/patient/wallet').set(bearer(patient.token))).body.data;
    expect(wallet.balance).toBe(35);
    expect(wallet.transactions.filter((t: { kind: string }) => t.kind === 'ai_refund')).toHaveLength(1);
  });

  it('a booked consultation starts in its time window, and only once', async () => {
    const date = await setHours('library', 5);
    const patient = await loginPatient(app);
    const authed = { 'X-Device-Id': patient.deviceId, ...bearer(patient.token) };
    const slots = await request(app).get(`/api/consult/doctors/${ids.library}/slots?date=${date}&fresh=1`);
    const booked = await request(app).post('/api/patient/bookings/ai').set(authed).send({ doctorId: ids.library, slotStart: slots.body.data.slots[2].start });
    expect(booked.status).toBe(201);
    const { Booking } = await import('../src/models/Booking.js');
    await Booking.updateOne({ publicId: booked.body.data.id }, { $set: { slotStart: new Date(Date.now() - 60_000), slotEnd: new Date(Date.now() + 9 * 60_000) } });
    const [a, b] = await Promise.all([
      request(app).post(`/api/patient/bookings/${booked.body.data.id}/start-ai`).set(authed).send({ patient: PATIENT }),
      request(app).post(`/api/patient/bookings/${booked.body.data.id}/start-ai`).set(authed).send({ patient: PATIENT }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
  });
});

describe('AI booking limits', () => {
  it('one patient can hold at most 3 upcoming AI bookings', async () => {
    const { AiDoctor } = await import('../src/models/AiDoctor.js');
    const day = (new Date(Date.now() + 330 * 60_000).getUTCDay() + 4) % 7;
    await AiDoctor.updateOne(
      { _id: ids.library },
      { $set: { alwaysAvailable: false, availability: { weekly: [{ day, start: '14:00', end: '15:00' }], daysOff: [] }, slotCapacity: 50, consultMinutes: 10 } }
    );
    const target = new Date(Date.now() + 330 * 60_000);
    while (target.getUTCDay() !== day) target.setUTCDate(target.getUTCDate() + 1);
    const slots = await request(app).get(`/api/consult/doctors/${ids.library}/slots?date=${target.toISOString().slice(0, 10)}&fresh=1`);
    const patient = await loginPatient(app);
    const authed = { 'X-Device-Id': patient.deviceId, ...bearer(patient.token) };
    const results = [];
    for (const slot of slots.body.data.slots.slice(0, 4)) {
      results.push(await request(app).post('/api/patient/bookings/ai').set(authed).send({ doctorId: ids.library, slotStart: slot.start }));
    }
    expect(results.slice(0, 3).every((r) => r.status === 201)).toBe(true);
    expect(results[3].body.code).toBe('too_many_bookings');
  });
});
