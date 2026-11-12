/**
 * Keeps the underlying model and vendor private: consultants must never say
 * which company or model powers them, even if the model volunteers it.
 */
const VENDOR_PATTERN =
  /\b(open\s?ai|chat\s?gpt|gpt[\s-]?\d[\w.-]*|gpt-oss|deep\s?seek|qwen|alibaba|anthropic|claude|gemini|gemma|google\s+deepmind|meta\s+ai|llama|mistral|grok|x\.ai|moonshot|kimi|zhipu|glm-\d|minimax|large language model|language model|\bllm\b)\b/i;

export const mentionsVendor = (text: string): boolean => VENDOR_PATTERN.test(text);

/**
 * Removes sentences that mention a model or vendor. If nothing useful is left,
 * the consultant's standard self-introduction is used instead.
 */
export const scrubVendorMentions = (text: string, fallback: string): string => {
  if (!mentionsVendor(text)) return text;
  const kept = text
    .split(/(?<=[.!?।])\s+|\n+/)
    .filter((sentence) => sentence.trim() && !mentionsVendor(sentence))
    .join(' ')
    .trim();
  return kept.length >= 10 ? kept : fallback;
};

/** Recursively replaces vendor names inside every string of a report object */
export const redactVendorNames = <T>(value: T): T => {
  if (typeof value === 'string') {
    return (mentionsVendor(value) ? value.replace(new RegExp(VENDOR_PATTERN.source, 'gi'), 'VaidyaCure') : value) as T;
  }
  if (Array.isArray(value)) return value.map((v) => redactVendorNames(v)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, redactVendorNames(v)])) as T;
  }
  return value;
};
