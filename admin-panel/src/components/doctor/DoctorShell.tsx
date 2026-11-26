"use client";

import React, { useEffect, useRef } from "react";
import { CheckCircle2, AlertTriangle, X } from "lucide-react";
import { useDoctorMe } from "@/components/doctor/DoctorFrame";
import type { DoctorMe } from "@/services/doctorPanel.service";
import type { Toast } from "@/components/admin/AdminPageShell";

/**
 * Body of a doctor panel page: title, a toast line and the content. The top
 * bar and menu come from the doctor layout (DoctorFrame) and stay on screen.
 */
export default function DoctorShell({
  title,
  subtitle,
  toast,
  onDismissToast,
  actions,
  children,
  onMe,
}: {
  title: string;
  subtitle?: string;
  toast?: Toast | null;
  onDismissToast?: () => void;
  actions?: React.ReactNode;
  children: React.ReactNode;
  /** Called once with the doctor's profile, as soon as it is known */
  onMe?: (me: DoctorMe) => void;
}) {
  const me = useDoctorMe();
  const gaveMe = useRef(false);

  useEffect(() => {
    if (!me || gaveMe.current) return;
    gaveMe.current = true;
    onMe?.(me);
  }, [me, onMe]);

  useEffect(() => {
    if (!toast || !onDismissToast) return;
    const timer = setTimeout(onDismissToast, 5000);
    return () => clearTimeout(timer);
  }, [toast, onDismissToast]);

  return (
    <main className="min-w-0 p-3 sm:p-5 space-y-3 max-w-[1100px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg sm:text-xl font-black tracking-tight">{title}</h1>
          {subtitle && <p className="text-[11px] text-gray-500">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {toast && (
        <div
          className={`p-2.5 px-3 rounded-xl border text-xs font-semibold flex items-center justify-between ${
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
      {me ? children : <p className="text-xs text-gray-500">Loading…</p>}
    </main>
  );
}
