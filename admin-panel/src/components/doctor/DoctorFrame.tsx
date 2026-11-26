"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CalendarClock, IndianRupee, LayoutDashboard, LogOut, MessagesSquare, Stethoscope, UserRound, Users } from "lucide-react";
import { ApiError } from "@/lib/api";
import { authService } from "@/services/auth.service";
import { doctorPanelService, DoctorMe } from "@/services/doctorPanel.service";

const NAV = [
  { href: "/doctor", label: "Dashboard", icon: LayoutDashboard },
  { href: "/doctor/consultations", label: "Consultations", icon: MessagesSquare },
  { href: "/doctor/availability", label: "Working hours", icon: CalendarClock },
  { href: "/doctor/patients", label: "My patients", icon: Users },
  { href: "/doctor/earnings", label: "Earnings", icon: IndianRupee },
  { href: "/doctor/profile", label: "Profile & payouts", icon: UserRound },
];

const isActive = (href: string, pathname: string) => (href === "/doctor" ? pathname === "/doctor" : pathname.startsWith(href));

const DoctorMeContext = createContext<DoctorMe | null>(null);

/** The logged-in doctor's profile (null until it has loaded once) */
export const useDoctorMe = () => useContext(DoctorMeContext);

/**
 * Frame of the doctor panel (top bar + menu). It lives in the doctor layout,
 * so it stays on screen while pages change. The doctor's profile is loaded
 * once and refreshed quietly on every page change.
 */
export default function DoctorFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<DoctorMe | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    let alive = true;
    doctorPanelService
      .me()
      .then((d) => {
        if (!alive) return;
        if (d.mustChangePassword || !d.termsAcceptedAt) {
          router.replace("/doctor/setup");
          return;
        }
        loaded.current = true;
        setMe(d);
      })
      .catch(async (error: unknown) => {
        if (!alive) return;
        // A refused login always ends the session; a network hiccup after the first load does not
        const refused = error instanceof ApiError && (error.status === 401 || error.status === 403);
        if (!refused && loaded.current) return;
        await authService.logout();
        router.replace("/login");
      });
    return () => {
      alive = false;
    };
  }, [pathname, router]);

  const logout = async () => {
    await authService.logout();
    router.replace("/login");
  };

  return (
    <DoctorMeContext.Provider value={me}>
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
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[13px] ${
                    isActive(n.href, pathname) ? "bg-cyan-50 text-cyan-900 font-bold" : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <Icon className="w-4 h-4" /> {n.label}
                </Link>
              );
            })}
          </aside>
          <div className="flex-1 min-w-0">
            <nav className="md:hidden flex gap-1.5 overflow-x-auto px-3 pt-3 pb-1">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap border ${
                    isActive(n.href, pathname) ? "bg-[#0B4A5C] text-white border-[#0B4A5C]" : "bg-white border-gray-200 text-gray-700"
                  }`}
                >
                  {n.label}
                </Link>
              ))}
            </nav>
            {children}
          </div>
        </div>
      </div>
    </DoctorMeContext.Provider>
  );
}
