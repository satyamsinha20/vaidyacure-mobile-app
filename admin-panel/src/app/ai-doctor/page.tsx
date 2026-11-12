"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Stethoscope, Server, Settings, History, ShieldCheck, AlertTriangle, CheckCircle2, X, Lock } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import TopNav from "@/components/dashboard/TopNav";
import DoctorsTab from "@/components/ai-doctor/DoctorsTab";
import ProvidersTab from "@/components/ai-doctor/ProvidersTab";
import SettingsTab from "@/components/ai-doctor/SettingsTab";
import ActivityTab from "@/components/ai-doctor/ActivityTab";
import { Spinner, errorMessage } from "@/components/ai-doctor/ui";
import { authService, AdminUser } from "@/services/auth.service";
import { aiDoctorService, AiAuditEntry, AiDoctor, AiProvider, AiSettings, AiStatus } from "@/services/aiDoctor.service";
import { ROUTES } from "@/lib/constants";

type Tab = "doctors" | "providers" | "settings" | "activity";

const TABS: Array<{ key: Tab; label: string; icon: React.ElementType }> = [
  { key: "doctors", label: "Doctors", icon: Stethoscope },
  { key: "providers", label: "Providers", icon: Server },
  { key: "settings", label: "Settings", icon: Settings },
  { key: "activity", label: "Activity", icon: History },
];

export default function AiDoctorPage() {
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [access, setAccess] = useState<"checking" | "allowed" | "denied">("checking");
  const [tab, setTab] = useState<Tab>("doctors");

  const [status, setStatus] = useState<AiStatus | null>(null);
  const [providers, setProviders] = useState<AiProvider[]>([]);
  const [doctors, setDoctors] = useState<AiDoctor[]>([]);
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [audit, setAudit] = useState<AiAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; kind: "success" | "error" } | null>(null);

  const notify = useCallback((message: string, kind: "success" | "error" = "success") => {
    setToast({ message, kind });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  const loadAll = useCallback(async () => {
    try {
      const [s, p, d, st, a] = await Promise.all([
        aiDoctorService.status(),
        aiDoctorService.listProviders(),
        aiDoctorService.listDoctors(),
        aiDoctorService.getSettings(),
        aiDoctorService.audit(),
      ]);
      setStatus(s);
      setProviders(p);
      setDoctors(d);
      setSettings(st);
      setAudit(a);
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  // Super admin only (the backend enforces this too)
  useEffect(() => {
    const cached = authService.getStoredUser();
    if (cached) setAdminUser(cached);
    authService
      .getMe()
      .then((u) => {
        setAdminUser(u);
        if (u.role === "superadmin") {
          setAccess("allowed");
          loadAll();
        } else {
          setAccess("denied");
        }
      })
      .catch(() => setAccess("denied"));
  }, [loadAll]);

  const refreshConfig = useCallback(async () => {
    const [p, d, a] = await Promise.all([aiDoctorService.listProviders(), aiDoctorService.listDoctors(), aiDoctorService.audit()]);
    setProviders(p);
    setDoctors(d);
    setAudit(a);
  }, []);

  const freeCount = doctors.filter((d) => d.isActive && d.tier === "free").length;
  const premiumCount = doctors.filter((d) => d.isActive && d.tier === "premium").length;

  return (
    <div className="h-screen overflow-hidden bg-[#F3F7F5] flex flex-col text-gray-900 selection:bg-emerald-500/20 relative">
      <TopNav onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} adminUser={adminUser} />

      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} adminUser={adminUser} />

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden lg:pl-64 transition-all duration-300">
          <main className="flex-1 p-3 sm:p-4 lg:p-5 overflow-y-auto max-w-[1240px] w-full mx-auto space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Link
                  href={ROUTES.DASHBOARD}
                  className="p-1.5 rounded-xl bg-white border border-gray-200 text-gray-600 hover:text-emerald-800 hover:border-emerald-300 transition-colors shadow-2xs"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                </Link>
                <div>
                  <h1 className="text-lg sm:text-xl font-black text-gray-900 tracking-tight leading-tight">AI Doctor</h1>
                  <p className="text-[11px] text-gray-500">
                    Providers, models, doctors and consultation rules for the VaidyaCure app
                  </p>
                </div>
              </div>
              {access === "allowed" && !loading && (
                <div className="hidden sm:flex items-center gap-2 text-[11px]">
                  <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold">{freeCount} free</span>
                  <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 font-bold">{premiumCount} premium</span>
                </div>
              )}
            </div>

            {/* Toast */}
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
                <button type="button" onClick={() => setToast(null)} className="cursor-pointer">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {access === "checking" && (
              <div className="flex items-center gap-2 text-xs text-gray-500 p-4">
                <Spinner /> Checking access…
              </div>
            )}

            {access === "denied" && (
              <div className="p-6 rounded-2xl bg-white border border-gray-200 text-center">
                <Lock className="w-6 h-6 mx-auto text-gray-400" />
                <p className="text-sm font-bold text-gray-900 mt-2">Access denied</p>
                <p className="text-xs text-gray-500 mt-1">Only the Super Admin can manage AI doctors and API keys.</p>
              </div>
            )}

            {access === "allowed" && (
              <>
                {status && !status.encryptionConfigured && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>
                      <b>CONFIG_ENCRYPTION_KEY is not set on the server.</b> API keys cannot be stored or used until it is added to
                      the backend environment.
                    </span>
                  </div>
                )}

                <div className="p-2.5 rounded-xl bg-white border border-gray-200 text-[11px] text-gray-600 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  API keys are encrypted (AES-256) and never leave the server. The mobile app only sees doctor names and designations.
                </div>

                {/* Tabs */}
                <div className="flex items-center gap-1.5 overflow-x-auto">
                  {TABS.map((t) => {
                    const Icon = t.icon;
                    const active = tab === t.key;
                    return (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => setTab(t.key)}
                        className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all cursor-pointer ${
                          active ? "bg-[#0D4827] text-white border-[#0D4827]" : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {t.label}
                      </button>
                    );
                  })}
                </div>

                {loading ? (
                  <div className="flex items-center gap-2 text-xs text-gray-500 p-4">
                    <Spinner /> Loading…
                  </div>
                ) : tab === "doctors" ? (
                  <DoctorsTab doctors={doctors} providers={providers} onChanged={refreshConfig} notify={notify} />
                ) : tab === "providers" ? (
                  <ProvidersTab providers={providers} onChanged={refreshConfig} notify={notify} />
                ) : tab === "settings" ? (
                  <SettingsTab
                    settings={settings}
                    onSaved={(s) => {
                      setSettings(s);
                      aiDoctorService.audit().then(setAudit).catch(() => {});
                    }}
                    notify={notify}
                  />
                ) : (
                  <ActivityTab entries={audit} />
                )}
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
