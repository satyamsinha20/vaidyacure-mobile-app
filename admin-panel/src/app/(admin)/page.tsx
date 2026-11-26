import React from "react";
import { cookies } from "next/headers";
import DashboardClient from "./DashboardClient";
import { AdminUser, DEFAULT_ADMIN } from "@/services/auth.service";
import { APP_CONFIG } from "@/lib/constants";

export const dynamic = "force-dynamic";

function parseJwtRoleAndEmail(token?: string): { role?: string; email?: string } {
  if (!token) return {};
  try {
    const parts = token.split(".");
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf-8"));
      return {
        role: payload.role,
        email: payload.email,
      };
    }
  } catch {}
  return {};
}

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(APP_CONFIG.COOKIE_TOKEN_KEY)?.value;
  const userCookie = cookieStore.get(APP_CONFIG.STORAGE_USER_KEY)?.value;
  const roleCookie = cookieStore.get("vaidya_admin_role")?.value;

  let initialUser: AdminUser | null = null;
  let isSuperAdmin = false;

  if (userCookie) {
    try {
      initialUser = JSON.parse(decodeURIComponent(userCookie));
      if (initialUser && initialUser.role) {
        isSuperAdmin = initialUser.role === "superadmin";
      }
    } catch {}
  }

  if (!initialUser && token) {
    const { role, email } = parseJwtRoleAndEmail(token);
    const activeRole = role || roleCookie;
    if (activeRole) {
      isSuperAdmin = activeRole === "superadmin";
      initialUser = {
        id: "session-admin",
        name: email ? email.split("@")[0] : "Admin",
        email: email || "admin@vaidyacure.com",
        role: activeRole as any,
      };
    }
  }

  // If no token exists at all, fallback to default superadmin
  if (!initialUser && !token) {
    initialUser = DEFAULT_ADMIN;
    isSuperAdmin = true;
  }


  return (
    <DashboardClient
      initialUser={initialUser}
      initialIsSuperAdmin={isSuperAdmin}
    />
  );
}
