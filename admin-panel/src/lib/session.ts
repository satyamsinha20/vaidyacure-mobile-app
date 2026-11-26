import { cookies } from "next/headers";
import { APP_CONFIG } from "@/lib/constants";
import type { AdminUser } from "@/services/auth.service";

const ROLES: readonly AdminUser["role"][] = ["superadmin", "moderator", "editor", "viewer", "doctor"];
const ROLE_COOKIE = "vaidya_admin_role";

const isRole = (value: unknown): value is AdminUser["role"] =>
  typeof value === "string" && (ROLES as readonly string[]).includes(value);

const text = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : "");

const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

/** The profile cookie saved at login (js-cookie may leave it URI-encoded) */
const parseProfile = (raw?: string): Partial<AdminUser> | null => {
  if (!raw) return null;
  for (const candidate of [raw, safeDecode(raw)]) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (parsed && typeof parsed === "object") return parsed as Partial<AdminUser>;
    } catch {
      // try the next form
    }
  }
  return null;
};

/**
 * The signed-in account from the login cookies, read on the server so the sidebar
 * and navbar render for the right role on the first paint (no items appearing late).
 * Display only: the backend checks the token on every request.
 */
export async function readSessionUser(): Promise<AdminUser | null> {
  const store = await cookies();
  if (!store.get(APP_CONFIG.COOKIE_TOKEN_KEY)?.value) return null;

  const profile = parseProfile(store.get(APP_CONFIG.STORAGE_USER_KEY)?.value);
  const roleCookie = store.get(ROLE_COOKIE)?.value;
  const profileRole = profile?.role;
  const role = isRole(roleCookie) ? roleCookie : isRole(profileRole) ? profileRole : null;
  if (!role) return null;

  return {
    id: text(profile?.id, 64),
    name: text(profile?.name, 120),
    email: text(profile?.email, 200),
    role,
  };
}
