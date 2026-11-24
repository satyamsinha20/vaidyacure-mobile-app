"use client";

import React, { useEffect, useState } from "react";
import { Globe, KeyRound, PlugZap, Save, Trash2 } from "lucide-react";
import { aiDoctorService, WebSearchSettings, WebSearchTestResult } from "@/services/aiDoctor.service";
import { Field, Spinner, Toggle, dangerBtn, errorMessage, ghostBtn, inputClass, primaryBtn } from "./ui";

interface Props {
  notify: (message: string, kind?: "success" | "error") => void;
}

/** Internet results in the app's Search tab: Google results through Serper.dev */
export default function WebSearchCard({ notify }: Props) {
  const [settings, setSettings] = useState<WebSearchSettings | null>(null);
  const [form, setForm] = useState({ enabled: true, perDevicePerDay: 60, globalPerDay: 500 });
  const [newKey, setNewKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<WebSearchTestResult | null>(null);

  const apply = (s: WebSearchSettings) => {
    setSettings(s);
    setForm({ enabled: s.enabled, perDevicePerDay: s.perDevicePerDay, globalPerDay: s.globalPerDay });
  };

  useEffect(() => {
    aiDoctorService
      .getWebSearch()
      .then(apply)
      .catch((error) => notify(errorMessage(error), "error"));
    // Loaded once when the settings tab opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (removeKey = false) => {
    setSaving(true);
    setTest(null);
    try {
      const key = newKey.trim();
      apply(await aiDoctorService.updateWebSearch({ ...form, ...(key ? { apiKey: key } : {}), ...(removeKey ? { removeKey: true } : {}) }));
      setNewKey("");
      notify(key ? "Serper key saved. Press Test to check it." : removeKey ? "Serper key removed." : "Internet search settings saved.");
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    setTesting(true);
    setTest(null);
    try {
      setTest(await aiDoctorService.testWebSearch());
      apply(await aiDoctorService.getWebSearch());
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setTesting(false);
    }
  };

  if (!settings) return <p className="text-xs text-gray-500">Loading internet search settings…</p>;

  return (
    <section className="p-4 rounded-2xl bg-white border border-gray-200 shadow-2xs space-y-3 max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <div className="p-2 rounded-xl bg-sky-50 text-sky-700">
            <Globe className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-black text-gray-900">Internet search (Google via Serper)</h3>
            <p className="text-[11px] text-gray-500">
              Shows Google results in the app&apos;s Search tab, health and pharmacy websites only. Each new search uses one
              Serper credit; the same search again within 7 days is free.
            </p>
          </div>
        </div>
        <span
          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
            settings.hasKey ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"
          }`}
        >
          {settings.hasKey ? `Key saved ${settings.keyHint}` : "No key yet"}
        </span>
      </div>

      <Field label="Serper API key" hint="From serper.dev → API Key. Stored encrypted; it is never shown again or sent to the app.">
        <div className="flex gap-2">
          <input
            type="password"
            autoComplete="off"
            className={inputClass}
            placeholder={settings.hasKey ? "Paste a new key to replace the saved one" : "Paste your Serper API key"}
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
          />
          <button type="button" className={primaryBtn} onClick={() => save()} disabled={saving}>
            {saving ? <Spinner /> : <Save className="w-3.5 h-3.5" />} Save
          </button>
        </div>
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <div className="pb-1.5">
          <Toggle checked={form.enabled} onChange={(v) => setForm({ ...form, enabled: v })} label={form.enabled ? "Internet search on" : "Off"} />
        </div>
        <Field label="Searches / device / day" hint="Saved results don't count.">
          <input
            type="number"
            min={0}
            max={1000}
            className={inputClass}
            value={form.perDevicePerDay}
            onChange={(e) => setForm({ ...form, perDevicePerDay: Number(e.target.value) })}
          />
        </Field>
        <Field label="Searches / day (all users)" hint={`Used today: ${settings.usedToday}`}>
          <input
            type="number"
            min={0}
            max={100000}
            className={inputClass}
            value={form.globalPerDay}
            onChange={(e) => setForm({ ...form, globalPerDay: Number(e.target.value) })}
          />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={ghostBtn} onClick={() => save()} disabled={saving}>
          {saving ? <Spinner /> : <Save className="w-3.5 h-3.5" />} Save settings
        </button>
        <button type="button" className={ghostBtn} onClick={runTest} disabled={testing || !settings.hasKey}>
          {testing ? <Spinner /> : <PlugZap className="w-3.5 h-3.5" />} Test (uses 1 credit)
        </button>
        {settings.hasKey && (
          <button
            type="button"
            className={dangerBtn}
            onClick={() => window.confirm("Remove the saved Serper key? Internet results will stop.") && save(true)}
            disabled={saving}
          >
            <Trash2 className="w-3.5 h-3.5" /> Remove key
          </button>
        )}
      </div>

      {test && (
        <p
          className={`text-[11px] rounded-xl p-2 border ${
            test.ok ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          <KeyRound className="w-3 h-3 inline mr-1" />
          {test.ok ? `${test.message} ${test.count ?? 0} health results in ${test.ms} ms. First: "${test.firstTitle}"` : test.message}
        </p>
      )}
    </section>
  );
}
