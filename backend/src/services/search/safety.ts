/**
 * Query safety filter for the app's health search. Runs before any external
 * request: explicit sexual content, abuse, harassment, violence and drug-abuse
 * intent are blocked; self-harm queries get a helpline instead of results.
 * Clinical sexual-health terms (pregnancy, STI, contraception …) stay allowed.
 */
export type BlockReason = 'explicit' | 'abusive' | 'violence' | 'drugs' | 'self_harm';

export interface SafetyVerdict {
  allowed: boolean;
  reason?: BlockReason;
  message?: string;
  helpline?: { name: string; phone: string };
}

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's', '!': 'i' };

/** Lowercase, undo leetspeak, keep letters (Latin + Devanagari) and single spaces */
const normalizeForSafety = (query: string): string =>
  query
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[013457@$!]/g, (c) => LEET[c] ?? c)
    .replace(/[^a-zऀ-ॿ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Whole words (after normalisation)
const EXPLICIT_WORDS = new Set([
  'porn', 'porno', 'pornography', 'xxx', 'nude', 'nudes', 'naked', 'sexy', 'boobs', 'tits', 'pussy', 'dick', 'cock',
  'blowjob', 'handjob', 'hentai', 'onlyfans', 'escort', 'escorts', 'callgirl', 'prostitute', 'hooker', 'camgirl', 'nsfw',
  'fetish', 'bdsm', 'orgy', 'threesome', 'milf', 'incest', 'xnxx', 'xvideos', 'pornhub', 'brazzers', 'chudai', 'chut',
  'lund', 'randi', 'nangi', 'nanga', 'sexvideo', 'sexvideos', 'masturbate', 'masturbation',
]);

const ABUSIVE_WORDS = new Set([
  'fuck', 'fucker', 'fucking', 'motherfucker', 'bitch', 'bastard', 'slut', 'whore', 'asshole', 'cunt', 'madarchod',
  'madarchot', 'behenchod', 'bhenchod', 'benchod', 'chutiya', 'chutiye', 'bhosdi', 'bhosdike', 'bhosda', 'gandu', 'gaandu',
  'lauda', 'lavda', 'loda', 'harami', 'haramkhor', 'kamina', 'kamine', 'kutiya',
]);

// Phrases (checked on the normalised text)
const VIOLENCE_PHRASES = [
  'how to kill', 'kill someone', 'murder', 'poison someone', 'poison my', 'make a bomb', 'make bomb',
  'acid attack', 'how to rape', 'rape someone', 'stalk', 'harass', 'revenge porn', 'kidnap',
];
const DRUG_PHRASES = [
  'buy weed', 'buy ganja', 'buy cocaine', 'buy heroin', 'buy meth', 'make meth', 'cook meth', 'get high',
  'drug dealer', 'ganja kaha', 'charas kaha', 'smack kaha', 'how to make drugs',
];
const SELF_HARM_PHRASES = [
  'suicide', 'kill myself', 'end my life', 'want to die', 'self harm', 'cut myself', 'hang myself', 'khudkushi',
  'khudkhushi', 'aatmahatya', 'atmahatya', 'marna chahta', 'marna chahti', 'jeena nahi', 'jina nahi', 'mar jana',
  'आत्महत्या', 'खुदकुशी',
];

// Strings that are unmistakable even when letters are spaced out ("p o r n")
const COMPACT_EXPLICIT = ['porn', 'xnxx', 'xvideos', 'pornhub', 'onlyfans', 'blowjob', 'hentai', 'chudai', 'madarchod', 'behenchod', 'bhenchod', 'chutiya', 'motherfucker'];

// "sex" alone is blocked, but allowed with a clinical context word
const SEX_CONTEXT_WORDS = [
  'health', 'education', 'transmitted', 'hormone', 'hormones', 'safe', 'problem', 'problems', 'weakness', 'drive',
  'pain', 'disease', 'infection', 'determination', 'chromosome', 'therapy', 'after', 'during', 'pregnancy',
];

const BLOCK_MESSAGE: Record<Exclude<BlockReason, 'self_harm'>, string> = {
  explicit: 'This search is not allowed. VaidyaCure search is only for health, medicines and wellness.',
  abusive: 'Please use respectful language. VaidyaCure search is only for health, medicines and wellness.',
  violence: 'This search is not allowed. If someone is in danger, call 112 immediately.',
  drugs: 'This search is not allowed. For help with addiction, talk to a doctor or call the Tele-MANAS helpline 14416.',
};

export const checkQuerySafety = (query: string): SafetyVerdict => {
  const text = normalizeForSafety(query);
  const words = text.split(' ').filter(Boolean);
  const compact = text.replace(/\s+/g, '');

  if (SELF_HARM_PHRASES.some((p) => text.includes(p) || query.includes(p))) {
    return {
      allowed: false,
      reason: 'self_harm',
      message: "You don't have to go through this alone. Please talk to someone right now — free, confidential help is available 24×7.",
      helpline: { name: 'Tele-MANAS (Govt. of India)', phone: '14416' },
    };
  }
  if (words.some((w) => EXPLICIT_WORDS.has(w)) || COMPACT_EXPLICIT.some((w) => compact.includes(w))) {
    return { allowed: false, reason: 'explicit', message: BLOCK_MESSAGE.explicit };
  }
  if (words.some((w) => ABUSIVE_WORDS.has(w))) {
    return { allowed: false, reason: 'abusive', message: BLOCK_MESSAGE.abusive };
  }
  if (words.includes('sex') && !words.some((w) => SEX_CONTEXT_WORDS.includes(w))) {
    return { allowed: false, reason: 'explicit', message: BLOCK_MESSAGE.explicit };
  }
  if (VIOLENCE_PHRASES.some((p) => text.includes(p))) {
    return { allowed: false, reason: 'violence', message: BLOCK_MESSAGE.violence };
  }
  if (DRUG_PHRASES.some((p) => text.includes(p))) {
    return { allowed: false, reason: 'drugs', message: BLOCK_MESSAGE.drugs };
  }
  return { allowed: true };
};

/** True if a result text itself contains explicit or abusive words */
export const isUnsafeText = (value: string): boolean => {
  const words = normalizeForSafety(value).split(' ');
  return words.some((w) => EXPLICIT_WORDS.has(w) || ABUSIVE_WORDS.has(w));
};
