"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  Menu,
  Search,
  Bell,
  ChevronDown,
  LogOut,
  User,
  Shield,
  LayoutDashboard,
  Leaf,
  Stethoscope,
  Settings,
} from "lucide-react";
import { authService, AdminUser, DEFAULT_ADMIN } from "@/services/auth.service";
import { contentService, FEEDBACK_COUNT_EVENT } from "@/services/content.service";
import { ROUTES } from "@/lib/constants";

// New-feedback count is shared across page changes and refreshed at most once a minute
let feedbackCountCache: { value: number; at: number } | null = null;
const FEEDBACK_COUNT_TTL_MS = 60_000;

interface TopNavProps {
  onToggleSidebar: () => void;
  adminUser?: AdminUser | null;
}

export default function TopNav({ onToggleSidebar, adminUser }: TopNavProps) {
  const router = useRouter();
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [mounted, setMounted] = useState(false);
  const [clientUser, setClientUser] = useState<AdminUser | null>(null);
  const [newFeedback, setNewFeedback] = useState(() => feedbackCountCache?.value ?? 0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (feedbackCountCache && Date.now() - feedbackCountCache.at < FEEDBACK_COUNT_TTL_MS) return;
    contentService
      .feedbackSummary()
      .then(({ newCount }) => {
        feedbackCountCache = { value: newCount, at: Date.now() };
        setNewFeedback(newCount);
      })
      .catch(() => {});
    // The Feedback page announces the fresh count after every change
    const onCount = (event: Event) => {
      const value = (event as CustomEvent<number>).detail;
      feedbackCountCache = { value, at: Date.now() };
      setNewFeedback(value);
    };
    window.addEventListener(FEEDBACK_COUNT_EVENT, onCount);
    return () => window.removeEventListener(FEEDBACK_COUNT_EVENT, onCount);
  }, []);

  // Sync stored user safely and fetch fresh user in real time
  useEffect(() => {
    setMounted(true);
    const stored = adminUser || authService.getStoredUser();
    if (stored) {
      setClientUser(stored);
    }
    // Real-time backend fetch
    authService
      .getMe()
      .then((u) => {
        if (u) setClientUser(u);
      })
      .catch(() => {});
  }, [adminUser]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsProfileDropdownOpen(false);
      }
    };

    if (isProfileDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isProfileDropdownOpen]);

  const handleLogout = async () => {
    setIsProfileDropdownOpen(false);
    try {
      await authService.logout();
    } finally {
      router.push(ROUTES.LOGIN);
    }
  };

  // Determine active user and role safely for hydration
  const user: AdminUser =
    adminUser || clientUser || authService.getStoredUser() || DEFAULT_ADMIN;
  const isSuperAdmin = Boolean(mounted && user.role === "superadmin");
  const roleLabel =
    user.role === "superadmin"
      ? "Super Admin"
      : user.role === "moderator"
      ? "Moderator"
      : user.role === "viewer"
      ? "Viewer"
      : "Admin";

  return (
    <header className="sticky top-0 z-40 w-full h-14 sm:h-15 bg-white border-b border-gray-200/80 px-3 sm:px-4 lg:px-6 flex items-center justify-between transition-all">
      {/* 1. Left: Brand Section (aligned with 64 width of sidebar on desktop) */}
      <div className="flex items-center gap-3 lg:w-64 shrink-0">
        <button
          onClick={onToggleSidebar}
          className="lg:hidden p-1.5 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors cursor-pointer"
          aria-label="Toggle Sidebar"
        >
          <Menu className="w-4 h-4" />
        </button>

        <Link href={ROUTES.DASHBOARD} className="flex items-center gap-2 group">
          <Image
            src="/assets/vaidyacure_headinglogo.png"
            alt="VaidyaCure"
            width={220}
            height={55}
            priority
            className="h-10 sm:h-11 md:h-12 w-auto max-w-[210px] object-contain transition-transform group-hover:scale-[1.02]"
          />
        </Link>
      </div>

      {/* 2. Middle: Compact Search Bar and Dashboard Pill Menu */}
      <div className="flex items-center gap-2.5 sm:gap-3 flex-1 max-w-xl min-w-0 pl-2 lg:pl-4">
        {/* Compact Search Bar */}
        <div className="relative w-full max-w-[180px] sm:max-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search..."
            className="w-full h-8 pl-8.5 pr-3 rounded-full bg-gray-50/80 hover:bg-white border border-gray-200/80 focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500/20 text-xs text-gray-800 placeholder-gray-400 outline-none transition-all"
          />
        </div>

        {/* Dashboard with Icon Menu Button */}
        <Link
          href={ROUTES.DASHBOARD}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50/90 hover:bg-emerald-100 text-[#0F472B] text-xs font-bold border border-emerald-200/80 transition-all cursor-pointer shadow-2xs shrink-0"
        >
          <LayoutDashboard className="w-3.5 h-3.5 text-emerald-700" />
          <span className="hidden sm:inline">Dashboard</span>
        </Link>

        {/* AI Doctor configuration (super admin only) */}
        {isSuperAdmin && (
          <Link
            href={ROUTES.AI_DOCTOR}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50/90 hover:bg-emerald-100 text-[#0F472B] text-xs font-bold border border-emerald-200/80 transition-all cursor-pointer shadow-2xs shrink-0"
          >
            <Stethoscope className="w-3.5 h-3.5 text-emerald-700" />
            <span className="hidden sm:inline">AI Doctor</span>
          </Link>
        )}

        {/* Settings: API keys, email and search (super admin only) */}
        {isSuperAdmin && (
          <Link
            href={ROUTES.SETTINGS}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50/90 hover:bg-emerald-100 text-[#0F472B] text-xs font-bold border border-emerald-200/80 transition-all cursor-pointer shadow-2xs shrink-0"
          >
            <Settings className="w-3.5 h-3.5 text-emerald-700" />
            <span className="hidden sm:inline">Settings</span>
          </Link>
        )}
      </div>

      {/* 3. Right: Notifications & Admin Profile Dropdown */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Notification Bell with Badge */}
        <Link
          href="/feedback"
          title={newFeedback ? `${newFeedback} new feedback` : "Feedback"}
          className="relative p-1.5 rounded-full text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors cursor-pointer"
        >
          <Bell className="w-4 h-4" />
          {newFeedback > 0 && (
            <span className="absolute top-0 right-0 min-w-3.5 h-3.5 px-0.5 bg-rose-500 text-white rounded-full text-[9px] font-bold flex items-center justify-center ring-1 ring-white">
              {newFeedback > 99 ? "99+" : newFeedback}
            </span>
          )}
        </Link>

        {/* Admin Profile Pill */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
            className="flex items-center gap-2 p-1 sm:px-2.5 sm:py-1 rounded-full hover:bg-gray-100 transition-all cursor-pointer border border-transparent hover:border-gray-200"
          >
            {/* Avatar Circle */}
            <div
              suppressHydrationWarning
              className="w-7 h-7 rounded-full bg-[#0D4D2B] text-white flex items-center justify-center text-xs font-bold shadow-2xs"
            >
              {user.name ? user.name.charAt(0).toUpperCase() : "S"}
            </div>

            {/* Profile Info */}
            <div className="hidden sm:block text-left">
              <p
                suppressHydrationWarning
                className="text-[11px] font-bold text-gray-900 leading-tight"
              >
                {user.name || "Satyam Kumar Sinha"}
              </p>
              <p
                suppressHydrationWarning
                className="text-[9px] text-emerald-600 font-semibold tracking-wide leading-tight"
              >
                {roleLabel}
              </p>
            </div>

            <ChevronDown className="w-3 h-3 text-gray-400 hidden sm:block" />
          </button>

          {/* Profile Dropdown Popup */}
          {isProfileDropdownOpen && (
            <>
              {/* Invisible full-screen backdrop for seamless outside clicks */}
              <div
                className="fixed inset-0 z-40 bg-transparent"
                onClick={() => setIsProfileDropdownOpen(false)}
              />

              <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-white border border-gray-100 shadow-xl shadow-gray-200/60 p-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                {/* Header User info */}
                <div className="px-3 py-2 border-b border-gray-100">
                  <p className="text-xs font-bold text-gray-900 leading-tight">
                    {user.name || "Satyam Kumar Sinha"}
                  </p>
                  <p className="text-[11px] text-gray-400 truncate mt-0.5">
                    {user.email || "admin@vaidyacure.com"}
                  </p>
                  <span className="mt-1 inline-block text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    {roleLabel}
                  </span>
                </div>

                {/* Menu Options */}
                <div className="py-1 space-y-0.5">
                  {/* Option 1: Profile (always visible for all roles) */}
                  <Link
                    href={ROUTES.PROFILE}
                    onClick={() => setIsProfileDropdownOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-gray-700 hover:bg-emerald-50 hover:text-emerald-800 transition-colors cursor-pointer"
                  >
                    <User className="w-4 h-4 text-emerald-700" />
                    <span>Profile</span>
                  </Link>

                  {/* Option 2: Manage Role (ONLY visible if Super Admin) */}
                  {isSuperAdmin && (
                    <Link
                      href={ROUTES.MANAGE_ROLES}
                      onClick={() => setIsProfileDropdownOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-gray-700 hover:bg-emerald-50 hover:text-emerald-800 transition-colors cursor-pointer"
                    >
                      <Shield className="w-4 h-4 text-emerald-700" />
                      <span>Manage Role</span>
                    </Link>
                  )}
                </div>

                {/* Option 3: Sign Out (always visible for all roles) */}
                <div className="border-t border-gray-100 pt-1">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                  >
                    <LogOut className="w-4 h-4 text-rose-500" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

