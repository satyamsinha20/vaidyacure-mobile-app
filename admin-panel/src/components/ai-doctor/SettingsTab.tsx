"use client";

import React, { useEffect, useState } from "react";
import { aiDoctorService, AiSettings } from "@/services/aiDoctor.service";
import { Field, Spinner, errorMessage, inputClass, primaryBtn } from "./ui";

interface Props {
  settings: AiSettings | null;
  onSaved: (s: AiSettings) => void;
  notify: (message: string, kind?: "success" | "error") => void;
}

const NUMBER_FIELDS: Array<{ key: keyof AiSettings; label: string; hint: string; min: number; max: number }> = [
  { key: "premiumPriceInr", label: "Premium price (₹)", hint: "Price of one premium consultation.", min: 1, max: 5000 },
  { key: "premiumAdsRequired", label: "Ads to unlock premium", hint: "Rewarded ads needed for one premium consultation.", min: 1, max: 10 },
  { key: "consultationSeconds", label: "Consultation length (seconds)", hint: "180 = 3 minutes of chat.", min: 60, max: 900 },
  { key: "maxUserMessages", label: "Max patient messages", hint: "Per consultation; the report is generated after.", min: 2, max: 20 },
  { key: "freeConsultsPerDevicePerDay", label: "Free consultations / device / day", hint: "0 disables free doctors.", min: 0, max: 100 },
  { key: "premiumUnlocksPerDevicePerDay", label: "Paid unlocks / device / day", hint: "Limit on premium purchases per device.", min: 0, max: 50 },
  { key: "adUnlocksPerDevicePerDay", label: "Ad unlocks / device / day", hint: "Ads earn little, so keep this low.", min: 0, max: 50 },
  { key: "globalConsultsPerDay", label: "All consultations / day", hint: "Safety cap for your total AI spend.", min: 0, max: 100000 },
];

export default function SettingsTab({ settings, onSaved, notify }: Props) {
  const [form, setForm] = useState<AiSettings | null>(settings);
  const [saving, setSaving] = useState(false);

  useEffect(() => setForm(settings), [settings]);

  if (!form) return <p className="text-xs text-gray-500">Loading settings…</p>;

  const save = async () => {
    setSaving(true);
    try {
      const saved = await aiDoctorService.updateSettings(form);
      onSaved(saved);
      notify("Settings saved. The app picks them up within a minute.");
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {NUMBER_FIELDS.map((f) => (
          <Field key={f.key} label={f.label} hint={f.hint}>
            <input
              type="number"
              min={f.min}
              max={f.max}
              className={inputClass}
              value={form[f.key] as number}
              onChange={(e) => setForm({ ...form, [f.key]: Number(e.target.value) })}
            />
          </Field>
        ))}
        <Field label="Payments" hint="Test mode unlocks premium without real money (Razorpay / Play Billing not connected yet).">
          <select className={inputClass} value={form.paymentMode} onChange={(e) => setForm({ ...form, paymentMode: e.target.value as AiSettings["paymentMode"] })}>
            <option value="test">Test mode</option>
            <option value="disabled">Disabled</option>
          </select>
        </Field>
        <Field label="Ads" hint="Test mode simulates ads (AdMob not connected yet).">
          <select className={inputClass} value={form.adsMode} onChange={(e) => setForm({ ...form, adsMode: e.target.value as AiSettings["adsMode"] })}>
            <option value="test">Test mode</option>
            <option value="disabled">Disabled</option>
          </select>
        </Field>
      </div>
      <button type="button" className={primaryBtn} onClick={save} disabled={saving}>
        {saving && <Spinner />} Save settings
      </button>
    </div>
  );
}
