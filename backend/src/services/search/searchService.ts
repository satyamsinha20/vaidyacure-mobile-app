import { SearchCache } from '../../models/SearchCache.js';
import { checkQuerySafety, type SafetyVerdict } from './safety.js';
import { toEnglishQuery } from './dictionary.js';
import { searchLibrary, searchMedlinePlus, searchOpenFda, searchWikipedia, type ArticleResult, type MedicineResult } from './sources.js';
import { identifiedFromLabel, identifyMedicine, type IdentifiedMedicine } from './medicineId.js';

export interface SearchResponse {
  query: string;
  englishQuery: string;
  blocked: Omit<SafetyVerdict, 'allowed'> | null;
  library: unknown[];
  medicines: MedicineResult[];
  articles: ArticleResult[];
  /** The salt behind a brand name (from the photo label, or worked out by AI) */
  identified: IdentifiedMedicine | null;
  empty: boolean;
}

export interface SearchOptions {
  /** Generic names printed on a photographed pack, e.g. "Paracetamol" */
  generic?: string;
  /** Needed to look up brand names with AI (spending limits are per device and IP) */
  who?: { deviceId?: string; ip: string };
}

const dedupe = <T,>(items: T[], keyOf: (item: T) => string): T[] => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyOf(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

interface ExternalResults {
  medicines: MedicineResult[];
  articles: ArticleResult[];
}

const CACHE_TTL_MS = 3 * 24 * 60 * 60 * 1000;
export const QUERY_MAX_LENGTH = 100;

/**
 * External sources change rarely, so their results are cached for 3 days.
 * The VaidyaCure library is always read live, so new items show up at once.
 */
const getExternalResults = async (englishQuery: string, mode: 'all' | 'medicine'): Promise<ExternalResults> => {
  const key = `${mode}:${englishQuery.toLowerCase()}`;
  const cached = await SearchCache.findOne({ key }).lean();
  if (cached) return cached.result as ExternalResults;

  const [medicines, medline, wiki] = await Promise.all([
    searchOpenFda(englishQuery, mode === 'medicine'),
    mode === 'medicine' ? Promise.resolve([]) : searchMedlinePlus(englishQuery),
    mode === 'medicine' ? Promise.resolve([]) : searchWikipedia(englishQuery),
  ]);
  const result: ExternalResults = { medicines, articles: [...medline, ...wiki] };
  const empty = medicines.length === 0 && result.articles.length === 0;

  await SearchCache.updateOne(
    { key },
    { $set: { result, expiresAt: new Date(Date.now() + (empty ? 60 * 60 * 1000 : CACHE_TTL_MS)) } },
    { upsert: true }
  ).catch(() => {});
  return result;
};

/**
 * Health search: safety filter, then the library and free medical sources in parallel.
 * A medicine brand (Pyregem, Dolo 650 …) is not in those sources, so its salt is found
 * (photo label, or AI) and the salt is searched too.
 */
export const runSearch = async (rawQuery: string, mode: 'all' | 'medicine', options: SearchOptions = {}): Promise<SearchResponse> => {
  const query = rawQuery.replace(/\s+/g, ' ').trim().slice(0, QUERY_MAX_LENGTH);
  const englishQuery = (toEnglishQuery(query) || query).slice(0, QUERY_MAX_LENGTH);
  const genericHint = (options.generic ?? '').replace(/\s+/g, ' ').trim().slice(0, QUERY_MAX_LENGTH);

  const verdict = checkQuerySafety(`${query} ${englishQuery} ${genericHint}`);
  if (!verdict.allowed) {
    const { allowed: _allowed, ...blocked } = verdict;
    return { query, englishQuery, blocked, library: [], medicines: [], articles: [], identified: null, empty: true };
  }

  const [library, external] = await Promise.all([searchLibrary([query, englishQuery]), getExternalResults(englishQuery, mode)]);

  let identified: IdentifiedMedicine | null = null;
  if (genericHint) {
    identified = identifiedFromLabel(query, genericHint);
  } else if (options.who && external.medicines.length === 0 && (mode === 'medicine' || library.length === 0)) {
    identified = await identifyMedicine(query, options.who);
  }

  let medicines = external.medicines;
  let articles = external.articles;
  let libraryItems: unknown[] = library;
  if (identified) {
    const generics = identified.generics.slice(0, 2);
    const [genericLibrary, ...genericExternal] = await Promise.all([
      searchLibrary(generics),
      ...generics.map((g) => getExternalResults((toEnglishQuery(g) || g).slice(0, QUERY_MAX_LENGTH), 'all')),
    ]);
    medicines = dedupe([...medicines, ...genericExternal.flatMap((r) => r.medicines)], (m) => m.name.toLowerCase()).slice(0, 4);
    articles = dedupe([...articles, ...genericExternal.flatMap((r) => r.articles)], (a) => a.url || a.title).slice(0, 5);
    libraryItems = dedupe([...library, ...genericLibrary], (d: any) => String(d.id)).slice(0, 8);
  }

  return {
    query,
    englishQuery,
    blocked: null,
    library: libraryItems,
    medicines,
    articles,
    identified,
    empty: libraryItems.length === 0 && medicines.length === 0 && articles.length === 0,
  };
};
