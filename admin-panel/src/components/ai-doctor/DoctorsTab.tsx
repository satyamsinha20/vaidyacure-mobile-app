"use client";

import React, { useState } from "react";
import { Plus, Pencil, Trash2, PlugZap, RefreshCw } from "lucide-react";
import { aiDoctorService, AiDoctor, AiDoctorInput, AiProvider } from "@/services/aiDoctor.service";
import { Field, Modal, Spinner, TierBadge, Toggle, dangerBtn, errorMessage, ghostBtn, inputClass, primaryBtn } from "./ui";

interface Props {
  doctors: AiDoctor[];
  providers: AiProvider[];
  onChanged: () => Promise<void>;
  notify: (message: string, kind?: "success" | "error") => void;
}

const emptyForm = (providers: AiProvider[]): AiDoctorInput => ({
  name: "",
  designation: "",
  about: "",
  tier: "free",
  providerId: providers[0]?.id ?? "",
  model: "",
  fallbackProviderId: null,
  fallbackModel: "",
  avatarColor: "#157347",
  isActive: true,
  sortOrder: 0,
  estimatedCostInr: 0,
});

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

export default function DoctorsTab({ doctors, providers, onChanged, notify }: Props) {
  const [editing, setEditing] = useState<AiDoctor | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState<AiDoctorInput>(emptyForm(providers));
  const [saving, setSaving] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  const set = <K extends keyof AiDoctorInput>(key: K, value: AiDoctorInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm(providers), sortOrder: doctors.length + 1 });
    setModels([]);
    setIsOpen(true);
  };

  const openEdit = (d: AiDoctor) => {
    setEditing(d);
    setForm({
      name: d.name,
      designation: d.designation,
      about: d.about,
      tier: d.tier,
      providerId: d.providerId ?? providers[0]?.id ?? "",
      model: d.model,
      fallbackProviderId: d.fallbackProviderId,
      fallbackModel: d.fallbackModel,
      avatarColor: d.avatarColor,
      isActive: d.isActive,
      sortOrder: d.sortOrder,
      estimatedCostInr: d.estimatedCostInr,
    });
    setModels([]);
    setIsOpen(true);
  };

  const loadModels = async () => {
    if (!form.providerId) return;
    setLoadingModels(true);
    try {
      setModels(await aiDoctorService.providerModels(form.providerId));
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setLoadingModels(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        ...form,
        fallbackProviderId: form.fallbackProviderId || null,
        fallbackModel: form.fallbackProviderId ? form.fallbackModel : "",
      };
      if (editing) await aiDoctorService.updateDoctor(editing.id, payload);
      else await aiDoctorService.createDoctor(payload);
      setIsOpen(false);
      await onChanged();
      notify(editing ? "Doctor updated." : "Doctor added.");
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (d: AiDoctor) => {
    try {
      await aiDoctorService.updateDoctor(d.id, {
        name: d.name,
        designation: d.designation,
        about: d.about,
        tier: d.tier,
        providerId: d.providerId ?? "",
        model: d.model,
        fallbackProviderId: d.fallbackProviderId,
        fallbackModel: d.fallbackModel,
        avatarColor: d.avatarColor,
        isActive: !d.isActive,
        sortOrder: d.sortOrder,
        estimatedCostInr: d.estimatedCostInr,
      });
      await onChanged();
    } catch (error) {
      notify(errorMessage(error), "error");
    }
  };

  const remove = async (d: AiDoctor) => {
    if (!window.confirm(`Delete ${d.name}? The app will stop showing this doctor.`)) return;
    try {
      await aiDoctorService.deleteDoctor(d.id);
      await onChanged();
      notify("Doctor deleted.");
    } catch (error) {
      notify(errorMessage(error), "error");
    }
  };

  const test = async (d: AiDoctor) => {
    setTestingId(d.id);
    try {
      const result = await aiDoctorService.testDoctor(d.id);
      notify(
        result.ok ? `${d.name}: working (${result.latencyMs} ms).` : `${d.name}: ${result.message ?? "not working"}`,
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
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-gray-500">
          The app shows only the name and designation. Provider and model stay private on the server.
        </p>
        <button type="button" onClick={openCreate} className={primaryBtn} disabled={providers.length === 0}>
          <Plus className="w-3.5 h-3.5" /> Add Doctor
        </button>
      </div>

      {providers.length === 0 && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
          Add a provider first (Providers tab), then create doctors on it.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {doctors.map((d) => (
          <div key={d.id} className={`p-3 rounded-2xl bg-white border ${d.isActive ? "border-gray-200" : "border-dashed border-gray-300 opacity-70"} shadow-2xs`}>
            <div className="flex items-start gap-3">
              <div
                className="w-11 h-11 rounded-full flex items-center justify-center text-white text-sm font-black shrink-0"
                style={{ backgroundColor: d.avatarColor }}
              >
                {initials(d.name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-gray-900">{d.name}</span>
                  <TierBadge tier={d.tier} />
                </div>
                <p className="text-xs text-gray-600">{d.designation}</p>
                <p className="text-[10.5px] text-gray-500 mt-1 font-mono truncate" title={`${d.providerName} · ${d.model}`}>
                  {d.providerName ?? "—"} · {d.model}
                </p>
                <p className="text-[10.5px] text-gray-500">
                  ~₹{d.estimatedCostInr} per consultation · order {d.sortOrder}
                  {d.fallbackModel ? ` · backup: ${d.fallbackModel}` : ""}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-gray-100">
              <Toggle checked={d.isActive} onChange={() => toggleActive(d)} label={d.isActive ? "Shown in app" : "Hidden"} />
              <div className="flex items-center gap-1.5">
                <button type="button" className={ghostBtn} onClick={() => test(d)} disabled={testingId === d.id}>
                  {testingId === d.id ? <Spinner /> : <PlugZap className="w-3.5 h-3.5" />} Test
                </button>
                <button type="button" className={ghostBtn} onClick={() => openEdit(d)}>
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button type="button" className={dangerBtn} onClick={() => remove(d)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {isOpen && (
        <Modal
          title={editing ? `Edit ${editing.name}` : "Add Doctor"}
          subtitle="Free doctors should use models costing about ₹1–2 per consultation; premium up to ₹8."
          onClose={() => setIsOpen(false)}
          footer={
            <>
              <button type="button" className={ghostBtn} onClick={() => setIsOpen(false)}>
                Cancel
              </button>
              <button type="button" className={primaryBtn} onClick={save} disabled={saving}>
                {saving && <Spinner />} Save
              </button>
            </>
          }
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name">
              <input className={inputClass} value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={60} />
            </Field>
            <Field label="Designation">
              <input className={inputClass} value={form.designation} onChange={(e) => set("designation", e.target.value)} maxLength={60} placeholder="General Physician" />
            </Field>
          </div>
          <Field label="About (shown in the app)">
            <textarea className={`${inputClass} h-16 py-2`} value={form.about} onChange={(e) => set("about", e.target.value)} maxLength={200} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Plan">
              <select className={inputClass} value={form.tier} onChange={(e) => set("tier", e.target.value as "free" | "premium")}>
                <option value="free">Free</option>
                <option value="premium">Premium</option>
              </select>
            </Field>
            <Field label="Approx. cost per consultation (₹)">
              <input type="number" min={0} step={0.1} className={inputClass} value={form.estimatedCostInr} onChange={(e) => set("estimatedCostInr", Number(e.target.value))} />
            </Field>
          </div>
          <Field label="Provider">
            <select className={inputClass} value={form.providerId} onChange={(e) => { set("providerId", e.target.value); setModels([]); }}>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Model id" hint="Exact id from the provider, e.g. deepseek/deepseek-v4-flash">
            <div className="flex gap-2">
              <input className={`${inputClass} font-mono`} list="ai-model-list" value={form.model} onChange={(e) => set("model", e.target.value.trim())} />
              <button type="button" className={ghostBtn} onClick={loadModels} disabled={loadingModels}>
                {loadingModels ? <Spinner /> : <RefreshCw className="w-3.5 h-3.5" />} Models
              </button>
            </div>
            <datalist id="ai-model-list">
              {models.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Backup provider (optional)">
              <select className={inputClass} value={form.fallbackProviderId ?? ""} onChange={(e) => set("fallbackProviderId", e.target.value || null)}>
                <option value="">None</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Backup model">
              <input className={`${inputClass} font-mono`} value={form.fallbackModel} onChange={(e) => set("fallbackModel", e.target.value.trim())} disabled={!form.fallbackProviderId} />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3 items-end">
            <Field label="Avatar colour">
              <input type="color" className="w-full h-9 rounded-xl border border-gray-200 cursor-pointer" value={form.avatarColor} onChange={(e) => set("avatarColor", e.target.value)} />
            </Field>
            <Field label="Order in app">
              <input type="number" min={0} className={inputClass} value={form.sortOrder} onChange={(e) => set("sortOrder", Number(e.target.value))} />
            </Field>
            <div className="pb-1.5">
              <Toggle checked={form.isActive} onChange={(v) => set("isActive", v)} label="Show in app" />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
