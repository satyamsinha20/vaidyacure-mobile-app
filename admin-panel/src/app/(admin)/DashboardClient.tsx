"use client";

import React, { useState, useEffect } from "react";
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

  // The top bar and sidebar come from the (admin) layout
  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto max-w-[1680px] w-full mx-auto flex flex-col gap-6">
      {/* Top Greeting, Botanical Quote Banner & Live Date/Time */}
      <GreetingHeader adminUser={adminUser} />

      {/* Live Metrics Row: Strictly Super Admin Exclusive */}
      {isSuperAdmin && <MetricCards initialTotalUsers={initialTotalUsers} />}
    </main>
  );
}
