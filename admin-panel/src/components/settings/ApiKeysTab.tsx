"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, KeyRound, PlugZap, Save, ShieldCheck, Trash2 } from "lucide-react";
import ProvidersTab from "@/components/ai-doctor/ProvidersTab";
import { Field, Spinner, dangerBtn, errorMessage, ghostBtn, inputClass, primaryBtn } from "@/components/ai-doctor/ui";
import { Card } from "@/components/market/ui";
import { aiDoctorService, AiProvider, AiStatus, WebSearchSettings, WebSearchTestResult } from "@/services/aiDoctor.service";

type Notify = (message: string, kind?: "success" | "error") => void;

/** Settings > API Keys & Providers: every key that is saved from the admin panel (server env stays untouched) */
export default function ApiKeysTab({ notify }: { notify: Notify }) {
  const [providers, setProviders] = useState<AiProvider[] | null>(null);
  const [status, setStatus] = useState<AiStatus | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, s] = await Promise.all([aiDoctorService.listProviders(), aiDoctorService.status()]);
      setProviders(p);
      setStatus(s);
    } catch (e) {
      notify(errorMessage(e), "error");
    }
  }, [notify]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-3">
      {status && !status.encryptionConfigured && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>CONFIG_ENCRYPTION_KEY is not set on the server, so keys cannot be saved until it is added to the backend environment.</span>
        </div>
      )}
      <div className="p-2.5 rounded-xl bg-white border border-gray-200 text-[11px] text-gray-600 flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
        Keys are encrypted (AES-256) and never shown again after saving. Server settings in the Vercel environment are not changed here.
      </div>
      <Card title="AI providers" subtitle="The AI gateways used by AI doctors, search answers and photo search.">
        {providers ? <ProvidersTab providers={providers} onChanged={load} notify={notify} /> : <Spinner />}
      </Card>
      <SerperKeyCard notify={notify} />
    </div>
  );
}

/** Internet search key (Serper.dev). On/off and limits are in Settings > Search. */
function SerperKeyCard({ notify }: { notify: Notify }) {
  const [settings, setSettings] = useState<WebSearchSettings | null>(null);
  const [newKey, setNewKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState<WebSearchTestResult | null>(null);

  useEffect(() => {
    aiDoctorService
      .getWebSearch()
      .then(setSettings)
      .catch((e) => notify(errorMessage(e), "error"));
  }, [notify]);

  if (!settings) return <Spinner />;

  const save = async (removeKey = false) => {
    setBusy(true);
    setTest(null);
    try {
      const key = newKey.trim();
      setSettings(
        await aiDoctorService.updateWebSearch({
          enabled: settings.enabled,
          perDevicePerDay: settings.perDevicePerDay,
          globalPerDay: settings.globalPerDay,
          ...(key ? { apiKey: key } : {}),
          ...(removeKey ? { removeKey: true } : {}),
        })
      );
      setNewKey("");
      notify(key ? "Serper key saved. Press Test to check it." : "Serper key removed.");
    } catch (e) {
      notify(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title="Internet search key (Serper.dev)"
      subtitle="Google results in the app's Search tab. Turn it on/off and set limits in Settings > Search."
      actions={
        <span
          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
            settings.hasKey ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"
          }`}
        >
          {settings.hasKey ? `Key saved ${settings.keyHint}` : "No key yet"}
        </span>
      }
    >
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
          <button type="button" className={primaryBtn} onClick={() => save()} disabled={busy || !newKey.trim()}>
            {busy ? <Spinner /> : <Save className="w-3.5 h-3.5" />} Save
          </button>
        </div>
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={ghostBtn}
          disabled={busy || !settings.hasKey}
          onClick={async () => {
            setBusy(true);
            setTest(null);
            try {
              setTest(await aiDoctorService.testWebSearch());
            } catch (e) {
              notify(errorMessage(e), "error");
            } finally {
              setBusy(false);
            }
          }}
        >
          <PlugZap className="w-3.5 h-3.5" /> Test (uses 1 credit)
        </button>
        {settings.hasKey && (
          <button type="button" className={dangerBtn} disabled={busy} onClick={() => window.confirm("Remove the saved Serper key? Internet results will stop.") && save(true)}>
            <Trash2 className="w-3.5 h-3.5" /> Remove key
          </button>
        )}
      </div>
      {test && (
        <p className={`text-[11px] rounded-xl p-2 border ${test.ok ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-rose-50 border-rose-200 text-rose-800"}`}>
          <KeyRound className="w-3 h-3 inline mr-1" />
          {test.ok ? `${test.message} ${test.count ?? 0} health results in ${test.ms} ms. First: "${test.firstTitle}"` : test.message}
        </p>
      )}
    </Card>
  );
}
