/**
 * Keeps patients and doctors on the platform: contact details and payment
 * handles are hidden from the other side (so no money can move outside
 * VaidyaCure), and suspicious messages are flagged for the admin's safety log.
 */
const RULES: Array<{ flag: string; pattern: RegExp }> = [
  { flag: 'email', pattern: /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/gi },
  { flag: 'upi', pattern: /\b[A-Z0-9._-]{2,}@[A-Z]{2,}\b/gi },
  { flag: 'link', pattern: /\b(?:https?:\/\/|www\.)\S+/gi },
  // Indian mobile numbers, with or without +91, spaces or dashes
  { flag: 'phone', pattern: /(?<!\d)(?:\+?91[\s-]?|0)?[6-9](?:[\s-]?\d){9}(?!\d)/g },
  // Bank account numbers (9 to 18 digits in a row)
  { flag: 'account_number', pattern: /(?<!\d)\d{9,18}(?!\d)/g },
];

const PAYMENT_WORDS =
  /\b(gpay|google ?pay|phone ?pe|paytm|bhim|upi|ifsc|account (?:no|number)|bank account|pay (?:me|directly|outside)|direct(?:ly)? pay|send (?:me )?money|cash|whats ?app|telegram|instagram|call me)\b/i;

const ABUSE_WORDS = /\b(fuck|bitch|bastard|chutiya|madarchod|bhenchod|randi|harami)\b/i;

export interface ScannedMessage {
  /** What the other person sees */
  text: string;
  flags: string[];
}

export const scanChatMessage = (raw: string): ScannedMessage => {
  let text = raw;
  const flags = new Set<string>();
  for (const rule of RULES) {
    text = text.replace(rule.pattern, () => {
      flags.add(rule.flag);
      return '[hidden by VaidyaCure]';
    });
  }
  if (PAYMENT_WORDS.test(raw)) flags.add('payment_words');
  if (ABUSE_WORDS.test(raw)) flags.add('abuse');
  return { text, flags: Array.from(flags) };
};
