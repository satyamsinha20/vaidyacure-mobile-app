"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Pencil, Trash2, ImagePlus, Eye, MousePointerClick, Megaphone } from "lucide-react";
import AdminPageShell, { Toast } from "@/components/admin/AdminPageShell";
import { Field, Modal, Spinner, Toggle, dangerBtn, errorMessage, ghostBtn, inputClass, primaryBtn } from "@/components/ai-doctor/ui";
import { contentService, uploadImage, AdActionType, AdInput, AdItem } from "@/services/content.service";

const emptyAd: AdInput = {
  clientName: "",
  title: "",
  subtitle: "",
  imageUrl: "",
  actionType: "none",
  actionValue: "",
  startAt: null,
  endAt: null,
  isActive: true,
  sortOrder: 0,
};

const ACTION_LABELS: Record<AdActionType, string> = {
  none: "No action",
  url: "Open website",
  phone: "Call phone",
  whatsapp: "Open WhatsApp",
};

const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
const fromDateInput = (value: string, endOfDay: boolean) =>
  value ? new Date(`${value}T${endOfDay ? "23:59:59" : "00:00:00"}+05:30`).toISOString() : null;

const statusOf = (ad: AdItem) => {
  const now = Date.now();
  if (!ad.isActive) return { label: "Paused", cls: "bg-gray-100 text-gray-600 border-gray-200" };
  if (ad.startAt && new Date(ad.startAt).getTime() > now) return { label: "Scheduled", cls: "bg-sky-50 text-sky-700 border-sky-200" };
  if (ad.endAt && new Date(ad.endAt).getTime() < now) return { label: "Ended", cls: "bg-rose-50 text-rose-700 border-rose-200" };
  return { label: "Live in app", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
};

export default function MarketingPage() {
  const [ads, setAds] = useState<AdItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast | null>(null);
  const [editing, setEditing] = useState<AdItem | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState<AdInput>(emptyAd);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const notify = (message: string, kind: Toast["kind"] = "success") => setToast({ message, kind });
  const set = <K extends keyof AdInput>(key: K, value: AdInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  const load = useCallback(async () => {
    try {
      setAds(await contentService.listAds());
    } catch (error) {
      setToast({ message: errorMessage(error), kind: "error" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyAd, sortOrder: ads.length + 1 });
    setIsOpen(true);
  };

  const openEdit = (ad: AdItem) => {
    setEditing(ad);
    setForm({
      clientName: ad.clientName,
      title: ad.title,
      subtitle: ad.subtitle,
      imageUrl: ad.imageUrl,
      actionType: ad.actionType,
      actionValue: ad.actionValue,
      startAt: ad.startAt,
      endAt: ad.endAt,
      isActive: ad.isActive,
      sortOrder: ad.sortOrder,
    });
    setIsOpen(true);
  };

  const onPickImage = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      set("imageUrl", await uploadImage(file));
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      if (editing) await contentService.updateAd(editing.id, form);
      else await contentService.createAd(form);
      setIsOpen(false);
      await load();
      notify(editing ? "Ad updated. The app shows changes within a minute." : "Ad added. It appears in the app within a minute.");
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (ad: AdItem) => {
    if (!window.confirm(`Delete the ad for ${ad.clientName}?`)) return;
    try {
      await contentService.deleteAd(ad.id);
      await load();
      notify("Ad deleted.");
    } catch (error) {
      notify(errorMessage(error), "error");
    }
  };

  return (
    <AdminPageShell
      title="Marketing"
      subtitle="Sponsored slides in the app's home carousel. Each ad is labelled 'Sponsored' in the app."
      toast={toast}
      onDismissToast={() => setToast(null)}
      actions={
        <button type="button" className={primaryBtn} onClick={openCreate}>
          <Plus className="w-3.5 h-3.5" /> Add Ad
        </button>
      }
    >
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-gray-500 p-4">
          <Spinner /> Loading…
        </div>
      ) : ads.length === 0 ? (
        <div className="p-8 rounded-2xl bg-white border border-gray-200 text-center">
          <Megaphone className="w-7 h-7 mx-auto text-gray-400" />
          <p className="text-sm font-bold text-gray-800 mt-2">No ads yet</p>
          <p className="text-xs text-gray-500 mt-1">Add a client&apos;s banner to show it in the app&apos;s home carousel.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {ads.map((ad) => {
            const st = statusOf(ad);
            const ctr = ad.impressions ? ((ad.clicks / ad.impressions) * 100).toFixed(1) : "0.0";
            return (
              <div key={ad.id} className="rounded-2xl bg-white border border-gray-200 shadow-2xs overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ad.imageUrl} alt={ad.title || ad.clientName} className="w-full h-36 object-cover bg-gray-100" />
                <div className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-gray-900">{ad.clientName}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${st.cls}`}>{st.label}</span>
                  </div>
                  {ad.title && <p className="text-xs font-semibold text-gray-700 mt-0.5">{ad.title}</p>}
                  {ad.subtitle && <p className="text-[11px] text-gray-500">{ad.subtitle}</p>}
                  <p className="text-[11px] text-gray-500 mt-1">
                    {ACTION_LABELS[ad.actionType]}
                    {ad.actionValue ? `: ${ad.actionValue}` : ""}
                  </p>
                  <p className="text-[11px] text-gray-500">
                    {ad.startAt ? new Date(ad.startAt).toLocaleDateString() : "Now"} →{" "}
                    {ad.endAt ? new Date(ad.endAt).toLocaleDateString() : "No end date"} · order {ad.sortOrder}
                  </p>
                  <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-700">
                    <span className="flex items-center gap-1">
                      <Eye className="w-3 h-3" /> {ad.impressions} views
                    </span>
                    <span className="flex items-center gap-1">
                      <MousePointerClick className="w-3 h-3" /> {ad.clicks} clicks
                    </span>
                    <span className="font-semibold">CTR {ctr}%</span>
                  </div>
                  <div className="flex items-center justify-end gap-1.5 mt-2.5 pt-2 border-t border-gray-100">
                    <button type="button" className={ghostBtn} onClick={() => openEdit(ad)}>
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button type="button" className={dangerBtn} onClick={() => remove(ad)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isOpen && (
        <Modal
          title={editing ? `Edit ad: ${editing.clientName}` : "Add Ad"}
          subtitle="Recommended banner size: 1200 × 600 px (2:1)."
          onClose={() => setIsOpen(false)}
          footer={
            <>
              <button type="button" className={ghostBtn} onClick={() => setIsOpen(false)}>
                Cancel
              </button>
              <button type="button" className={primaryBtn} onClick={save} disabled={saving || uploading || !form.imageUrl}>
                {saving && <Spinner />} Save
              </button>
            </>
          }
        >
          <Field label="Client / brand name">
            <input className={inputClass} value={form.clientName} onChange={(e) => set("clientName", e.target.value)} maxLength={80} />
          </Field>
          <Field label="Banner image">
            <div className="space-y-2">
              {form.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.imageUrl} alt="Banner preview" className="w-full h-32 object-cover rounded-xl border border-gray-200" />
              )}
              <div className="flex gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => onPickImage(e.target.files?.[0])}
                />
                <button type="button" className={ghostBtn} onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? <Spinner /> : <ImagePlus className="w-3.5 h-3.5" />} Upload image
                </button>
                <input
                  className={inputClass}
                  placeholder="or paste an https:// image URL"
                  value={form.imageUrl}
                  onChange={(e) => set("imageUrl", e.target.value.trim())}
                />
              </div>
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Title (optional)">
              <input className={inputClass} value={form.title} onChange={(e) => set("title", e.target.value)} maxLength={80} />
            </Field>
            <Field label="Subtitle (optional)">
              <input className={inputClass} value={form.subtitle} onChange={(e) => set("subtitle", e.target.value)} maxLength={140} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="When tapped">
              <select className={inputClass} value={form.actionType} onChange={(e) => set("actionType", e.target.value as AdActionType)}>
                {(Object.keys(ACTION_LABELS) as AdActionType[]).map((k) => (
                  <option key={k} value={k}>
                    {ACTION_LABELS[k]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={form.actionType === "url" ? "Website (https://…)" : form.actionType === "none" ? "—" : "Phone number"}>
              <input
                className={inputClass}
                value={form.actionValue}
                onChange={(e) => set("actionValue", e.target.value)}
                disabled={form.actionType === "none"}
                placeholder={form.actionType === "url" ? "https://example.com" : "+91 98765 43210"}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date (optional)">
              <input type="date" className={inputClass} value={toDateInput(form.startAt)} onChange={(e) => set("startAt", fromDateInput(e.target.value, false))} />
            </Field>
            <Field label="End date (optional)">
              <input type="date" className={inputClass} value={toDateInput(form.endAt)} onChange={(e) => set("endAt", fromDateInput(e.target.value, true))} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3 items-end">
            <Field label="Order in carousel">
              <input type="number" min={0} className={inputClass} value={form.sortOrder} onChange={(e) => set("sortOrder", Number(e.target.value))} />
            </Field>
            <div className="pb-1.5">
              <Toggle checked={form.isActive} onChange={(v) => set("isActive", v)} label={form.isActive ? "Active" : "Paused"} />
            </div>
          </div>
        </Modal>
      )}
    </AdminPageShell>
  );
}
