import mongoose from 'mongoose';
import { AiProvider } from '../../models/AiProvider.js';
import { AiDoctor, type AiDoctorTier, type IAiDoctor } from '../../models/AiDoctor.js';
import { EMPTY_AVAILABILITY, type IAvailability } from '../../models/availability.js';
import { AiSettings, DEFAULT_AI_SETTINGS, type IAiSettings } from '../../models/AiSettings.js';
import { decryptSecret, encryptSecret, isEncryptionConfigured, secretHint } from '../../utils/secretBox.js';
import type { ProviderCredentials } from './llmClient.js';

/**
 * AI configuration lives in MongoDB and is managed from the admin panel, so
 * providers, models and doctors can change without touching server env vars.
 * Reads are cached briefly; every serverless instance picks up changes within
 * CACHE_MS. Decrypted API keys are never cached or returned to any client.
 */
const CACHE_MS = 30_000;

export type AiSettingsValues = typeof DEFAULT_AI_SETTINGS;

export interface PublicDoctor {
  id: string;
  name: string;
  designation: string;
  about: string;
  tier: AiDoctorTier;
  avatarColor: string;
  /** null = the global consultation length */
  consultMinutes: number | null;
  alwaysAvailable: boolean;
  availability: IAvailability;
}

export interface ModelTarget {
  creds: ProviderCredentials;
  model: string;
}

export interface DoctorRuntime {
  doctor: Pick<
    IAiDoctor,
    'name' | 'designation' | 'tier' | 'consultMinutes' | 'maxUserMessages' | 'alwaysAvailable' | 'availability' | 'slotCapacity'
  > & { id: string };
  primary: ModelTarget;
  fallback: ModelTarget | null;
}

let settingsCache: { value: AiSettingsValues; at: number } | null = null;
let doctorsCache: { value: PublicDoctor[]; at: number } | null = null;

export const invalidateAiConfigCache = (): void => {
  settingsCache = null;
  doctorsCache = null;
};

const pickSettings = (doc: (Partial<Record<keyof IAiSettings, any>> & { premiumAdsRequired?: number }) | null): AiSettingsValues => ({
  premiumPriceInr: doc?.premiumPriceInr ?? DEFAULT_AI_SETTINGS.premiumPriceInr,
  // Older settings documents stored this as premiumAdsRequired
  adsRequired: doc?.adsRequired ?? doc?.premiumAdsRequired ?? DEFAULT_AI_SETTINGS.adsRequired,
  consultationSeconds: doc?.consultationSeconds ?? DEFAULT_AI_SETTINGS.consultationSeconds,
  maxUserMessages: doc?.maxUserMessages ?? DEFAULT_AI_SETTINGS.maxUserMessages,
  freeConsultsPerDevicePerDay: doc?.freeConsultsPerDevicePerDay ?? DEFAULT_AI_SETTINGS.freeConsultsPerDevicePerDay,
  premiumUnlocksPerDevicePerDay: doc?.premiumUnlocksPerDevicePerDay ?? DEFAULT_AI_SETTINGS.premiumUnlocksPerDevicePerDay,
  adUnlocksPerDevicePerDay: doc?.adUnlocksPerDevicePerDay ?? DEFAULT_AI_SETTINGS.adUnlocksPerDevicePerDay,
  globalConsultsPerDay: doc?.globalConsultsPerDay ?? DEFAULT_AI_SETTINGS.globalConsultsPerDay,
  walletEnabled: doc?.walletEnabled ?? DEFAULT_AI_SETTINGS.walletEnabled,
  adsMode: (doc?.adsMode ?? DEFAULT_AI_SETTINGS.adsMode) as AiSettingsValues['adsMode'],
  searchAiEnabled: doc?.searchAiEnabled ?? DEFAULT_AI_SETTINGS.searchAiEnabled,
  searchAiModel: doc?.searchAiModel || DEFAULT_AI_SETTINGS.searchAiModel,
  searchAiFallbackModel: doc?.searchAiFallbackModel ?? DEFAULT_AI_SETTINGS.searchAiFallbackModel,
  searchAiPerDevicePerDay: doc?.searchAiPerDevicePerDay ?? DEFAULT_AI_SETTINGS.searchAiPerDevicePerDay,
  searchAiGlobalPerDay: doc?.searchAiGlobalPerDay ?? DEFAULT_AI_SETTINGS.searchAiGlobalPerDay,
  medicineAiModel: doc?.medicineAiModel || DEFAULT_AI_SETTINGS.medicineAiModel,
  photoAiEnabled: doc?.photoAiEnabled ?? DEFAULT_AI_SETTINGS.photoAiEnabled,
  photoAiModel: doc?.photoAiModel || DEFAULT_AI_SETTINGS.photoAiModel,
  photoAiFallbackModel: doc?.photoAiFallbackModel ?? DEFAULT_AI_SETTINGS.photoAiFallbackModel,
  photoAiPerDevicePerDay: doc?.photoAiPerDevicePerDay ?? DEFAULT_AI_SETTINGS.photoAiPerDevicePerDay,
  photoAiGlobalPerDay: doc?.photoAiGlobalPerDay ?? DEFAULT_AI_SETTINGS.photoAiGlobalPerDay,
});

export const getAiSettings = async (): Promise<AiSettingsValues> => {
  if (settingsCache && Date.now() - settingsCache.at < CACHE_MS) return settingsCache.value;
  const doc = await AiSettings.findOne({ key: 'global' }).lean();
  const value = pickSettings(doc);
  settingsCache = { value, at: Date.now() };
  return value;
};

/* -------------------------------------------------------------------------- */
/* FIRST-RUN SEED                                                             */
/* -------------------------------------------------------------------------- */
// The default team. Models are chosen by measured cost per consultation and can
// be changed anytime from the admin panel (AI Doctor > Doctors).
const DEFAULT_FREE_MODEL = 'deepseek/deepseek-v4-flash';
const SEED_DOCTORS: Array<Pick<IAiDoctor, 'name' | 'designation' | 'about' | 'tier' | 'modelId' | 'avatarColor' | 'estimatedCostInr'>> = [
  { name: 'Aarav Mehta', designation: 'General Physician', about: 'Fever, cold, body pain and everyday health problems.', tier: 'free', modelId: DEFAULT_FREE_MODEL, avatarColor: '#157347', estimatedCostInr: 1.1 },
  { name: 'Priya Sharma', designation: 'Health Coach', about: 'Lifestyle, diet, weight, sleep and stress.', tier: 'free', modelId: 'anthropic/claude-haiku-5.5', avatarColor: '#0E7490', estimatedCostInr: 0.4 },
  { name: 'Vaidya Meera Joshi', designation: 'Ayurveda Specialist', about: 'Ayurvedic care for digestion, immunity and chronic problems.', tier: 'free', modelId: 'qwen/qwen3.7-plus', avatarColor: '#B45309', estimatedCostInr: 1.1 },
  { name: 'Kabir Khan', designation: 'Fever & Infection', about: 'Fever, viral infections, dengue, malaria and typhoid.', tier: 'free', modelId: 'openai/gpt-4.1-mini', avatarColor: '#BE123C', estimatedCostInr: 1.1 },
  { name: 'Sneha Reddy', designation: 'Stomach & Digestion', about: 'Acidity, gas, vomiting, loose motions and constipation.', tier: 'free', modelId: DEFAULT_FREE_MODEL, avatarColor: '#7C3AED', estimatedCostInr: 1.1 },
  { name: 'Ananya Iyer', designation: "Women's Health", about: 'Periods, PCOS, pregnancy-related questions and women’s wellness.', tier: 'premium', modelId: 'anthropic/claude-haiku-4.5', avatarColor: '#DB2777', estimatedCostInr: 3 },
  { name: 'Rohan Verma', designation: 'Child Health', about: 'Common illnesses in babies and children, with child-safe doses.', tier: 'premium', modelId: 'openai/gpt-6.1-terra', avatarColor: '#2563EB', estimatedCostInr: 3.1 },
  { name: 'Ishaan Gupta', designation: 'Skin & Hair', about: 'Rashes, acne, allergies, hair fall and skin infections.', tier: 'premium', modelId: 'google/gemini-3.6-flash', avatarColor: '#0F766E', estimatedCostInr: 4.6 },
  { name: 'Nisha Kapoor', designation: 'Homeopathy Specialist', about: 'Classical homeopathic care chosen for your symptom picture.', tier: 'premium', modelId: 'deepseek/deepseek-v4-pro', avatarColor: '#9333EA', estimatedCostInr: 3.2 },
  { name: 'Vikram Rao', designation: 'Heart, BP & Diabetes', about: 'Blood pressure, sugar, cholesterol and heart symptoms.', tier: 'premium', modelId: 'qwen/qwen3.8-max', avatarColor: '#B91C1C', estimatedCostInr: 4.9 },
];

let seedPromise: Promise<void> | null = null;

/**
 * On a fresh database, creates the default provider from LLM_BASE_URL /
 * LLM_API_KEY (if present) and the default doctors. Runs at most once per
 * instance and never overwrites anything an admin has configured.
 */
export const ensureAiSeeded = async (): Promise<void> => {
  if (!seedPromise) {
    seedPromise = (async () => {
      if ((await AiDoctor.estimatedDocumentCount()) > 0) return;
      const baseUrl = process.env.LLM_BASE_URL?.trim();
      const apiKey = process.env.LLM_API_KEY?.trim();
      if (!baseUrl || !apiKey || !isEncryptionConfigured()) return;

      let provider = await AiProvider.findOne({ name: 'Default provider' });
      if (!provider) {
        provider = await AiProvider.create({
          name: 'Default provider',
          baseUrl: baseUrl.replace(/\/+$/, ''),
          apiKey: encryptSecret(apiKey),
          keyHint: secretHint(apiKey),
          notes: 'Created automatically from server environment on first run.',
        });
      }
      if ((await AiDoctor.estimatedDocumentCount()) > 0) return;
      await AiDoctor.insertMany(
        SEED_DOCTORS.map((d, i) => ({
          ...d,
          provider: provider!._id,
          fallbackProvider: provider!._id,
          fallbackModel: d.modelId === DEFAULT_FREE_MODEL ? '' : DEFAULT_FREE_MODEL,
          sortOrder: i + 1,
        }))
      );
      console.log('[ai] seeded default provider and doctors');
    })().catch((error) => {
      seedPromise = null;
      console.error('[ai] seeding failed:', error);
    });
  }
  return seedPromise;
};

let librarySeedPromise: Promise<void> | null = null;

/**
 * Creates the free "Library Doctor" once (it recommends only VaidyaCure
 * library remedies). Uses the first working provider; the admin can change
 * its model or turn it off, and a deleted one is not created again.
 */
export const ensureLibraryDoctor = async (): Promise<void> => {
  if (!librarySeedPromise) {
    librarySeedPromise = (async () => {
      const settings = await AiSettings.findOne({ key: 'global' }).select('libraryDoctorSeeded').lean();
      if (settings?.libraryDoctorSeeded) return;
      const markDone = () => AiSettings.updateOne({ key: 'global' }, { $set: { libraryDoctorSeeded: true } }, { upsert: true });
      if (await AiDoctor.exists({ tier: 'library' })) return void (await markDone());
      const providers = await AiProvider.find({ isActive: true }).sort({ createdAt: 1 }).lean();
      const provider = providers.find((p) => p.isActive && (!p.expiresAt || new Date(p.expiresAt).getTime() > Date.now()));
      if (!provider) {
        librarySeedPromise = null; // try again once a provider is added
        return;
      }
      await AiDoctor.create({
        name: 'Vaidya Library Doctor',
        designation: 'VaidyaCure Library',
        about: 'Free, no ads. Suggests only remedies and medicines from the VaidyaCure library.',
        tier: 'library',
        provider: provider._id,
        modelId: DEFAULT_FREE_MODEL,
        fallbackProvider: provider._id,
        fallbackModel: 'qwen/qwen3.7-flash',
        avatarColor: '#0E7490',
        sortOrder: 0,
        estimatedCostInr: 1.1,
      });
      await markDone();
      invalidateAiConfigCache();
      console.log('[ai] created the Library Doctor');
    })().catch((error) => {
      librarySeedPromise = null;
      console.error('[ai] library doctor seeding failed:', error);
    });
  }
  return librarySeedPromise;
};

/* -------------------------------------------------------------------------- */
/* DOCTORS                                                                    */
/* -------------------------------------------------------------------------- */
const providerUsable = (p: { isActive?: boolean; expiresAt?: Date | null } | null | undefined): boolean =>
  Boolean(p && p.isActive && (!p.expiresAt || new Date(p.expiresAt).getTime() > Date.now()));

/** Doctors shown in the app: active, and backed by an active, unexpired provider */
export const listPublicDoctors = async (): Promise<PublicDoctor[]> => {
  if (doctorsCache && Date.now() - doctorsCache.at < CACHE_MS) return doctorsCache.value;
  await ensureAiSeeded();
  await ensureLibraryDoctor();
  const doctors = await AiDoctor.find({ isActive: true })
    .sort({ sortOrder: 1, createdAt: 1 })
    .populate<{ provider: { isActive: boolean; expiresAt: Date | null } }>('provider', 'isActive expiresAt')
    .lean();
  const value = doctors
    .filter((d) => providerUsable(d.provider))
    .map((d) => ({
      id: String(d._id),
      name: d.name,
      designation: d.designation,
      about: d.about,
      tier: d.tier,
      avatarColor: d.avatarColor,
      consultMinutes: d.consultMinutes ?? null,
      alwaysAvailable: d.alwaysAvailable !== false,
      availability: d.availability ?? EMPTY_AVAILABILITY,
    }));
  doctorsCache = { value, at: Date.now() };
  return value;
};

const loadTarget = async (providerId: unknown, model: string): Promise<ModelTarget | null> => {
  if (!providerId || !model) return null;
  const provider = await AiProvider.findById(providerId).select('+apiKey').lean();
  if (!providerUsable(provider) || !provider?.apiKey) return null;
  try {
    return { creds: { baseUrl: provider.baseUrl, apiKey: decryptSecret(provider.apiKey) }, model };
  } catch {
    console.error('[ai] could not decrypt provider key (check CONFIG_ENCRYPTION_KEY)');
    return null;
  }
};

/**
 * Models for AI answers in search: the configured (cheapest) model, then its
 * fallback, on the first active provider. Empty when search AI is switched off.
 */
export const getSearchAiTargets = async (): Promise<ModelTarget[]> => {
  const settings = await getAiSettings();
  if (!settings.searchAiEnabled) return [];
  return targetsOnFirstProvider([settings.searchAiModel, settings.searchAiFallbackModel]);
};

/** Models that work out a brand's salt: the medicine model, then the search fallback. Empty when search AI is off. */
export const getMedicineAiTargets = async (): Promise<ModelTarget[]> => {
  const settings = await getAiSettings();
  if (!settings.searchAiEnabled) return [];
  return targetsOnFirstProvider([settings.medicineAiModel, settings.searchAiFallbackModel]);
};

/** Models that read the medicine name from a camera photo: main, then fallback. Empty when switched off. */
export const getPhotoAiTargets = async (): Promise<ModelTarget[]> => {
  const settings = await getAiSettings();
  if (!settings.photoAiEnabled) return [];
  return targetsOnFirstProvider([settings.photoAiModel, settings.photoAiFallbackModel]);
};

const targetsOnFirstProvider = async (modelIds: string[]): Promise<ModelTarget[]> => {
  const providers = await AiProvider.find({ isActive: true }).sort({ createdAt: 1 }).select('_id isActive expiresAt').lean();
  const provider = providers.find(providerUsable);
  if (!provider) return [];
  const models = Array.from(new Set(modelIds.filter(Boolean)));
  const targets = await Promise.all(models.map((model) => loadTarget(provider._id, model)));
  return targets.filter((t): t is ModelTarget => t !== null);
};

/** Everything needed to call the model behind a doctor (server-side only) */
export const getDoctorRuntime = async (doctorId: string): Promise<DoctorRuntime | null> => {
  if (!mongoose.isValidObjectId(doctorId)) return null;
  const doctor = await AiDoctor.findById(doctorId).lean();
  if (!doctor || !doctor.isActive) return null;
  const primary = await loadTarget(doctor.provider, doctor.modelId);
  const fallback = await loadTarget(doctor.fallbackProvider, doctor.fallbackModel);
  if (!primary && !fallback) return null;
  return {
    doctor: {
      id: String(doctor._id),
      name: doctor.name,
      designation: doctor.designation,
      tier: doctor.tier,
      consultMinutes: doctor.consultMinutes ?? null,
      maxUserMessages: doctor.maxUserMessages ?? null,
      alwaysAvailable: doctor.alwaysAvailable !== false,
      availability: doctor.availability ?? EMPTY_AVAILABILITY,
      slotCapacity: doctor.slotCapacity ?? 20,
    },
    primary: (primary ?? fallback)!,
    fallback: primary ? fallback : null,
  };
};
