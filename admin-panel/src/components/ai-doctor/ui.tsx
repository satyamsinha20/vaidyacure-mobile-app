"use client";

import React from "react";
import { X, Loader2 } from "lucide-react";

export const inputClass =
  "w-full h-9 px-3 rounded-xl bg-white border border-gray-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 text-xs text-gray-800 placeholder-gray-400 outline-none transition-all";

export const primaryBtn =
  "inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-[#0D4827] hover:bg-[#145C33] active:bg-[#09391E] rounded-xl shadow-2xs transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";

export const ghostBtn =
  "inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";

export const dangerBtn =
  "inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition-all cursor-pointer disabled:opacity-50";

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-bold text-gray-700 mb-1">{label}</span>
      {children}
      {hint ? <span className="block text-[10.5px] text-gray-500 mt-1">{hint}</span> : null}
    </label>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2 cursor-pointer"
      aria-pressed={checked}
    >
      <span className={`relative w-9 h-5 rounded-full transition-colors ${checked ? "bg-emerald-600" : "bg-gray-300"}`}>
        <span
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${checked ? "left-4.5" : "left-0.5"}`}
        />
      </span>
      <span className="text-xs font-semibold text-gray-700">{label}</span>
    </button>
  );
}

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/40 backdrop-blur-[2px]">
      <div className="w-full max-w-lg max-h-[92vh] flex flex-col bg-white rounded-2xl shadow-xl border border-gray-200">
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-gray-100">
          <div>
            <h2 className="text-sm font-black text-gray-900">{title}</h2>
            {subtitle ? <p className="text-[11px] text-gray-500 mt-0.5">{subtitle}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg text-gray-500 hover:bg-gray-100 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">{children}</div>
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-end gap-2">{footer}</div>
      </div>
    </div>
  );
}

export function Spinner({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return <Loader2 className={`${className} animate-spin`} />;
}

export function TierBadge({ tier }: { tier: "free" | "premium" }) {
  return tier === "premium" ? (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">Premium</span>
  ) : (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">Free</span>
  );
}

export const errorMessage = (error: unknown) => (error instanceof Error ? error.message : "Something went wrong.");
