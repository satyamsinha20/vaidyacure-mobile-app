"use client";

import React, { useState } from "react";
import { Check, Copy, Plus, Trash2, X } from "lucide-react";
import { inputClass, ghostBtn } from "@/components/ai-doctor/ui";

/* -------------------------------------------------------------------------- */
/* FORMATTING (India time and rupees)                                         */
/* -------------------------------------------------------------------------- */
export const inr = (rupees: number | null | undefined) =>
  `₹${Number(rupees ?? 0).toLocaleString("en-IN", { minimumFractionDigits: rupees && rupees % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

export const when = (iso: string | Date | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
    : "—";

export const dateOnly = (iso: string | Date | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" }) : "—";

export const minutesLeft = (iso: string | null | undefined, now = Date.now()) => {
  if (!iso) return null;
  return Math.max(0, Math.round((new Date(iso).getTime() - now) / 1000));
};

export const clock = (seconds: number | null) => {
  if (seconds === null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

/* -------------------------------------------------------------------------- */
/* STATUS                                                                     */
/* -------------------------------------------------------------------------- */
const STATUS: Record<string, { label: string; cls: string }> = {
  awaiting_payment: { label: "Waiting for payment", cls: "bg-gray-50 text-gray-600 border-gray-200" },
  payment_review: { label: "Payment to check", cls: "bg-amber-50 text-amber-800 border-amber-200" },
  confirmed: { label: "Confirmed", cls: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  in_progress: { label: "In progress", cls: "bg-sky-50 text-sky-800 border-sky-200" },
  chat_ended: { label: "Report pending", cls: "bg-violet-50 text-violet-800 border-violet-200" },
  completed: { label: "Completed", cls: "bg-emerald-100 text-emerald-900 border-emerald-300" },
  doctor_no_show: { label: "Doctor did not join", cls: "bg-rose-50 text-rose-800 border-rose-200" },
  patient_no_show: { label: "Patient did not join", cls: "bg-orange-50 text-orange-800 border-orange-200" },
  cancelled: { label: "Cancelled", cls: "bg-gray-100 text-gray-600 border-gray-200" },
  payment_rejected: { label: "Payment rejected", cls: "bg-rose-50 text-rose-700 border-rose-200" },
  expired: { label: "Expired", cls: "bg-gray-100 text-gray-500 border-gray-200" },
  missed: { label: "Missed", cls: "bg-gray-100 text-gray-500 border-gray-200" },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, cls: "bg-gray-50 text-gray-600 border-gray-200" };
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${s.cls}`}>{s.label}</span>;
}

export function Card({ title, subtitle, actions, children }: { title?: string; subtitle?: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="p-4 rounded-2xl bg-white border border-gray-200 shadow-2xs space-y-3">
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            {title && <h3 className="text-sm font-black text-gray-900">{title}</h3>}
            {subtitle && <p className="text-[11px] text-gray-500 mt-0.5">{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Empty({ text }: { text: string }) {
  return <p className="text-xs text-gray-500 p-4 text-center bg-white rounded-2xl border border-dashed border-gray-200">{text}</p>;
}

export function Stat({ label, value, hint, tone = "gray" }: { label: string; value: React.ReactNode; hint?: string; tone?: "gray" | "green" | "amber" | "rose" | "sky" }) {
  const tones = {
    gray: "bg-white border-gray-200",
    green: "bg-emerald-50 border-emerald-200",
    amber: "bg-amber-50 border-amber-200",
    rose: "bg-rose-50 border-rose-200",
    sky: "bg-sky-50 border-sky-200",
  };
  return (
    <div className={`p-3 rounded-2xl border ${tones[tone]}`}>
      <p className="text-[10.5px] font-bold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-lg font-black text-gray-900 mt-0.5">{value}</p>
      {hint && <p className="text-[10.5px] text-gray-500 mt-0.5">{hint}</p>}
    </div>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={ghostBtn}
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
    >
      {done ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />} {done ? "Copied" : label}
    </button>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: Array<{ key: T; label: string; count?: number }>; value: T; onChange: (key: T) => void }) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all cursor-pointer whitespace-nowrap ${
            value === t.key ? "bg-[#0D4827] text-white border-[#0D4827]" : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
          }`}
        >
          {t.label}
          {t.count ? <span className={`px-1.5 rounded-full text-[10px] ${value === t.key ? "bg-white/20" : "bg-amber-100 text-amber-800"}`}>{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* WEEKLY HOURS                                                               */
/* -------------------------------------------------------------------------- */
export interface WeeklyHours {
  day: number;
  start: string;
  end: string;
}

export interface Availability {
  weekly: WeeklyHours[];
  daysOff: string[];
}

const DAYS = [
  { day: 1, label: "Mon" },
  { day: 2, label: "Tue" },
  { day: 3, label: "Wed" },
  { day: 4, label: "Thu" },
  { day: 5, label: "Fri" },
  { day: 6, label: "Sat" },
  { day: 0, label: "Sun" },
];

/** Working hours per weekday (India time), with several ranges per day and days off */
export function WeeklyHoursEditor({ value, onChange }: { value: Availability; onChange: (v: Availability) => void }) {
  const [offDate, setOffDate] = useState("");
  const update = (weekly: WeeklyHours[]) => onChange({ ...value, weekly });

  const copyToAll = (day: number) => {
    const ranges = value.weekly.filter((r) => r.day === day);
    update(DAYS.flatMap((d) => ranges.map((r) => ({ ...r, day: d.day }))));
  };

  return (
    <div className="space-y-2">
      {DAYS.map(({ day, label }) => {
        const ranges = value.weekly.map((r, i) => ({ ...r, i })).filter((r) => r.day === day);
        return (
          <div key={day} className="flex flex-wrap items-center gap-2 p-2 rounded-xl bg-gray-50 border border-gray-100">
            <span className="w-10 text-xs font-bold text-gray-700">{label}</span>
            {ranges.length === 0 && <span className="text-[11px] text-gray-400">Not working</span>}
            {ranges.map((r) => (
              <span key={r.i} className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl px-1.5 py-1">
                <input
                  type="time"
                  className="text-xs outline-none"
                  value={r.start}
                  onChange={(e) => update(value.weekly.map((x, j) => (j === r.i ? { ...x, start: e.target.value } : x)))}
                />
                <span className="text-gray-400 text-xs">–</span>
                <input
                  type="time"
                  className="text-xs outline-none"
                  value={r.end}
                  onChange={(e) => update(value.weekly.map((x, j) => (j === r.i ? { ...x, end: e.target.value } : x)))}
                />
                <button type="button" className="text-gray-400 hover:text-rose-600 cursor-pointer" onClick={() => update(value.weekly.filter((_, j) => j !== r.i))}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
            <button
              type="button"
              className="text-[11px] font-semibold text-emerald-700 hover:underline cursor-pointer inline-flex items-center gap-0.5"
              onClick={() => update([...value.weekly, { day, start: "10:00", end: "13:00" }])}
            >
              <Plus className="w-3 h-3" /> Add time
            </button>
            {ranges.length > 0 && (
              <button type="button" className="text-[11px] text-gray-500 hover:underline cursor-pointer ml-auto" onClick={() => copyToAll(day)}>
                Copy to all days
              </button>
            )}
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <span className="text-xs font-bold text-gray-700">Days off</span>
        <input type="date" className={`${inputClass} w-40`} value={offDate} onChange={(e) => setOffDate(e.target.value)} />
        <button
          type="button"
          className={ghostBtn}
          disabled={!offDate}
          onClick={() => {
            if (offDate && !value.daysOff.includes(offDate)) onChange({ ...value, daysOff: [...value.daysOff, offDate].sort() });
            setOffDate("");
          }}
        >
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
        {value.daysOff.map((d) => (
          <span key={d} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 border border-rose-200 text-[11px] text-rose-800">
            {dateOnly(`${d}T12:00:00+05:30`)}
            <button type="button" className="cursor-pointer" onClick={() => onChange({ ...value, daysOff: value.daysOff.filter((x) => x !== d) })}>
              <Trash2 className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
      <p className="text-[10.5px] text-gray-500">All times are India time (IST).</p>
    </div>
  );
}
