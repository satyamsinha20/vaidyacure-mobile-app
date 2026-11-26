"use client";

import React, { createContext, useContext } from "react";
import type { AdminUser } from "@/services/auth.service";

const SessionContext = createContext<AdminUser | null>(null);

/** Shares the account read from the login cookies on the server with every client component */
export function SessionProvider({ user, children }: { user: AdminUser | null; children: React.ReactNode }) {
  return <SessionContext.Provider value={user}>{children}</SessionContext.Provider>;
}

/** The signed-in account from the login cookies (null when logged out). Display only. */
export const useSessionUser = (): AdminUser | null => useContext(SessionContext);
