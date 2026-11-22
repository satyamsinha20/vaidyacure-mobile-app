import os from 'os';
import { createWorker, type Worker } from 'tesseract.js';

/**
 * Free OCR (Tesseract) for camera search: reads the printed name on a medicine
 * strip or box. The worker is created once per server instance and reused.
 */
let workerPromise: Promise<Worker> | null = null;

const getWorker = (): Promise<Worker> => {
  if (!workerPromise) {
    workerPromise = createWorker('eng', 1, { cachePath: os.tmpdir() }).catch((error) => {
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
};

const NOISE = /^(tablets?|capsules?|syrup|ip|bp|usp|mg|ml|each|contains|batch|mfg|exp|mrp|rs|price|incl|of|all|taxes|store|below|keep|out|reach|children|schedule|prescription|only|drug|warning|manufactured|marketed|by|ltd|limited|pvt|india|for|use|the|and|with|film|coated|strip|pack)$/i;

/** Lines and words that are most likely the medicine name, best first */
const pickCandidates = (text: string): string[] => {
  const lines = text
    .split('\n')
    .map((l) => l.replace(/[^A-Za-z0-9 .\-+]/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((l) => /[A-Za-z]{3,}/.test(l) && l.length <= 40);

  const scored = lines.map((line) => {
    const words = line.split(' ').filter((w) => /[A-Za-z]{3,}/.test(w) && !NOISE.test(w));
    const upper = words.filter((w) => w === w.toUpperCase() && /[A-Z]/.test(w)).length;
    const strength = /\b\d{2,4}\s?(mg|ml|mcg|g)?\b/i.test(line) ? 2 : 0;
    return { text: words.slice(0, 3).join(' '), score: upper * 2 + strength + Math.min(words.length, 3) };
  });

  const unique = new Map<string, number>();
  for (const s of scored) {
    if (s.text.length >= 3 && !unique.has(s.text.toLowerCase())) unique.set(s.text.toLowerCase(), s.score);
  }
  return Array.from(unique.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([text]) => text.replace(/\b\w/g, (c) => c.toUpperCase()));
};

export const readMedicineText = async (image: Buffer): Promise<{ text: string; candidates: string[] }> => {
  const worker = await getWorker();
  const { data } = await worker.recognize(image);
  const text = (data.text || '').slice(0, 2000);
  return { text, candidates: pickCandidates(text) };
};
