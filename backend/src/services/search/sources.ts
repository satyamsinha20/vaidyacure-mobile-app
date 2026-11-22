import { Remedy } from '../../models/Remedy.js';
import { US_DRUG_NAMES } from './dictionary.js';
import { isUnsafeText } from './safety.js';

/**
 * Free, keyless health sources. Every source is optional: a slow or failing
 * source simply returns nothing, the others still answer.
 */
const SOURCE_TIMEOUT_MS = 6_000;
const USER_AGENT = 'VaidyaCureHealthApp/1.0 (+https://github.com/satyamsinha20/vaidyacure-mobile-app)';

export interface ArticleResult {
  source: 'MedlinePlus' | 'Wikipedia';
  title: string;
  summary: string;
  url: string;
}

export interface MedicineResult {
  source: 'openFDA';
  name: string;
  genericName: string;
  purpose: string;
  uses: string;
  warnings: string;
  dosage: string;
  url: string;
}

const fetchWithTimeout = async (url: string, init: RequestInit = {}): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SOURCE_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal, headers: { 'User-Agent': USER_AGENT, ...(init.headers ?? {}) } });
  } finally {
    clearTimeout(timer);
  }
};

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const decodeEntities = (text: string) =>
  text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');

const stripTags = (html: string) => decodeEntities(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const truncate = (text: string, max: number) => (text.length > max ? `${text.slice(0, max).replace(/\s+\S*$/, '')}…` : text);

/* -------------------------------------------------------------------------- */
/* 1. VaidyaCure library (MongoDB, verified items only)                       */
/* -------------------------------------------------------------------------- */
export const searchLibrary = async (terms: string[]) => {
  const patterns = Array.from(new Set(terms.map((t) => t.trim()).filter((t) => t.length >= 2))).map(
    (t) => new RegExp(escapeRegex(t), 'i')
  );
  if (!patterns.length) return [];
  const or = patterns.flatMap((re) => [{ name: re }, { symptoms: re }, { uses: re }, { excerpt: re }, { variety: re }]);
  const docs = await Remedy.find({ status: 'Verified', $or: or }).sort({ updatedAt: -1 }).limit(8).lean();
  return docs.map((d) => ({ ...d, id: String(d._id) }));
};

/* -------------------------------------------------------------------------- */
/* 2. MedlinePlus health topics (US National Library of Medicine)             */
/* -------------------------------------------------------------------------- */
export const searchMedlinePlus = async (query: string): Promise<ArticleResult[]> => {
  try {
    const res = await fetchWithTimeout(
      `https://wsearch.nlm.nih.gov/ws/query?db=healthTopics&retmax=4&term=${encodeURIComponent(query)}`
    );
    if (!res.ok) return [];
    const xml = await res.text();
    const results: ArticleResult[] = [];
    const docRe = /<document[^>]*url="([^"]+)"[^>]*>([\s\S]*?)<\/document>/g;
    let match: RegExpExecArray | null;
    while ((match = docRe.exec(xml)) && results.length < 3) {
      const body = match[2];
      const field = (name: string) => {
        const m = body.match(new RegExp(`<content name="${name}">([\\s\\S]*?)</content>`));
        return m ? stripTags(m[1]) : '';
      };
      const title = field('title');
      const summary = field('FullSummary') || field('snippet');
      if (title && summary) {
        results.push({ source: 'MedlinePlus', title, summary: truncate(summary, 600), url: decodeEntities(match[1]) });
      }
    }
    return results;
  } catch {
    return [];
  }
};

/* -------------------------------------------------------------------------- */
/* 3. Wikipedia (health-related articles only)                                */
/* -------------------------------------------------------------------------- */
const HEALTH_WORDS =
  /\b(health|medical|medicine|medicinal|disease|disorder|symptom|syndrome|infection|treatment|therapy|clinical|drug|nutrition|nutrient|vitamin|mineral|diet|caffeine|herb|herbal|ayurved\w*|homeopath\w*|pain|cancer|blood|immune|body|patient|physician|pharmac\w*|toxic|allerg\w*|inflammation)\b/i;

type WikiPage = { title: string; extract?: string; fullurl?: string; index?: number };

const wikiSearch = async (search: string): Promise<WikiPage[]> => {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    generator: 'search',
    gsrsearch: search,
    gsrlimit: '5',
    prop: 'extracts|info',
    exintro: '1',
    explaintext: '1',
    exsentences: '4',
    inprop: 'url',
  });
  const res = await fetchWithTimeout(`https://en.wikipedia.org/w/api.php?${params}`);
  if (!res.ok) return [];
  const body = (await res.json()) as { query?: { pages?: WikiPage[] } };
  return (body.query?.pages ?? []).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
};

export const searchWikipedia = async (query: string): Promise<ArticleResult[]> => {
  try {
    // Plain search finds the topic itself ("Curcumin"), "+ health" finds health angles
    // ("Health effects of coffee"); both run in parallel
    const [plain, health] = await Promise.all([wikiSearch(query), wikiSearch(`${query} health`)]);
    const words = query.toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
    const seen = new Set<string>();
    return [...plain, ...health]
      .filter((p) => {
        if (seen.has(p.title)) return false;
        seen.add(p.title);
        return Boolean(p.extract) && HEALTH_WORDS.test(p.extract!) && !isUnsafeText(`${p.title} ${p.extract}`);
      })
      .map((p) => ({ page: p, titleMatch: words.some((w) => p.title.toLowerCase().includes(w)) ? 1 : 0 }))
      .sort((a, b) => b.titleMatch - a.titleMatch)
      .slice(0, 2)
      .map(({ page }) => ({ source: 'Wikipedia' as const, title: page.title, summary: truncate(page.extract!.trim(), 600), url: page.fullurl ?? '' }));
  } catch {
    return [];
  }
};

/* -------------------------------------------------------------------------- */
/* 4. openFDA drug labels (for medicine names)                                */
/* -------------------------------------------------------------------------- */
export const searchOpenFda = async (query: string, medicineMode: boolean): Promise<MedicineResult[]> => {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 3) return [];
  const name = words.map((w) => US_DRUG_NAMES[w] ?? w).join(' ').replace(/[^a-z0-9 -]/g, '');
  if (name.length < 3) return [];
  const term = `"${name}"`;
  // General searches match generic drug names only (avoids odd products for words like "coffee");
  // camera (medicine) searches also match brand names
  const search = medicineMode
    ? `openfda.generic_name:${term}+openfda.brand_name:${term}+openfda.substance_name:${term}`
    : `openfda.generic_name:${term}`;
  try {
    const res = await fetchWithTimeout(`https://api.fda.gov/drug/label.json?search=${encodeURIComponent(search).replace(/%2B/g, '+')}&limit=2`);
    if (!res.ok) return [];
    const body = (await res.json()) as { results?: any[] };
    const first = (v: unknown) => (Array.isArray(v) && typeof v[0] === 'string' ? stripTags(v[0]) : '');
    // openFDA matches words inside long product names; keep only real matches
    const matches = (r: any) => {
      const names = [...(r.openfda?.generic_name ?? []), ...(medicineMode ? r.openfda?.brand_name ?? [] : [])].map((n: string) => n.toLowerCase().trim());
      return names.some((n) => n === name || (medicineMode && n.startsWith(`${name} `)));
    };
    return (body.results ?? []).filter(matches).map((r) => ({
      source: 'openFDA' as const,
      name: first(r.openfda?.brand_name) || first(r.openfda?.generic_name) || name,
      genericName: first(r.openfda?.generic_name),
      purpose: truncate(first(r.purpose), 300),
      uses: truncate(first(r.indications_and_usage), 500),
      warnings: truncate(first(r.warnings) || first(r.boxed_warning), 500),
      dosage: truncate(first(r.dosage_and_administration), 400),
      url: `https://open.fda.gov/apis/drug/label/`,
    }));
  } catch {
    return [];
  }
};
