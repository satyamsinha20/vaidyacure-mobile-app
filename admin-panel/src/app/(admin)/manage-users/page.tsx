import React from "react";
import ManageUsersClient from "./ManageUsersClient";
import { MobileAppUser } from "@/services/user.service";
import { cookies } from "next/headers";
import { APP_CONFIG } from "@/lib/constants";

export const dynamic = "force-dynamic";

async function getInitialUsers(token?: string): Promise<{ users: MobileAppUser[]; totalUsers: number }> {
  try {
    const baseUrl = APP_CONFIG.API_BASE_URL || "http://localhost:5000/api";
    const res = await fetch(`${baseUrl}/users`, {
      cache: "no-store",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.users)) {
        return {
          users: data.users,
          totalUsers: typeof data.totalUsers === "number" ? data.totalUsers : data.users.length,
        };
      }
    }
  } catch (err) {
    console.error("Failed to fetch initial users for SSR:", err);
  }
  return { users: [], totalUsers: 0 };
}

export default async function ManageUsersPage() {
  const token = (await cookies()).get(APP_CONFIG.COOKIE_TOKEN_KEY)?.value;
  const initialData = await getInitialUsers(token);

  return (
    <ManageUsersClient
      initialUsers={initialData.users}
      initialTotal={initialData.totalUsers}
    />
  );
}
