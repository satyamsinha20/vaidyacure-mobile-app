"use client";

import React, { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { Field, Spinner, Toggle, errorMessage, inputClass, primaryBtn } from "@/components/ai-doctor/ui";
import { Card } from "@/components/market/ui";
import { aiDoctorService, AiSettings, WebSearchSettings } from "@/services/aiDoctor.service";

type Notify = (message: string, kind?: "success" | "error") => void;

/** Only these fields are saved from this tab (the AI Doctor page saves the chat rules) */
const SEARCH_KEYS = [
  "searchAiEnabled",
  "searchAiModel",
  "searchAiFallbackModel",
  "searchAiPerDevicePerDay",
  "searchAiGlobalPerDay",
  "medicineAiModel",
  "photoAiEnabled",
  "photoAiModel",
  "photoAiFallbackModel",
  "photoAiPerDevicePerDay",
  "photoAiGlobalPerDay",
  "voiceSearchEnabled",
  "voiceSearchLanguage",
] as const;

type SearchSettings = Pick<AiSettings, (typeof SEARCH_KEYS)[number]>;

const pick = (s: AiSettings): SearchSettings => Object.fromEntries(SEARCH_KEYS.map((k) => [k, s[k]])) as SearchSettings;

/** Settings > Search: what the app's Search screen offers (text, internet, photo, mic) */
export default function SearchTab({ notify }: { notify: Notify }) {
  const [form, setForm] = useState<SearchSettings | null>(null);
  const [web, setWeb] = useState<WebSearchSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([aiDoctorService.getSettings(), aiDoctorService.getWebSearch()])
      .then(([s, w]) => {
        setForm(pick(s));
        setWeb(w);
      })
      .catch((e) => notify(errorMessage(e), "error"));
  }, [notify]);

  if (!form || !web) return <Spinner />;

  const set = <K extends keyof SearchSettings>(key: K, value: SearchSettings[K]) => setForm({ ...form, [key]: value });
  const num = (key: keyof SearchSettings, min: number, max: number) => (
    <input type="number" min={min} max={max} className={inputClass} value={form[key] as number} onChange={(e) => set(key, Number(e.target.value) as never)} />
  );
  const model = (key: keyof SearchSettings) => (
    <input className={`${inputClass} font-mono`} value={form[key] as string} onChange={(e) => set(key, e.target.value.trim() as never)} />
  );

  const save = async () => {
    setSaving(true);
    try {
      const [saved, savedWeb] = await Promise.all([
        aiDoctorService.updateSettings(form),
        aiDoctorService.updateWebSearch({ enabled: web.enabled, perDevicePerDay: web.perDevicePerDay, globalPerDay: web.globalPerDay }),
      ]);
      setForm(pick(saved));
      setWeb(savedWeb);
      notify("Search settings saved. The app picks them up within a minute.");
    } catch (e) {
      notify(errorMessage(e), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 max-w-3xl">
      <Card title="Text search: AI answer" subtitle="A short AI answer above the search results, written only from trusted sources. The same search again costs nothing for 3 days.">
        <Toggle checked={form.searchAiEnabled} onChange={(v) => set("searchAiEnabled", v)} label={form.searchAiEnabled ? "AI answer on" : "AI answer off"} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Model" hint="Cheapest: mistralai/mistral-nemo (about ₹0.004 per answer).">
            {model("searchAiModel")}
          </Field>
          <Field label="Backup model" hint="Used only if the main model fails.">
            {model("searchAiFallbackModel")}
          </Field>
          <Field label="Brand → salt model" hint="Finds the salt behind a brand (Pyregem → Paracetamol), saved for 30 days.">
            {model("medicineAiModel")}
          </Field>
          <Field label="New AI answers / device / day" hint="Saved answers don't count.">
            {num("searchAiPerDevicePerDay", 0, 1000)}
          </Field>
          <Field label="New AI answers / day (all users)" hint="Safety cap for search AI spend.">
            {num("searchAiGlobalPerDay", 0, 100000)}
          </Field>
        </div>
      </Card>

      <Card title="Internet results" subtitle={`Google results (health and pharmacy sites only). The key is in Settings > API Keys. Used today: ${web.usedToday}`}>
        {!web.hasKey && <p className="text-[11px] text-amber-700">No Serper key saved yet, so internet results are not shown.</p>}
        <Toggle checked={web.enabled} onChange={(v) => setWeb({ ...web, enabled: v })} label={web.enabled ? "Internet results on" : "Internet results off"} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Searches / device / day" hint="Saved results don't count.">
            <input type="number" min={0} max={1000} className={inputClass} value={web.perDevicePerDay} onChange={(e) => setWeb({ ...web, perDevicePerDay: Number(e.target.value) })} />
          </Field>
          <Field label="Searches / day (all users)" hint="Each new search uses one Serper credit.">
            <input type="number" min={0} max={100000} className={inputClass} value={web.globalPerDay} onChange={(e) => setWeb({ ...web, globalPerDay: Number(e.target.value) })} />
          </Field>
        </div>
      </Card>

      <Card title="Photo search (camera)" subtitle="An AI model reads the medicine name printed on the photo. The same photo again costs nothing.">
        <Toggle checked={form.photoAiEnabled} onChange={(v) => set("photoAiEnabled", v)} label={form.photoAiEnabled ? "Camera button shown" : "Camera button hidden"} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Model (must read images)" hint="Cheapest: google/gemma-3-4b-it (about ₹0.002 per photo).">
            {model("photoAiModel")}
          </Field>
          <Field label="Backup model" hint="Used if the main model can't read the name.">
            {model("photoAiFallbackModel")}
          </Field>
          <Field label="Photos / device / day" hint="Saved results don't count.">
            {num("photoAiPerDevicePerDay", 0, 500)}
          </Field>
          <Field label="Photos / day (all users)" hint="Safety cap for photo search spend.">
            {num("photoAiGlobalPerDay", 0, 100000)}
          </Field>
        </div>
      </Card>

      <Card title="Voice search (mic)" subtitle="Speech is turned into text on the phone itself, so it costs nothing.">
        <Toggle checked={form.voiceSearchEnabled} onChange={(v) => set("voiceSearchEnabled", v)} label={form.voiceSearchEnabled ? "Mic button shown" : "Mic button hidden"} />
        <Field label="Language the mic starts in" hint="Patients can still switch it in the app.">
          <select className={`${inputClass} max-w-xs`} value={form.voiceSearchLanguage} onChange={(e) => set("voiceSearchLanguage", e.target.value as SearchSettings["voiceSearchLanguage"])}>
            <option value="en-IN">English / Hinglish</option>
            <option value="hi-IN">हिंदी (Hindi)</option>
          </select>
        </Field>
      </Card>

      <button type="button" className={primaryBtn} onClick={save} disabled={saving}>
        {saving ? <Spinner /> : <Save className="w-3.5 h-3.5" />} Save search settings
      </button>
    </div>
  );
}
