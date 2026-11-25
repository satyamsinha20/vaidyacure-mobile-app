import { Remedy } from '../../models/Remedy.js';
import { toEnglishQuery } from '../search/dictionary.js';
import type { ConsultReport } from './report.js';

/**
 * The Library Doctor recommends only remedies that exist (Verified) in the
 * VaidyaCure library. The most relevant library items for the conversation
 * are given to the model, and anything else it names is removed afterwards.
 */
export interface LibraryItem {
  id: string;
  name: string;
  category: string;
  symptoms: string[];
  uses: string[];
  dosage: string;
  precautions: string;
}

const STOP_WORDS = new Set(
  (
    'the and for with that this have from since days day week weeks month months year years also very much more some what when ' +
    'about there their they them your you are was were been being into over after before because pain mild severe little lot ' +
    'feel feeling having getting since doctor please thanks thank okay yes not any have has had can could would should will ' +
    'mujhe mera meri mere hai hain tha thi raha rahi rahe kuch bahut bhi nahi nhi aur kya kab kaise abhi sath saath din hafte'
  ).split(' ')
);

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const termsOf = (text: string): string[] => {
  const english = toEnglishQuery(text.slice(0, 4000));
  const words = `${english} ${text}`
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
  return Array.from(new Set(words)).slice(0, 30);
};

/** Library items that best match what the patient described (most symptom matches first) */
export const findLibraryItems = async (patientText: string, limit = 12): Promise<LibraryItem[]> => {
  const terms = termsOf(patientText);
  if (!terms.length) return [];
  const patterns = terms.map((t) => new RegExp(escapeRegex(t), 'i'));
  const docs = await Remedy.find({
    status: 'Verified',
    $or: patterns.flatMap((re) => [{ symptoms: re }, { uses: re }, { name: re }]),
  })
    .limit(120)
    .lean();

  const scored = docs.map((d) => {
    let score = 0;
    for (const re of patterns) {
      if ((d.symptoms ?? []).some((s) => re.test(s))) score += 3;
      if ((d.uses ?? []).some((u) => re.test(u))) score += 2;
      if (re.test(d.name)) score += 2;
      if (d.excerpt && re.test(d.excerpt)) score += 1;
    }
    return { d, score };
  });
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ d }) => ({
      id: String(d._id),
      name: d.name,
      category: d.category,
      symptoms: (d.symptoms ?? []).slice(0, 8),
      uses: (d.uses ?? []).slice(0, 5),
      dosage: (d.dosage ?? '').slice(0, 300),
      precautions: (d.precautions ?? '').slice(0, 300),
    }));
};

export const libraryPromptBlock = (items: LibraryItem[]): string =>
  `<library_remedies>\n${JSON.stringify(
    items.map(({ id: _id, ...rest }) => rest),
    null,
    0
  )}\n</library_remedies>

LIBRARY DOCTOR RULES (these override any other instruction about remedies):
- You are the VaidyaCure Library Doctor. In "remedies" you may recommend ONLY items listed in <library_remedies>, using each item's exact "name".
- Put allopathic, first-aid and supplements items under allopathy; homeopathy items under homeopathy; herbs, ayurveda, oils, flowers and wellness items under ayurveda.
- Base the dosage on the item's "dosage" text and respect its "precautions". You may combine several listed items when they suit this patient.
- If no listed item suits a system, set that system's "available" to false with a short reason. Never name any medicine or remedy that is not in the list.
- Everything else (triage, conditions, warning signs, tests, home care, diet) is written as usual.`;

const normalize = (name: string) => name.toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9]+/g, '');

const matchItem = (name: string, items: LibraryItem[]): LibraryItem | null => {
  const wanted = normalize(name);
  if (wanted.length < 3) return null;
  return (
    items.find((i) => normalize(i.name) === wanted) ??
    items.find((i) => {
      const have = normalize(i.name);
      return have.length >= 5 && wanted.length >= 5 && (have.includes(wanted) || wanted.includes(have));
    }) ??
    null
  );
};

/** Removes every remedy that is not a library item and links the rest to the library */
export const keepOnlyLibraryRemedies = (report: ConsultReport, items: LibraryItem[]): ConsultReport => {
  const used = new Map<string, LibraryItem>();
  const systems = { ...report.remedies };
  for (const key of ['allopathy', 'ayurveda', 'homeopathy'] as const) {
    const system = systems[key];
    const kept = system.items
      .map((item) => {
        const match = matchItem(item.name, items);
        if (!match) return null;
        used.set(match.id, match);
        return { ...item, name: match.name };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
    systems[key] = kept.length
      ? { ...system, available: true, unavailableReason: null, items: kept }
      : {
          available: false,
          unavailableReason: system.available ? 'No matching remedy in the VaidyaCure library for this problem.' : system.unavailableReason,
          note: system.note,
          items: [],
        };
  }
  return {
    ...report,
    remedies: systems,
    library: Array.from(used.values()).map((i) => ({ id: i.id, name: i.name, category: i.category })),
  };
};
