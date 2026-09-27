"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Search,
  Smartphone,
  Shield,
  Globe,
  RefreshCw,
  Layers,
} from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import TopNav from "@/components/dashboard/TopNav";
import { authService, AdminUser } from "@/services/auth.service";
import { userService, MobileAppUser } from "@/services/user.service";
import { ROUTES } from "@/lib/constants";

interface ManageUsersClientProps {
  initialUsers: MobileAppUser[];
  initialTotal: number;
}

const formatUserDate = (dateStr?: string): string => {
  if (!dateStr) return "Recently";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "Recently";
    const day = d.getDate();
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sept",
      "Oct",
      "Nov",
      "Dec",
    ];
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    let hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, "0");
    const ampm = hours >= 12 ? "pm" : "am";
    hours = hours % 12;
    hours = hours ? hours : 12;
    const strHours = hours.toString().padStart(2, "0");
    return `${day} ${month} ${year}, ${strHours}:${minutes} ${ampm}`;
  } catch {
    return "Recently";
  }
};

export default function ManageUsersClient({
  initialUsers,
  initialTotal,
}: ManageUsersClientProps) {
  const [adminUser, setAdminUser] = useState<AdminUser>(authService.getStoredUser);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Synchronized state directly from SSR initialData
  const [appUsers, setAppUsers] = useState<MobileAppUser[]>(initialUsers);
  const [totalAppUsers, setTotalAppUsers] = useState<number>(initialTotal);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [appUsersError, setAppUsersError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const cachedUser = authService.getStoredUser();
    if (cachedUser) setAdminUser(cachedUser);
    authService
      .getMe()
      .then((u) => setAdminUser(u))
      .catch(() => {});
  }, []);

  const fetchAppUsers = useCallback(
    async (isManual = false) => {
      if (isManual) setIsRefreshing(true);
      setAppUsersError("");
      try {
        const res = await userService.getAppUsers(1, 100, searchQuery);
        if (res.status === "success" && Array.isArray(res.users)) {
          setAppUsers(res.users);
          const count = res.totalUsers ?? res.users.length;
          setTotalAppUsers(count);
        }
      } catch (err: any) {
        setAppUsersError(err?.message || "Failed to load mobile app users.");
      } finally {
        setIsRefreshing(false);
      }
    },
    [searchQuery]
  );

  const filteredUsers = appUsers.filter((u) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      (u.name && u.name.toLowerCase().includes(q)) ||
      (u.email && u.email.toLowerCase().includes(q)) ||
      (u.ipAddress && u.ipAddress.toLowerCase().includes(q)) ||
      (u.deviceInfo?.brand && u.deviceInfo.brand.toLowerCase().includes(q)) ||
      (u.deviceInfo?.model && u.deviceInfo.model.toLowerCase().includes(q)) ||
      (u.deviceInfo?.platform && u.deviceInfo.platform.toLowerCase().includes(q))
    );
  });

  return (
    <div className="h-screen overflow-hidden bg-[#F3F7F5] flex flex-col text-gray-900 selection:bg-emerald-500/20">
      {/* Full-Width Top Navigation */}
      <TopNav
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        adminUser={adminUser}
      />

      {/* Main Body */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden lg:pl-64 transition-all duration-300">
          <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto max-w-[1400px] w-full mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Link
                  href={ROUTES.DASHBOARD}
                  className="p-2 rounded-xl bg-white border border-gray-200 text-gray-600 hover:text-emerald-800 hover:border-emerald-300 transition-colors shadow-2xs"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Link>
                <div>
                  <h1 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">
                    User Management & Analytics
                  </h1>
                  <p className="text-xs text-gray-500">
                    Track mobile app installs, first-time onboarding registrations, and device footprints
                  </p>
                </div>
              </div>

              {/* Refresh Button */}
              <button
                type="button"
                onClick={() => fetchAppUsers(true)}
                disabled={isRefreshing}
                className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-emerald-800 bg-white border border-emerald-200 hover:bg-emerald-50 active:bg-emerald-100 rounded-xl shadow-2xs transition-all cursor-pointer w-fit"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
                <span>Refresh Data</span>
              </button>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white rounded-2xl p-4 border border-[#E3ECE6] shadow-2xs flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-medium">Total Mobile App Users</p>
                  <h3 suppressHydrationWarning className="text-xl font-bold text-gray-900">
                    {totalAppUsers}
                  </h3>
                </div>
              </div>

              <div className="bg-white rounded-2xl p-4 border border-[#E3ECE6] shadow-2xs flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-medium">MongoDB Collection</p>
                  <h3 className="text-sm font-bold text-gray-900">users</h3>
                </div>
              </div>

              <div className="bg-white rounded-2xl p-4 border border-[#E3ECE6] shadow-2xs flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-medium">Device & IP Tracking</p>
                  <h3 className="text-sm font-bold text-emerald-700">Active & Automated</h3>
                </div>
              </div>
            </div>

            {/* Table Card */}
            <div className="bg-white rounded-2xl border border-[#E3ECE6] shadow-[0_1px_3px_rgba(0,0,0,0.03)] overflow-hidden">
              {/* Search & Filter Bar */}
              <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="relative w-full max-w-sm">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by name, email, IP, device..."
                    className="w-full h-9 pl-10 pr-4 rounded-xl bg-gray-50 border border-gray-200 focus:bg-white focus:border-emerald-500 text-xs text-gray-900 outline-none transition-all"
                  />
                </div>
                <div suppressHydrationWarning className="text-xs text-gray-500 font-medium self-end sm:self-center">
                  Showing {filteredUsers.length} of {totalAppUsers} app users
                </div>
              </div>

              {/* Error Notice */}
              {appUsersError && (
                <div className="p-4 bg-amber-50 text-amber-800 text-xs border-b border-amber-200">
                  {appUsersError}
                </div>
              )}

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-gray-600">
                  <thead className="bg-gray-50/75 border-b border-gray-100 text-gray-500 font-bold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="px-5 py-3">App User</th>
                      <th className="px-5 py-3">Age / Gender</th>
                      <th className="px-5 py-3">Device Information</th>
                      <th className="px-5 py-3">IP Address</th>
                      <th className="px-5 py-3">First Opened</th>
                    </tr>
                  </thead>
                  <tbody suppressHydrationWarning className="divide-y divide-gray-100">
                    {filteredUsers.length === 0 ? (
                      <tr key="row-empty">
                        <td colSpan={5} className="px-5 py-12 text-center text-gray-400">
                          <Smartphone className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                          <p className="font-semibold text-gray-600">No Mobile App Users Found</p>
                          <p className="text-[11px] text-gray-400 mt-1 max-w-sm mx-auto">
                            When users open the VaidyaCure mobile app for the first time and fill the onboarding popup, their details, IP, and device info will appear here.
                          </p>
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map((user, idx) => {
                        const platform = user.deviceInfo?.platform || "mobile";
                        const deviceBrand = user.deviceInfo?.brand || "";
                        const deviceModel = user.deviceInfo?.model || "";
                        const fullDevice =
                          [deviceBrand, deviceModel].filter(Boolean).join(" ") || "Unknown Device";
                        const rowKey = user.id || user._id || `app-user-${user.email || idx}`;

                        return (
                          <tr key={rowKey} className="hover:bg-gray-50/60 transition-colors">
                            {/* User Name & Email */}
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-[#E5F3EB] text-[#135334] font-bold text-xs flex items-center justify-center shrink-0">
                                  {(user.name || "U").charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <p className="font-bold text-gray-900">{user.name}</p>
                                  <p className="text-[11px] text-gray-400">{user.email}</p>
                                </div>
                              </div>
                            </td>

                            {/* Age & Gender */}
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-gray-800">{user.age} yrs</span>
                                <span className="text-gray-300">•</span>
                                <span
                                  className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${
                                    user.gender === "female"
                                      ? "bg-pink-100 text-pink-700"
                                      : user.gender === "male"
                                      ? "bg-blue-100 text-blue-700"
                                      : "bg-purple-100 text-purple-700"
                                  }`}
                                >
                                  {user.gender}
                                </span>
                              </div>
                            </td>

                            {/* Device Information */}
                            <td className="px-5 py-3.5">
                              <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="inline-flex px-1.5 py-0.5 rounded bg-gray-100 text-[10px] font-bold uppercase text-gray-700">
                                    {platform}
                                  </span>
                                  <span className="font-medium text-gray-800 text-[11px]">
                                    {fullDevice}
                                  </span>
                                </div>
                                {user.deviceInfo?.osVersion && (
                                  <span className="text-[10px] text-gray-400">
                                    OS: {user.deviceInfo.osVersion}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* IP Address */}
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-1.5 text-gray-600 font-mono text-[11px]">
                                <Globe className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                <span>{user.ipAddress || "N/A"}</span>
                              </div>
                            </td>

                            {/* Joined / First Opened */}
                            <td
                              suppressHydrationWarning
                              className="px-5 py-3.5 text-gray-500 text-[11px]"
                            >
                              {formatUserDate(user.createdAt || user.firstOpenedAt)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
