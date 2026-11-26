"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Inbox, CheckCheck, Eye, Trash2, RefreshCw, Smartphone } from "lucide-react";
import AdminPageShell, { Toast } from "@/components/admin/AdminPageShell";
import { Spinner, dangerBtn, errorMessage, ghostBtn } from "@/components/ai-doctor/ui";
import { announceFeedbackCount, contentService, FeedbackItem, FeedbackPage, FeedbackRating, FeedbackStatus } from "@/services/content.service";
import { cachedLoad } from "@/lib/cache";

const RATING_STYLE: Record<FeedbackRating, { label: string; emoji: string; cls: string }> = {
  excellent: { label: "Excellent", emoji: "😍", cls: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  good: { label: "Good", emoji: "👍", cls: "bg-sky-50 text-sky-800 border-sky-200" },
  average: { label: "Average", emoji: "😐", cls: "bg-amber-50 text-amber-800 border-amber-200" },
  poor: { label: "Needs improvement", emoji: "⚠️", cls: "bg-rose-50 text-rose-800 border-rose-200" },
};

const STATUS_TABS: Array<{ key: "" | FeedbackStatus; label: string }> = [
  { key: "", label: "All" },
  { key: "new", label: "New" },
  { key: "read", label: "Read" },
  { key: "resolved", label: "Resolved" },
];

export default function FeedbackPageView() {
  const [status, setStatus] = useState<"" | FeedbackStatus>("new");
  const [rating, setRating] = useState<"" | FeedbackRating>("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<FeedbackPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const load = useCallback(async (useCache = true) => {
    setLoading(true);
    try {
      await cachedLoad(
        `feedback:${status}:${rating}:${page}`,
        () => contentService.listFeedback({ status, rating, page }),
        (result) => {
          setData(result);
          announceFeedbackCount(result.counts.new);
        },
        useCache
      );
    } catch (error) {
      setToast({ message: errorMessage(error), kind: "error" });
    } finally {
      setLoading(false);
    }
  }, [status, rating, page]);

  useEffect(() => {
    load();
  }, [load]);

  const setItemStatus = async (item: FeedbackItem, next: FeedbackStatus) => {
    setBusyId(item.id);
    try {
      await contentService.setFeedbackStatus(item.id, next);
      await load();
    } catch (error) {
      setToast({ message: errorMessage(error), kind: "error" });
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (item: FeedbackItem) => {
    if (!window.confirm("Delete this feedback permanently?")) return;
    setBusyId(item.id);
    try {
      await contentService.deleteFeedback(item.id);
      setToast({ message: "Feedback deleted.", kind: "success" });
      await load();
    } catch (error) {
      setToast({ message: errorMessage(error), kind: "error" });
    } finally {
      setBusyId(null);
    }
  };

  const counts = data?.counts;
  const tabCount = (key: "" | FeedbackStatus) =>
    !counts ? null : key === "" ? counts.new + counts.read + counts.resolved : counts[key];

  return (
    <AdminPageShell
      title="Feedback"
      subtitle="What app users are saying. Each phone and network can send one feedback per week. New feedback shows on the bell icon."
      toast={toast}
      onDismissToast={() => setToast(null)}
      actions={
        <button type="button" className={ghostBtn} onClick={() => load(false)} disabled={loading}>
          {loading ? <Spinner /> : <RefreshCw className="w-3.5 h-3.5" />} Refresh
        </button>
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {STATUS_TABS.map((t) => (
            <button
              key={t.key || "all"}
              type="button"
              onClick={() => {
                setStatus(t.key);
                setPage(1);
              }}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all cursor-pointer ${
                status === t.key ? "bg-[#0D4827] text-white border-[#0D4827]" : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
              }`}
            >
              {t.label}
              {tabCount(t.key) !== null && <span className="ml-1 opacity-75">({tabCount(t.key)})</span>}
            </button>
          ))}
        </div>
        <select
          className="h-8 px-3 rounded-xl bg-white border border-gray-200 text-xs text-gray-700"
          value={rating}
          onChange={(e) => {
            setRating(e.target.value as "" | FeedbackRating);
            setPage(1);
          }}
        >
          <option value="">All ratings</option>
          {(Object.keys(RATING_STYLE) as FeedbackRating[]).map((r) => (
            <option key={r} value={r}>
              {RATING_STYLE[r].label}
            </option>
          ))}
        </select>
      </div>

      {loading && !data ? (
        <div className="flex items-center gap-2 text-xs text-gray-500 p-4">
          <Spinner /> Loading…
        </div>
      ) : data && data.items.length === 0 ? (
        <div className="p-8 rounded-2xl bg-white border border-gray-200 text-center">
          <Inbox className="w-7 h-7 mx-auto text-gray-400" />
          <p className="text-sm font-bold text-gray-800 mt-2">No feedback here</p>
          <p className="text-xs text-gray-500 mt-1">Feedback sent from the app&apos;s Feedback tab appears here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {data?.items.map((item) => {
            const r = RATING_STYLE[item.rating];
            return (
              <div
                key={item.id}
                className={`p-3 rounded-2xl bg-white border ${item.status === "new" ? "border-emerald-300" : "border-gray-200"} shadow-2xs`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${r.cls}`}>
                      {r.emoji} {r.label}
                    </span>
                    {item.status === "new" && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600 text-white">NEW</span>
                    )}
                    {item.status === "resolved" && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-600 border border-gray-200">
                        Resolved
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-gray-500 flex items-center gap-1">
                    <Smartphone className="w-3 h-3" />
                    {item.platform || "app"}
                    {item.appVersion ? ` · v${item.appVersion}` : ""} · {new Date(item.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm text-gray-800 mt-2 whitespace-pre-wrap break-words">
                  {item.message || <span className="text-gray-400 italic">Rating only, no message.</span>}
                </p>
                <div className="flex items-center justify-end gap-1.5 mt-2.5">
                  {busyId === item.id && <Spinner />}
                  {item.status === "new" && (
                    <button type="button" className={ghostBtn} onClick={() => setItemStatus(item, "read")} disabled={busyId === item.id}>
                      <Eye className="w-3.5 h-3.5" /> Mark read
                    </button>
                  )}
                  {item.status !== "resolved" ? (
                    <button type="button" className={ghostBtn} onClick={() => setItemStatus(item, "resolved")} disabled={busyId === item.id}>
                      <CheckCheck className="w-3.5 h-3.5" /> Resolve
                    </button>
                  ) : (
                    <button type="button" className={ghostBtn} onClick={() => setItemStatus(item, "read")} disabled={busyId === item.id}>
                      Reopen
                    </button>
                  )}
                  <button type="button" className={dangerBtn} onClick={() => remove(item)} disabled={busyId === item.id}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {data && data.pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button type="button" className={ghostBtn} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <span className="text-xs text-gray-600">
            Page {data.page} of {data.pages}
          </span>
          <button type="button" className={ghostBtn} disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
      )}
    </AdminPageShell>
  );
}
