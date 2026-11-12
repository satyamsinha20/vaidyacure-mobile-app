"use client";

import React, { useState } from "react";
import { Plus, Pencil, Trash2, PlugZap, Eye, EyeOff, KeyRound } from "lucide-react";
import { aiDoctorService, AiProvider, AiProviderInput } from "@/services/aiDoctor.service";
import { Field, Modal, Spinner, Toggle, dangerBtn, errorMessage, ghostBtn, inputClass, primaryBtn } from "./ui";

interface Props {
  providers: AiProvider[];
  onChanged: () => Promise<void>;
  notify: (message: string, kind?: "success" | "error") => void;
}

interface FormState {
  name: string;
  baseUrl: string;
  apiKey: string;
  isActive: boolean;
  expiresAt: string;
  notes: string;
}

const emptyForm: FormState = { name: "", baseUrl: "https://", apiKey: "", isActive: true, expiresAt: "", notes: "" };

const statusOf = (p: AiProvider) => {
  if (!p.isActive) return { label: "Disabled", cls: "bg-gray-100 text-gray-600 border-gray-200" };
  if (p.expiresAt && new Date(p.expiresAt).getTime() <= Date.now()) return { label: "Expired", cls: "bg-rose-50 text-rose-700 border-rose-200" };
  return { label: "Active", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
};

export default function ProvidersTab({ providers, onChanged, notify }: Props) {
  const [editing, setEditing] = useState<AiProvider | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowKey(false);
    setIsOpen(true);
  };

  const openEdit = (p: AiProvider) => {
    setEditing(p);
    setForm({
      name: p.name,
      baseUrl: p.baseUrl,
      apiKey: "",
      isActive: p.isActive,
      expiresAt: p.expiresAt ? p.expiresAt.slice(0, 10) : "",
      notes: p.notes,
    });
    setShowKey(false);
    setIsOpen(true);
  };

  const close = () => {
    setIsOpen(false);
    // Never keep a typed key in memory longer than needed
    setForm(emptyForm);
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload: AiProviderInput = {
        name: form.name.trim(),
        baseUrl: form.baseUrl.trim(),
        isActive: form.isActive,
        expiresAt: form.expiresAt ? new Date(`${form.expiresAt}T23:59:59`).toISOString() : null,
        notes: form.notes.trim(),
        ...(form.apiKey.trim() ? { apiKey: form.apiKey.trim() } : {}),
      };
      if (editing) await aiDoctorService.updateProvider(editing.id, payload);
      else await aiDoctorService.createProvider(payload);
      close();
      await onChanged();
      notify(editing ? "Provider updated." : "Provider added. Use Test to check the connection.");
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (p: AiProvider) => {
    if (!window.confirm(`Delete provider "${p.name}"? Its encrypted API key will be removed.`)) return;
    try {
      await aiDoctorService.deleteProvider(p.id);
      await onChanged();
      notify("Provider deleted.");
    } catch (error) {
      notify(errorMessage(error), "error");
    }
  };

  const test = async (p: AiProvider) => {
    setTestingId(p.id);
    try {
      const result = await aiDoctorService.testProvider(p.id);
      notify(
        result.ok
          ? `${p.name}: connected in ${result.latencyMs} ms, ${result.modelsCount} models available.`
          : `${p.name}: ${result.message ?? "connection failed"}`,
        result.ok ? "success" : "error"
      );
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-gray-500">
          Any OpenAI-compatible API. Keys are encrypted on the server and can never be viewed again, only replaced.
        </p>
        <button type="button" onClick={openCreate} className={primaryBtn}>
          <Plus className="w-3.5 h-3.5" /> Add Provider
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left font-bold px-3 py-2">Name</th>
              <th className="text-left font-bold px-3 py-2">Base URL</th>
              <th className="text-left font-bold px-3 py-2">API key</th>
              <th className="text-left font-bold px-3 py-2">Status</th>
              <th className="text-left font-bold px-3 py-2">Expires</th>
              <th className="text-left font-bold px-3 py-2">Doctors</th>
              <th className="text-right font-bold px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {providers.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-gray-500">
                  No providers yet.
                </td>
              </tr>
            )}
            {providers.map((p) => {
              const status = statusOf(p);
              return (
                <tr key={p.id} className="border-t border-gray-100">
                  <td className="px-3 py-2 font-semibold text-gray-900">{p.name}</td>
                  <td className="px-3 py-2 font-mono text-gray-600 max-w-[220px] truncate" title={p.baseUrl}>
                    {p.baseUrl}
                  </td>
                  <td className="px-3 py-2 font-mono text-gray-600">
                    <span className="inline-flex items-center gap-1">
                      <KeyRound className="w-3 h-3" />
                      {p.keyHint}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${status.cls}`}>{status.label}</span>
                  </td>
                  <td className="px-3 py-2 text-gray-600">{p.expiresAt ? new Date(p.expiresAt).toLocaleDateString() : "Never"}</td>
                  <td className="px-3 py-2 text-gray-600">{p.doctorsCount}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1.5">
                      <button type="button" className={ghostBtn} onClick={() => test(p)} disabled={testingId === p.id}>
                        {testingId === p.id ? <Spinner /> : <PlugZap className="w-3.5 h-3.5" />} Test
                      </button>
                      <button type="button" className={ghostBtn} onClick={() => openEdit(p)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" className={dangerBtn} onClick={() => remove(p)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {isOpen && (
        <Modal
          title={editing ? `Edit ${editing.name}` : "Add Provider"}
          subtitle="Changing the base URL requires entering the API key again."
          onClose={close}
          footer={
            <>
              <button type="button" className={ghostBtn} onClick={close}>
                Cancel
              </button>
              <button type="button" className={primaryBtn} onClick={save} disabled={saving}>
                {saving && <Spinner />} Save
              </button>
            </>
          }
        >
          <Field label="Name">
            <input className={inputClass} value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={60} placeholder="e.g. aicredits" />
          </Field>
          <Field label="Base URL" hint="Must start with https:// — e.g. https://aicredits.in/v1">
            <input className={`${inputClass} font-mono`} value={form.baseUrl} onChange={(e) => set("baseUrl", e.target.value)} maxLength={300} />
          </Field>
          <Field
            label={editing ? "New API key (optional)" : "API key"}
            hint={editing ? `Leave empty to keep the current key (${editing.keyHint}).` : "Stored encrypted. It will never be shown again."}
          >
            <div className="relative">
              <input
                className={`${inputClass} font-mono pr-9`}
                type={showKey ? "text" : "password"}
                value={form.apiKey}
                onChange={(e) => set("apiKey", e.target.value)}
                autoComplete="off"
                spellCheck={false}
                maxLength={500}
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 cursor-pointer"
                onClick={() => setShowKey((s) => !s)}
                aria-label={showKey ? "Hide key" : "Show key"}
              >
                {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3 items-end">
            <Field label="Expires on (optional)" hint="Useful for free trials: doctors on this provider stop automatically.">
              <input type="date" className={inputClass} value={form.expiresAt} onChange={(e) => set("expiresAt", e.target.value)} />
            </Field>
            <div className="pb-6">
              <Toggle checked={form.isActive} onChange={(v) => set("isActive", v)} label="Active" />
            </div>
          </div>
          <Field label="Notes (optional)">
            <input className={inputClass} value={form.notes} onChange={(e) => set("notes", e.target.value)} maxLength={300} />
          </Field>
        </Modal>
      )}
    </div>
  );
}
