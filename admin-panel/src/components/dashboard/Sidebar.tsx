import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sprout,
  ChevronDown,
  X,
  Users,
  Megaphone,
  BarChart3,
  MessageSquare,
} from "lucide-react";
import { authService, AdminUser } from "@/services/auth.service";

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
  adminUser?: AdminUser | null;
}

const remedyCategories = [
  "Herbs",
  "Allopathic",
  "Homeopathy",
  "Ayurveda",
  "Oils",
  "Flowers",
  "Supplements",
  "First Aid",
  "Wellness",
];

const superAdminNavItems = [
  { name: "Users", icon: Users, href: "/manage-users" },
  { name: "Marketing", icon: Megaphone, href: "#" },
  { name: "Analytics", icon: BarChart3, href: "#" },
  { name: "Feedback", icon: MessageSquare, href: "#" },
];

export default function Sidebar({ isOpen, onClose, adminUser }: SidebarProps) {
  const pathname = usePathname();
  const [isRemediesOpen, setIsRemediesOpen] = useState(true);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const user = adminUser || (mounted ? authService.getStoredUser() : null);
  const isSuperAdmin = Boolean(mounted && user?.role === "superadmin");

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 top-14 sm:top-15 z-30 bg-black/60 backdrop-blur-xs lg:hidden"
        />
      )}

      {/* Sidebar Container: Placed under the Full-Width Navbar with lighter botanical green */}
      <aside
        className={`fixed top-14 sm:top-15 bottom-0 left-0 z-30 w-64 bg-[#063019] text-white flex flex-col justify-between transition-transform duration-300 ease-in-out border-r border-[#09351C] shadow-sm ${
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        {/* Mobile Header (Close button only on mobile) */}
        <div className="lg:hidden flex items-center justify-between p-3 border-b border-white/10">
          <span className="text-xs font-bold tracking-wider text-emerald-300 uppercase">
            Menu
          </span>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Container - Remedies & Medicines Dropdown */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1 scrollbar-thin scrollbar-thumb-emerald-800/40">
          {/* Parent Dropdown Button */}
          <button
            type="button"
            onClick={() => setIsRemediesOpen(!isRemediesOpen)}
            className="w-full flex items-center justify-between px-2.5 py-2 text-white hover:bg-white/10 active:bg-white/15 rounded-xl transition-all cursor-pointer group"
          >
            <div className="flex items-center gap-2.5">
              <Sprout className="w-4 h-4 text-emerald-200 group-hover:text-white transition-colors shrink-0" />
              <span className="text-[13px] font-semibold tracking-tight text-white">
                Remedies &amp; Medicines
              </span>
            </div>
            <ChevronDown
              className={`w-3.5 h-3.5 text-emerald-200/90 transition-transform duration-200 ${
                isRemediesOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {/* Nested Tree List with Hierarchical Branch Connectors (No animation on reload) */}
          {isRemediesOpen && (
            <div className="ml-4.5 mt-0.5 relative space-y-0.5">
              {remedyCategories.map((category, index) => {
                const isLast = index === remedyCategories.length - 1;
                const slug = category.toLowerCase().replace(/\s+/g, "-");
                const isCategoryActive = pathname === `/remedies/${slug}`;

                return (
                  <div key={category} className="relative flex items-center py-0.5">
                    {/* Continuous vertical trunk line */}
                    <span
                      className={`absolute left-0 top-0 ${
                        isLast ? "h-1/2" : "h-full"
                      } w-[1.5px] bg-emerald-400/40`}
                    />

                    {/* Smooth curved branch hook towards item */}
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-b-[1.5px] border-l-[1.5px] border-emerald-400/40 rounded-bl-[6px]" />

                    {/* Category Item Link */}
                    <Link
                      href={`/remedies/${slug}`}
                      onClick={() => {
                        if (onClose) onClose();
                      }}
                      className={`w-full pl-6 pr-2 py-1 block text-left text-xs sm:text-[13px] rounded-lg transition-colors cursor-pointer ${
                        isCategoryActive
                          ? "text-white font-semibold bg-white/15 shadow-2xs"
                          : "text-emerald-100/90 hover:text-white hover:bg-white/10 font-normal"
                      }`}
                    >
                      {category}
                    </Link>
                  </div>
                );
              })}
            </div>
          )}

          {/* Super Admin Exclusive Menus: Users, Marketing, Analytics, Feedback */}
          {isSuperAdmin && (
            <div className="pt-2.5 mt-2.5 border-t border-white/10 space-y-1">
              <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300/70">
                Admin Controls
              </div>

              {superAdminNavItems.map((item) => {
                const Icon = item.icon;
                const isItemActive =
                  activeMenu === item.name || (item.href && item.href !== "#" && pathname === item.href);

                if (item.href && item.href !== "#") {
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={() => {
                        setActiveMenu(item.name);
                        if (onClose) onClose();
                      }}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-left rounded-xl transition-all group ${
                        isItemActive
                          ? "bg-white/15 text-white font-semibold shadow-2xs"
                          : "text-emerald-100/90 hover:text-white hover:bg-white/10 font-medium"
                      }`}
                    >
                      <Icon className="w-4 h-4 text-emerald-200 group-hover:text-white transition-colors shrink-0" />
                      <span className="text-[13px] tracking-tight">{item.name}</span>
                    </Link>
                  );
                }

                return (
                  <button
                    key={item.name}
                    type="button"
                    onClick={() => setActiveMenu(item.name)}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-left rounded-xl transition-all cursor-pointer group ${
                      isItemActive
                        ? "bg-white/15 text-white font-semibold shadow-2xs"
                        : "text-emerald-100/90 hover:text-white hover:bg-white/10 font-medium"
                    }`}
                  >
                    <Icon className="w-4 h-4 text-emerald-200 group-hover:text-white transition-colors shrink-0" />
                    <span className="text-[13px] tracking-tight">{item.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Bottom Footer info */}
        <div className="p-3 text-center text-[10.5px] text-emerald-200/50 border-t border-white/10">
          VaidyaCure Operations
        </div>
      </aside>
    </>
  );
}

