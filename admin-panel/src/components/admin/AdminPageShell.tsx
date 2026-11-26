"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, AlertTriangle, X } from "lucide-react";
import { ROUTES } from "@/lib/constants";

export interface Toast {
  message: string;
  kind: "success" | "error";
}

/**
 * Common admin page body: page header, a toast line and the content.
 * The top bar and sidebar come from the (admin) layout and stay on screen.
 */
export default function AdminPageShell({
  title,
  subtitle,
  actions,
  toast,
  onDismissToast,
  children,
}: {
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
  toast?: Toast | null;
  onDismissToast?: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!toast || !onDismissToast) return;
    const timer = setTimeout(onDismissToast, 5000);
    return () => clearTimeout(timer);
  }, [toast, onDismissToast]);

  return (
    <main className="flex-1 p-3 sm:p-4 lg:p-5 overflow-y-auto max-w-[1240px] w-full mx-auto space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Link
            href={ROUTES.DASHBOARD}
            className="p-1.5 rounded-xl bg-white border border-gray-200 text-gray-600 hover:text-emerald-800 hover:border-emerald-300 transition-colors shadow-2xs"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
          </Link>
          <div>
            <h1 className="text-lg sm:text-xl font-black text-gray-900 tracking-tight leading-tight">{title}</h1>
            <p className="text-[11px] text-gray-500">{subtitle}</p>
          </div>
        </div>
        {actions}
      </div>

      {toast && (
        <div
          className={`p-2.5 px-3 rounded-xl border text-xs font-semibold flex items-center justify-between shadow-2xs ${
            toast.kind === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          <span className="flex items-center gap-1.5">
            {toast.kind === "success" ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
            {toast.message}
          </span>
          {onDismissToast && (
            <button type="button" onClick={onDismissToast} className="cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {children}
    </main>
  );
}
