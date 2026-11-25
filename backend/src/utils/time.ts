/**
 * India time helpers. Doctor hours, slots, reminders and weekly payouts all
 * follow Indian Standard Time (UTC+5:30, no daylight saving), while dates are
 * stored in MongoDB as normal UTC instants.
 */
export const IST_TIME_ZONE = 'Asia/Kolkata';
const IST_OFFSET_MS = 330 * 60 * 1000;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
export const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const shifted = (d: Date) => new Date(d.getTime() + IST_OFFSET_MS);

/** "YYYY-MM-DD" of the instant in India */
export const istDateKey = (d: Date = new Date()): string => shifted(d).toISOString().slice(0, 10);

/** Day of the week in India, 0 = Sunday */
export const istWeekday = (d: Date): number => shifted(d).getUTCDay();

/** Minutes since midnight in India */
export const istMinutes = (d: Date): number => {
  const x = shifted(d);
  return x.getUTCHours() * 60 + x.getUTCMinutes();
};

export const isDateKey = (value: string): boolean => DATE_KEY.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

export const hhmmToMinutes = (value: string): number => {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
};

export const minutesToHhmm = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** The UTC instant of an India date and "HH:mm" time */
export const istInstant = (dateKey: string, hhmm: string): Date => {
  const [y, mo, d] = dateKey.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h, mi) - IST_OFFSET_MS);
};

export const addDaysToKey = (dateKey: string, days: number): string => {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export const weekdayOfKey = (dateKey: string): number => new Date(`${dateKey}T00:00:00Z`).getUTCDay();

/** Monday (India) of the week that contains the instant: payouts run Monday to Sunday */
export const istWeekStart = (d: Date): string => addDaysToKey(istDateKey(d), -((istWeekday(d) + 6) % 7));

/** "25 Nov 2026, 10:30 am" in India time, for emails and admin screens */
export const formatIst = (d: Date): string =>
  d.toLocaleString('en-IN', { timeZone: IST_TIME_ZONE, day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

export const MINUTE_MS = 60 * 1000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;
