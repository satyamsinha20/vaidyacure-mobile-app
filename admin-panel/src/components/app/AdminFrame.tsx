"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/dashboard/Sidebar";
import TopNav from "@/components/dashboard/TopNav";
import { authService, AdminUser } from "@/services/auth.service";

const FrameUserContext = createContext<{ adminUser: AdminUser | null; setAdminUser: (user: AdminUser) => void }>({
  adminUser: null,
  setAdminUser: () => {},
});

/** The account shown in the top bar and sidebar (a page can update it, e.g. after a profile change) */
export const useFrameUser = () => useContext(FrameUserContext);

/**
 * The admin portal frame (top bar + sidebar). It lives in the (admin) layout,
 * so it stays on screen while pages change: only the page area is swapped.
 */
export default function AdminFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  // The phone sidebar stays open only on the page where it was opened (a link closes it)
  const [sidebarOpenOn, setSidebarOpenOn] = useState<string | null>(null);
  const isSidebarOpen = sidebarOpenOn === pathname;

  useEffect(() => {
    authService.getMe().then(setAdminUser).catch(() => {});
  }, []);
  const frameUser = useMemo(() => ({ adminUser, setAdminUser }), [adminUser]);

  return (
    <FrameUserContext.Provider value={frameUser}>
      <div className="h-screen overflow-hidden bg-[#F3F7F5] flex flex-col text-gray-900 selection:bg-emerald-500/20 relative">
        <TopNav onToggleSidebar={() => setSidebarOpenOn(isSidebarOpen ? null : pathname)} adminUser={adminUser} />
        <div className="flex-1 flex min-h-0 overflow-hidden relative">
          <Sidebar isOpen={isSidebarOpen} onClose={() => setSidebarOpenOn(null)} adminUser={adminUser} />
          <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden lg:pl-64 transition-all duration-300">{children}</div>
        </div>
      </div>
    </FrameUserContext.Provider>
  );
}
