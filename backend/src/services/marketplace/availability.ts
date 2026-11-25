import { z } from 'zod';
import type { IAvailability } from '../../models/availability.js';
import {
  HHMM,
  addDaysToKey,
  hhmmToMinutes,
  isDateKey,
  istDateKey,
  istInstant,
  istMinutes,
  istWeekday,
  minutesToHhmm,
  weekdayOfKey,
} from '../../utils/time.js';

/** Working hours as entered in the doctor panel / admin panel */
export const AvailabilityInputSchema = z
  .object({
    weekly: z
      .array(
        z.object({
          day: z.number().int().min(0).max(6),
          start: z.string().regex(HHMM, 'Use HH:mm, e.g. 09:30'),
          end: z.string().regex(HHMM, 'Use HH:mm, e.g. 13:00'),
        })
      )
      .max(28, 'Too many time ranges'),
    daysOff: z
      .array(z.string().refine(isDateKey, 'Use a date like 2026-12-25'))
      .max(60, 'Too many days off')
      .default([]),
  })
  .superRefine((value, ctx) => {
    for (let day = 0; day <= 6; day++) {
      const ranges = value.weekly
        .filter((r) => r.day === day)
        .map((r) => [hhmmToMinutes(r.start), hhmmToMinutes(r.end)] as const)
        .sort((a, b) => a[0] - b[0]);
      if (ranges.length > 4) ctx.addIssue({ code: 'custom', message: 'At most 4 time ranges per day', path: ['weekly'] });
      ranges.forEach(([start, end], i) => {
        if (end <= start) ctx.addIssue({ code: 'custom', message: 'End time must be after start time', path: ['weekly'] });
        if (i > 0 && start < ranges[i - 1][1]) ctx.addIssue({ code: 'custom', message: 'Time ranges overlap', path: ['weekly'] });
      });
    }
  });

export type AvailabilityInput = z.infer<typeof AvailabilityInputSchema>;

export const cleanAvailability = (input: AvailabilityInput): IAvailability => ({
  weekly: [...input.weekly].sort((a, b) => a.day - b.day || hhmmToMinutes(a.start) - hhmmToMinutes(b.start)),
  daysOff: Array.from(new Set(input.daysOff)).sort().filter((d) => d >= istDateKey(new Date(Date.now() - 86_400_000))),
});

export interface Slot {
  start: Date;
  end: Date;
}

/**
 * Bookable slots of one India date: each working range is cut into
 * consultations of `consultMinutes` with `gapMinutes` between them.
 */
export const slotsForDate = (availability: IAvailability, dateKey: string, consultMinutes: number, gapMinutes: number): Slot[] => {
  if (!isDateKey(dateKey) || availability.daysOff?.includes(dateKey)) return [];
  const weekday = weekdayOfKey(dateKey);
  const slots: Slot[] = [];
  for (const range of availability.weekly ?? []) {
    if (range.day !== weekday) continue;
    const end = hhmmToMinutes(range.end);
    for (let t = hhmmToMinutes(range.start); t + consultMinutes <= end; t += consultMinutes + gapMinutes) {
      slots.push({ start: istInstant(dateKey, minutesToHhmm(t)), end: istInstant(dateKey, minutesToHhmm(t + consultMinutes)) });
    }
  }
  return slots.sort((a, b) => a.start.getTime() - b.start.getTime());
};

/** The slot that starts exactly at `start` (a booking request must match a real slot) */
export const findSlot = (availability: IAvailability, start: Date, consultMinutes: number, gapMinutes: number): Slot | null =>
  slotsForDate(availability, istDateKey(start), consultMinutes, gapMinutes).find((s) => s.start.getTime() === start.getTime()) ?? null;

export const hasAnyHours = (availability: IAvailability | undefined | null): boolean => Boolean(availability?.weekly?.length);

/** Inside working hours right now (AI doctors with fixed hours) */
export const isWithinHours = (availability: IAvailability, at: Date = new Date()): boolean => {
  if (availability.daysOff?.includes(istDateKey(at))) return false;
  const weekday = istWeekday(at);
  const minute = istMinutes(at);
  return (availability.weekly ?? []).some((r) => r.day === weekday && hhmmToMinutes(r.start) <= minute && minute < hhmmToMinutes(r.end));
};

/** When the doctor is next available (now if inside hours), within two weeks */
export const nextAvailableAt = (availability: IAvailability, from: Date = new Date()): Date | null => {
  if (isWithinHours(availability, from)) return from;
  const today = istDateKey(from);
  for (let i = 0; i < 15; i++) {
    const key = addDaysToKey(today, i);
    if (availability.daysOff?.includes(key)) continue;
    const starts = (availability.weekly ?? [])
      .filter((r) => r.day === weekdayOfKey(key))
      .map((r) => istInstant(key, r.start))
      .filter((d) => d.getTime() > from.getTime())
      .sort((a, b) => a.getTime() - b.getTime());
    if (starts.length) return starts[0];
  }
  return null;
};
