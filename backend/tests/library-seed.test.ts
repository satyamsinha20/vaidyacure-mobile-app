import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { startApp, stopApp } from './helpers.js';

let app: Express;
beforeAll(async () => {
  app = await startApp();
});
afterAll(stopApp);

describe('Library Doctor', () => {
  it('is created once when a provider exists, and remembered so a deleted one is not re-created', async () => {
    const none = await request(app).get('/api/consult/doctors?fresh=1');
    expect(none.body.data.doctors).toHaveLength(0); // no provider yet: nothing created

    const { AiProvider } = await import('../src/models/AiProvider.js');
    const { AiSettings } = await import('../src/models/AiSettings.js');
    const { encryptSecret } = await import('../src/utils/secretBox.js');
    await AiProvider.create({ name: 'Gateway', baseUrl: 'https://fake.invalid', apiKey: encryptSecret('k'), keyHint: 'k' });
    const { invalidateAiConfigCache } = await import('../src/services/ai/configStore.js');
    invalidateAiConfigCache();

    const res = await request(app).get('/api/consult/doctors?fresh=1');
    const library = res.body.data.doctors.filter((d: { tier: string }) => d.tier === 'library');
    expect(library).toHaveLength(1);
    expect(library[0].name).toBe('Vaidya Library Doctor');
    expect(library[0].availableNow).toBe(true);
    // Provider and model are never sent to the app
    expect(JSON.stringify(res.body)).not.toMatch(/deepseek|qwen|fake\.invalid|provider/i);
    expect((await AiSettings.findOne({ key: 'global' }).lean())?.libraryDoctorSeeded).toBe(true);
  });
});
