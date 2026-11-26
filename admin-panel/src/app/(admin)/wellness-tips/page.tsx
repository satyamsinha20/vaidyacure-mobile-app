"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Lightbulb, CalendarDays, Repeat } from "lucide-react";
import AdminPageShell, { Toast } from "@/components/admin/AdminPageShell";
import { Field, Modal, Spinner, Toggle, dangerBtn, errorMessage, ghostBtn, inputClass, primaryBtn } from "@/components/ai-doctor/ui";
import { contentService, WellnessTipInput, WellnessTipItem } from "@/services/content.service";
import { cachedLoad } from "@/lib/cache";

const TEXT_MAX = 400;

const emptyTip: WellnessTipInput = {
  title: "Daily Wellness Tip",
  text: "",
  category: "",
  scheduledFor: null,
  isActive: true,
  sortOrder: 0,
};

const CATEGORY_SUGGESTIONS = ["Ayurveda", "Diet", "Hydration", "Sleep", "Exercise", "Yoga", "Mental health", "Seasonal", "Herbs"];

export default function WellnessTipsPage() {
  const [tips, setTips] = useState<WellnessTipItem[]>([]);
  const [today, setToday] = useState("");
  const [todayTipId, setTodayTipId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast | null>(null);
  const [editing, setEditing] = useState<WellnessTipItem | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState<WellnessTipInput>(emptyTip);
  const [saving, setSaving] = useState(false);

  const notify = (message: string, kind: Toast["kind"] = "success") => setToast({ message, kind });
  const set = <K extends keyof WellnessTipInput>(key: K, value: WellnessTipInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  const load = useCallback(async () => {
    try {
      await cachedLoad("content:tips", () => contentService.listTips(), (data) => {
        setTips(data.items);
        setToday(data.today);
        setTodayTipId(data.todayTipId);
        setLoading(false);
      });
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
    setForm({ ...emptyTip, sortOrder: tips.filter((t) => !t.scheduledFor).length + 1 });
    setIsOpen(true);
  };

  const openEdit = (tip: WellnessTipItem) => {
    setEditing(tip);
    setForm({
      title: tip.title,
      text: tip.text,
      category: tip.category,
      scheduledFor: tip.scheduledFor,
      isActive: tip.isActive,
      sortOrder: tip.sortOrder,
    });
    setIsOpen(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const input = { ...form, scheduledFor: form.scheduledFor || null };
      if (editing) await contentService.updateTip(editing.id, input);
      else await contentService.createTip(input);
      setIsOpen(false);
      await load();
      notify(editing ? "Tip updated. Open apps show it within a few seconds." : "Tip added. Open apps show it within a few seconds.");
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (tip: WellnessTipItem) => {
    if (!window.confirm("Delete this tip?")) return;
    try {
      await contentService.deleteTip(tip.id);
      await load();
      notify("Tip deleted.");
    } catch (error) {
      notify(errorMessage(error), "error");
    }
  };

  const scheduled = tips.filter((t) => t.scheduledFor);
  const rotation = tips.filter((t) => !t.scheduledFor);
  const todayTip = tips.find((t) => t.id === todayTipId);

  const renderTip = (tip: WellnessTipItem) => {
    const isToday = tip.id === todayTipId;
    const isPast = Boolean(tip.scheduledFor && today && tip.scheduledFor < today);
    return (
      <div
        key={tip.id}
        className={`p-3 rounded-2xl bg-white border shadow-2xs ${isToday ? "border-emerald-400" : "border-gray-200"} ${
          !tip.isActive || isPast ? "opacity-60" : ""
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold text-gray-900">{tip.title}</span>
            {tip.category && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                {tip.category}
              </span>
            )}
            {isToday && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600 text-white">Showing today</span>}
            {!tip.isActive && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-600 border border-gray-200">Paused</span>
            )}
            {isPast && <span className="text-[10px] text-gray-500">Date passed</span>}
          </div>
          <span className="text-[11px] text-gray-500">
            {tip.scheduledFor ? new Date(`${tip.scheduledFor}T00:00:00`).toDateString() : `Rotation order ${tip.sortOrder}`}
          </span>
        </div>
        <p className="text-xs text-gray-700 mt-1.5 whitespace-pre-wrap">{tip.text}</p>
        <div className="flex items-center justify-end gap-1.5 mt-2">
          <button type="button" className={ghostBtn} onClick={() => openEdit(tip)}>
            <Pencil className="w-3.5 h-3.5" /> Edit
          </button>
          <button type="button" className={dangerBtn} onClick={() => remove(tip)}>
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <AdminPageShell
      title="Wellness Tips"
      subtitle="The 'Daily Wellness Tip' card on the app's home screen."
      toast={toast}
      onDismissToast={() => setToast(null)}
      actions={
        <button type="button" className={primaryBtn} onClick={openCreate}>
          <Plus className="w-3.5 h-3.5" /> Add Tip
        </button>
      }
    >
      <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
        <p className="font-bold flex items-center gap-1.5">
          <Lightbulb className="w-3.5 h-3.5" /> How tips are chosen
        </p>
        <p className="mt-1">
          A tip with a date shows on that date. On other days, the app shows one tip from the rotation list, a new one each day.
          If there is no tip for today, the app shows &quot;Daily tip unavailable&quot;.
        </p>
        {!loading && (
          <p className="mt-1.5 font-semibold">
            Today ({today}): {todayTip ? `"${todayTip.text.slice(0, 90)}${todayTip.text.length > 90 ? "…" : ""}"` : "no tip (the app shows \"Daily tip unavailable\")"}
          </p>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-gray-500 p-4">
          <Spinner /> Loading…
        </div>
      ) : (
        <>
          <section className="space-y-2">
            <h2 className="text-xs font-black text-gray-700 uppercase tracking-wide flex items-center gap-1.5">
              <Repeat className="w-3.5 h-3.5" /> Daily rotation ({rotation.length})
            </h2>
            {rotation.length ? (
              rotation.map(renderTip)
            ) : (
              <p className="text-xs text-gray-500 p-3 rounded-2xl bg-white border border-gray-200">
                No rotation tips yet. Add a few tips without a date and the app will cycle through them.
              </p>
            )}
          </section>
          <section className="space-y-2">
            <h2 className="text-xs font-black text-gray-700 uppercase tracking-wide flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5" /> Scheduled for a date ({scheduled.length})
            </h2>
            {scheduled.length ? (
              scheduled.map(renderTip)
            ) : (
              <p className="text-xs text-gray-500 p-3 rounded-2xl bg-white border border-gray-200">
                No dated tips. Use a date for festivals or seasonal advice, e.g. Diwali or monsoon.
              </p>
            )}
          </section>
        </>
      )}

      {isOpen && (
        <Modal
          title={editing ? "Edit Tip" : "Add Tip"}
          subtitle="Keep it short and practical. No medicine doses."
          onClose={() => setIsOpen(false)}
          footer={
            <>
              <button type="button" className={ghostBtn} onClick={() => setIsOpen(false)}>
                Cancel
              </button>
              <button type="button" className={primaryBtn} onClick={save} disabled={saving || form.text.trim().length < 5}>
                {saving && <Spinner />} Save
              </button>
            </>
          }
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Card title">
              <input className={inputClass} value={form.title} onChange={(e) => set("title", e.target.value)} maxLength={60} />
            </Field>
            <Field label="Category (optional)">
              <input
                className={inputClass}
                list="tip-categories"
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                maxLength={40}
              />
              <datalist id="tip-categories">
                {CATEGORY_SUGGESTIONS.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
          </div>
          <Field label="Tip text" hint={`${form.text.length}/${TEXT_MAX} characters`}>
            <textarea
              className={`${inputClass} h-28 py-2 resize-none`}
              value={form.text}
              maxLength={TEXT_MAX}
              onChange={(e) => set("text", e.target.value)}
              placeholder="Start your day with a glass of warm water and a pinch of turmeric to support digestion."
            />
          </Field>
          <div className="grid grid-cols-2 gap-3 items-end">
            <Field label="Show on date (optional)" hint="Leave empty to add it to the daily rotation.">
              <input
                type="date"
                className={inputClass}
                value={form.scheduledFor ?? ""}
                onChange={(e) => set("scheduledFor", e.target.value || null)}
              />
            </Field>
            <Field label="Rotation order">
              <input
                type="number"
                min={0}
                className={inputClass}
                value={form.sortOrder}
                onChange={(e) => set("sortOrder", Number(e.target.value))}
                disabled={Boolean(form.scheduledFor)}
              />
            </Field>
          </div>
          <Toggle checked={form.isActive} onChange={(v) => set("isActive", v)} label={form.isActive ? "Active" : "Paused"} />
        </Modal>
      )}
    </AdminPageShell>
  );
}
