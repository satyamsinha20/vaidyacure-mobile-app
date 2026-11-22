"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, AlertTriangle, X } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import TopNav from "@/components/dashboard/TopNav";
import { authService, AdminUser } from "@/services/auth.service";
import { ROUTES } from "@/lib/constants";

export interface Toast {
  message: string;
  kind: "success" | "error";
}

/** Common admin page frame: top bar, sidebar, page header and a toast line */
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
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    setAdminUser(authService.getStoredUser());
    authService.getMe().then(setAdminUser).catch(() => {});
  }, []);

  useEffect(() => {
    if (!toast || !onDismissToast) return;
    const timer = setTimeout(onDismissToast, 5000);
    return () => clearTimeout(timer);
  }, [toast, onDismissToast]);

  return (
    <div className="h-screen overflow-hidden bg-[#F3F7F5] flex flex-col text-gray-900 selection:bg-emerald-500/20 relative">
      <TopNav onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} adminUser={adminUser} />
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} adminUser={adminUser} />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden lg:pl-64 transition-all duration-300">
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
        </div>
      </div>
    </div>
  );
}
