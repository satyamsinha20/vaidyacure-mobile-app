"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CalendarClock, CheckCircle2, AlertTriangle, IndianRupee, LayoutDashboard, LogOut, MessagesSquare, Stethoscope, UserRound, Users, X } from "lucide-react";
import { authService } from "@/services/auth.service";
import { doctorPanelService, DoctorMe } from "@/services/doctorPanel.service";
import type { Toast } from "@/components/admin/AdminPageShell";

const NAV = [
  { href: "/doctor", label: "Dashboard", icon: LayoutDashboard },
  { href: "/doctor/consultations", label: "Consultations", icon: MessagesSquare },
  { href: "/doctor/availability", label: "Working hours", icon: CalendarClock },
  { href: "/doctor/patients", label: "My patients", icon: Users },
  { href: "/doctor/earnings", label: "Earnings", icon: IndianRupee },
  { href: "/doctor/profile", label: "Profile & payouts", icon: UserRound },
];

/** Frame of the doctor panel: different look from the admin portal, and only the doctor's own pages */
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
  onMe?: (me: DoctorMe) => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<DoctorMe | null>(null);

  useEffect(() => {
    doctorPanelService
      .me()
      .then((d) => {
        if (d.mustChangePassword || !d.termsAcceptedAt) {
          router.replace("/doctor/setup");
          return;
        }
        setMe(d);
        onMe?.(d);
      })
      .catch(async () => {
        await authService.logout();
        router.replace("/login");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!toast || !onDismissToast) return;
    const timer = setTimeout(onDismissToast, 5000);
    return () => clearTimeout(timer);
  }, [toast, onDismissToast]);

  const logout = async () => {
    await authService.logout();
    router.replace("/login");
  };

  return (
    <div className="min-h-screen bg-[#F1F7F9] text-gray-900 flex flex-col">
      <header className="h-14 bg-[#0B4A5C] text-white flex items-center justify-between px-4 sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center">
            <Stethoscope className="w-4 h-4" />
          </div>
          <div>
            <p className="text-sm font-black leading-tight">VaidyaCure Doctor</p>
            <p className="text-[10.5px] text-cyan-100/80 leading-tight">{me ? `${me.name} · ${me.doctorCode}` : "Loading…"}</p>
          </div>
        </div>
        <button type="button" onClick={logout} className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 cursor-pointer">
          <LogOut className="w-3.5 h-3.5" /> Log out
        </button>
      </header>
      <div className="flex-1 flex">
        <aside className="hidden md:block w-56 shrink-0 bg-white border-r border-gray-200 p-3 space-y-1">
          {NAV.map((n) => {
            const Icon = n.icon;
            const active = n.href === "/doctor" ? pathname === "/doctor" : pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[13px] ${active ? "bg-cyan-50 text-cyan-900 font-bold" : "text-gray-600 hover:bg-gray-50"}`}
              >
                <Icon className="w-4 h-4" /> {n.label}
              </Link>
            );
          })}
        </aside>
        <main className="flex-1 min-w-0 p-3 sm:p-5 space-y-3 max-w-[1100px]">
          <nav className="md:hidden flex gap-1.5 overflow-x-auto pb-1">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap border ${
                  (n.href === "/doctor" ? pathname === "/doctor" : pathname.startsWith(n.href)) ? "bg-[#0B4A5C] text-white border-[#0B4A5C]" : "bg-white border-gray-200 text-gray-700"
                }`}
              >
                {n.label}
              </Link>
            ))}
          </nav>
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
      </div>
    </div>
  );
}
