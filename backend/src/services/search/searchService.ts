import { SearchCache } from '../../models/SearchCache.js';
import { checkQuerySafety, type SafetyVerdict } from './safety.js';
import { toEnglishQuery } from './dictionary.js';
import { searchLibrary, searchMedlinePlus, searchOpenFda, searchWikipedia, type ArticleResult, type MedicineResult } from './sources.js';

export interface SearchResponse {
  query: string;
  englishQuery: string;
  blocked: Omit<SafetyVerdict, 'allowed'> | null;
  library: unknown[];
  medicines: MedicineResult[];
  articles: ArticleResult[];
  empty: boolean;
}

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

/** Health search: safety filter, then the library and free medical sources in parallel */
export const runSearch = async (rawQuery: string, mode: 'all' | 'medicine'): Promise<SearchResponse> => {
  const query = rawQuery.replace(/\s+/g, ' ').trim().slice(0, QUERY_MAX_LENGTH);
  const englishQuery = (toEnglishQuery(query) || query).slice(0, QUERY_MAX_LENGTH);

  const verdict = checkQuerySafety(`${query} ${englishQuery}`);
  if (!verdict.allowed) {
    const { allowed: _allowed, ...blocked } = verdict;
    return { query, englishQuery, blocked, library: [], medicines: [], articles: [], empty: true };
  }

  const [library, external] = await Promise.all([searchLibrary([query, englishQuery]), getExternalResults(englishQuery, mode)]);
  return {
    query,
    englishQuery,
    blocked: null,
    library,
    ...external,
    empty: library.length === 0 && external.medicines.length === 0 && external.articles.length === 0,
  };
};
