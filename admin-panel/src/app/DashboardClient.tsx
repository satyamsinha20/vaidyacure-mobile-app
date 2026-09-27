"use client";

import React, { useState, useEffect } from "react";
import Sidebar from "@/components/dashboard/Sidebar";
import TopNav from "@/components/dashboard/TopNav";
import GreetingHeader from "@/components/dashboard/GreetingHeader";
import MetricCards from "@/components/dashboard/MetricCards";
import { authService, AdminUser } from "@/services/auth.service";

interface DashboardClientProps {
  initialUser?: AdminUser | null;
  initialIsSuperAdmin: boolean;
  initialTotalUsers?: number;
}

export default function DashboardClient({
  initialUser,
  initialIsSuperAdmin,
  initialTotalUsers,
}: DashboardClientProps) {
  const [adminUser, setAdminUser] = useState<AdminUser>(() => {
    if (initialUser) return initialUser;
    return authService.getStoredUser();
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    // Silently verify session in background without layout shifts
    authService
      .getMe()
      .then((user) => {
        if (
          user &&
          (user.email !== adminUser.email || user.role !== adminUser.role || user.name !== adminUser.name)
        ) {
          setAdminUser(user);
        }
      })
      .catch(() => {});
  }, [adminUser.email, adminUser.role, adminUser.name]);

  // Strictly check if current authenticated user is superadmin
  const isSuperAdmin = adminUser ? adminUser.role === "superadmin" : initialIsSuperAdmin;

  return (
    <div className="h-screen overflow-hidden bg-[#F3F7F5] flex flex-col text-gray-900 selection:bg-emerald-500/20">
      {/* 1. Full-Width Sticky Top Navigation Bar (Edge-to-Edge) */}
      <TopNav
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        adminUser={adminUser}
      />

      {/* 2. Main Body Container (Sidebar below navbar + Main Content Area) */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        {/* Left Botanical Dark Forest Green Sidebar (Positioned under TopNav) */}
        <Sidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          adminUser={adminUser}
        />

        {/* Content Area with left padding on lg screens */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden lg:pl-64 transition-all duration-300">
          {/* Dashboard Center Viewport */}
          <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto max-w-[1680px] w-full mx-auto flex flex-col gap-6">
            {/* Top Greeting, Botanical Quote Banner & Live Date/Time */}
            <GreetingHeader adminUser={adminUser} />

            {/* Live Metrics Row: Strictly Super Admin Exclusive */}
            {isSuperAdmin && <MetricCards initialTotalUsers={initialTotalUsers} />}
          </main>
        </div>
      </div>
    </div>
  );
}
