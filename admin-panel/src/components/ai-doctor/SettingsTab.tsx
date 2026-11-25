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
  { key: "premiumPriceInr", label: "Premium chat price (₹, from wallet)", hint: "Taken from the patient's wallet for one premium AI consultation.", min: 1, max: 5000 },
  { key: "adsRequired", label: "Ads to unlock a free AI doctor", hint: "The Library Doctor needs no ads.", min: 1, max: 10 },
  { key: "consultationSeconds", label: "Default chat length (seconds)", hint: "180 = 3 minutes. Each doctor can have its own length.", min: 60, max: 900 },
  { key: "maxUserMessages", label: "Max patient messages", hint: "Per consultation; the report is generated after.", min: 2, max: 20 },
  { key: "freeConsultsPerDevicePerDay", label: "Library Doctor chats / device / day", hint: "The Library Doctor needs no ads, so it has a daily limit. Ad-unlocked chats have no limit.", min: 0, max: 100 },
  { key: "premiumUnlocksPerDevicePerDay", label: "Premium chats / patient / day", hint: "Safety limit on wallet chats per account.", min: 0, max: 50 },
  { key: "globalConsultsPerDay", label: "All AI consultations / day (all users)", hint: "Safety cap for your total AI spend (ad-unlocked chats count too).", min: 0, max: 100000 },
];

export default function SettingsTab({ settings, onSaved, notify }: Props) {
  const [form, setForm] = useState<AiSettings | null>(settings);
  const [saving, setSaving] = useState(false);

  useEffect(() => setForm(settings), [settings]);

  if (!form) return <p className="text-xs text-gray-500">Loading settings…</p>;

  const save = async () => {
    setSaving(true);
    try {
      // Only the chat rules: search settings are saved from Settings > Search
      const saved = await aiDoctorService.updateSettings({
        premiumPriceInr: form.premiumPriceInr,
        adsRequired: form.adsRequired,
        consultationSeconds: form.consultationSeconds,
        maxUserMessages: form.maxUserMessages,
        freeConsultsPerDevicePerDay: form.freeConsultsPerDevicePerDay,
        premiumUnlocksPerDevicePerDay: form.premiumUnlocksPerDevicePerDay,
        globalConsultsPerDay: form.globalConsultsPerDay,
        walletEnabled: form.walletEnabled,
        adsMode: form.adsMode,
      });
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
        <Field label="Premium via wallet" hint="Patients add money by UPI (verified in Payments) and pay premium chats from the wallet.">
          <select className={inputClass} value={form.walletEnabled ? "on" : "off"} onChange={(e) => setForm({ ...form, walletEnabled: e.target.value === "on" })}>
            <option value="on">On</option>
            <option value="off">Off</option>
          </select>
        </Field>
        <Field label="Ads for free AI doctors" hint="Test mode simulates ads (AdMob needs a store build).">
          <select className={inputClass} value={form.adsMode} onChange={(e) => setForm({ ...form, adsMode: e.target.value as AiSettings["adsMode"] })}>
            <option value="test">Test mode</option>
            <option value="disabled">Disabled</option>
          </select>
        </Field>
      </div>

      <p className="text-[11px] text-gray-500">Search, photo and mic settings are in Settings &gt; Search (top bar).</p>
      <button type="button" className={primaryBtn} onClick={save} disabled={saving}>
        {saving && <Spinner />} Save settings
      </button>
    </div>
  );
}
