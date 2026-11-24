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

      <div className="pt-3 border-t border-gray-100">
        <h3 className="text-xs font-black text-gray-800 uppercase tracking-wide">Search AI</h3>
        <p className="text-[11px] text-gray-500 mt-0.5">
          A short AI answer above the app&apos;s search results, written only from the trusted sources the search found. Each
          answer is saved for 3 days, so the same search again costs nothing.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="AI answer in search" hint="Turn it off to show only the normal results.">
          <select
            className={inputClass}
            value={form.searchAiEnabled ? "on" : "off"}
            onChange={(e) => setForm({ ...form, searchAiEnabled: e.target.value === "on" })}
          >
            <option value="on">On</option>
            <option value="off">Off</option>
          </select>
        </Field>
        <Field label="Model" hint="Cheapest: mistralai/mistral-nemo (about ₹0.004 per answer).">
          <input className={inputClass} value={form.searchAiModel} onChange={(e) => setForm({ ...form, searchAiModel: e.target.value.trim() })} />
        </Field>
        <Field label="Backup model" hint="Used only if the main model fails: qwen/qwen3.7-flash (about ₹0.011 per answer).">
          <input
            className={inputClass}
            value={form.searchAiFallbackModel}
            onChange={(e) => setForm({ ...form, searchAiFallbackModel: e.target.value.trim() })}
          />
        </Field>
        <Field
          label="Brand → salt model"
          hint="Finds the salt behind a brand name (Pyregem → Paracetamol): qwen/qwen3.7-flash, about ₹0.003 per brand, saved for 30 days."
        >
          <input className={inputClass} value={form.medicineAiModel} onChange={(e) => setForm({ ...form, medicineAiModel: e.target.value.trim() })} />
        </Field>
        <Field label="New AI answers / device / day" hint="Saved answers don't count.">
          <input
            type="number"
            min={0}
            max={1000}
            className={inputClass}
            value={form.searchAiPerDevicePerDay}
            onChange={(e) => setForm({ ...form, searchAiPerDevicePerDay: Number(e.target.value) })}
          />
        </Field>
        <Field label="New AI answers / day (all users)" hint="Safety cap for search AI spend. 3000 ≈ ₹13 a day at most.">
          <input
            type="number"
            min={0}
            max={100000}
            className={inputClass}
            value={form.searchAiGlobalPerDay}
            onChange={(e) => setForm({ ...form, searchAiGlobalPerDay: Number(e.target.value) })}
          />
        </Field>
      </div>

      <div className="pt-3 border-t border-gray-100">
        <h3 className="text-xs font-black text-gray-800 uppercase tracking-wide">Photo search (camera)</h3>
        <p className="text-[11px] text-gray-500 mt-0.5">
          An AI model reads the medicine name printed on the photo. Only printed text is used, and the same photo again costs
          nothing.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Photo search" hint="Turn it off to hide results from photos.">
          <select
            className={inputClass}
            value={form.photoAiEnabled ? "on" : "off"}
            onChange={(e) => setForm({ ...form, photoAiEnabled: e.target.value === "on" })}
          >
            <option value="on">On</option>
            <option value="off">Off</option>
          </select>
        </Field>
        <Field label="Model (must read images)" hint="Cheapest: google/gemma-3-4b-it (about ₹0.002 per photo).">
          <input className={inputClass} value={form.photoAiModel} onChange={(e) => setForm({ ...form, photoAiModel: e.target.value.trim() })} />
        </Field>
        <Field label="Backup model" hint="Used if the main model can't read the name: qwen/qwen3.7-flash (about ₹0.008 per photo).">
          <input
            className={inputClass}
            value={form.photoAiFallbackModel}
            onChange={(e) => setForm({ ...form, photoAiFallbackModel: e.target.value.trim() })}
          />
        </Field>
        <Field label="Photos / device / day" hint="Saved results don't count.">
          <input
            type="number"
            min={0}
            max={500}
            className={inputClass}
            value={form.photoAiPerDevicePerDay}
            onChange={(e) => setForm({ ...form, photoAiPerDevicePerDay: Number(e.target.value) })}
          />
        </Field>
        <Field label="Photos / day (all users)" hint="Safety cap for photo search spend. 1000 ≈ ₹10 a day at most.">
          <input
            type="number"
            min={0}
            max={100000}
            className={inputClass}
            value={form.photoAiGlobalPerDay}
            onChange={(e) => setForm({ ...form, photoAiGlobalPerDay: Number(e.target.value) })}
          />
        </Field>
      </div>
      <button type="button" className={primaryBtn} onClick={save} disabled={saving}>
        {saving && <Spinner />} Save settings
      </button>
    </div>
  );
}
