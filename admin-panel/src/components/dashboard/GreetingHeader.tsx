"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import { Calendar, Clock, Leaf, Sparkles } from "lucide-react";
import { AdminUser, authService } from "@/services/auth.service";

interface GreetingHeaderProps {
  adminUser?: AdminUser | null;
}

const CLOCK_DATE_KEY = "vaidya_clock_date";
const CLOCK_TIME_KEY = "vaidya_clock_time";
const GREETING_KEY = "vaidya_last_greeting";

const getDynamicGreeting = (): string => {
  const hour = new Date().getHours();
  if (hour >= 4 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17 && hour < 22) return "Good evening";
  return "Good night";
};

export default function GreetingHeader({ adminUser }: GreetingHeaderProps) {
  const [mounted, setMounted] = useState(false);
  const [currentDateStr, setCurrentDateStr] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(CLOCK_DATE_KEY) || "";
    }
    return "";
  });
  const [currentTimeStr, setCurrentTimeStr] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(CLOCK_TIME_KEY) || "";
    }
    return "";
  });
  const [greeting, setGreeting] = useState<string>(getDynamicGreeting);
  const [realTimeUser, setRealTimeUser] = useState<AdminUser | null>(adminUser || null);

  // 1. Real-time User Fetch & Sync from Backend
  useEffect(() => {
    const stored = adminUser || authService.getStoredUser();
    if (stored) {
      setRealTimeUser(stored);
    }

    authService
      .getMe()
      .then((user) => {
        if (user) setRealTimeUser(user);
      })
      .catch(() => {});
  }, [adminUser]);

  // 2. Real-time Live Clock & Dynamic Greeting (Updates every 1000ms)
  useEffect(() => {
    setMounted(true);

    const updateClock = () => {
      const now = new Date();

      // Dynamic greeting based on current local hour
      const nextGreeting = getDynamicGreeting();
      setGreeting(nextGreeting);

      // Live Formatted Date
      const dateFormatted = now.toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      });
      setCurrentDateStr(dateFormatted);

      // Live Formatted Time with ticking seconds
      const timeFormatted = now.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      });
      setCurrentTimeStr(timeFormatted);

      try {
        localStorage.setItem(CLOCK_DATE_KEY, dateFormatted);
        localStorage.setItem(CLOCK_TIME_KEY, timeFormatted);
        localStorage.setItem(GREETING_KEY, nextGreeting);
      } catch {}
    };

    updateClock();
    const interval = setInterval(updateClock, 1000); // Ticks every second in real time
    return () => clearInterval(interval);
  }, []);

  // Format admin user first name nicely
  const getFirstName = (fullName?: string) => {
    if (!fullName || fullName === "Admin") return "Satyam";
    const clean = fullName.trim().split(/\s+/)[0];
    return clean.charAt(0).toUpperCase() + clean.slice(1);
  };

  const user = realTimeUser || adminUser || authService.getStoredUser();
  const adminName = getFirstName(user.name);

  return (
    <section className="w-full bg-transparent pt-1 pb-3 sm:py-2">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 w-full">
        {/* ========================================================= */}
        {/* 1. LEFT: Leaf Icon + Greeting + Subtitle                  */}
        {/* ========================================================= */}
        <div className="flex items-center gap-3.5 shrink-0">
          {/* Natural Botanical Green Leaf Icon */}
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border border-emerald-500/20 flex items-center justify-center shrink-0 shadow-xs group cursor-default">
            <svg
              viewBox="0 0 36 36"
              className="w-7 h-7 sm:w-8 sm:h-8 transform -rotate-6 group-hover:rotate-0 transition-transform duration-300 drop-shadow-[0_2px_4px_rgba(22,101,52,0.2)]"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Leaf Blade with gradient */}
              <path
                d="M7 29C9 20 14.5 11 29 7C29 20 20 27 7 29Z"
                fill="url(#ayur_leaf_gradient)"
              />
              {/* Main Central Stem */}
              <path
                d="M7 29C13.5 23.5 20 17 29 7"
                stroke="#0F472B"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
              {/* Delicate Side Veins */}
              <path
                d="M14 22.5C16.5 19.5 19.5 18 22 17"
                stroke="#86EFAC"
                strokeWidth="1.1"
                strokeLinecap="round"
              />
              <path
                d="M11 25.5C12.5 23.5 14.5 22.5 17 21.5"
                stroke="#86EFAC"
                strokeWidth="1.1"
                strokeLinecap="round"
              />
              <path
                d="M18.5 18C21 15.5 24 14.5 25.5 13.5"
                stroke="#86EFAC"
                strokeWidth="1.1"
                strokeLinecap="round"
              />
              {/* Highlight curve */}
              <path
                d="M12 18C17 11 23 8.5 27 7.5"
                stroke="#BBF7D0"
                strokeWidth="0.8"
                strokeLinecap="round"
                opacity="0.8"
              />
              <defs>
                <linearGradient
                  id="ayur_leaf_gradient"
                  x1="7"
                  y1="29"
                  x2="29"
                  y2="7"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop stopColor="#15803D" />
                  <stop offset="0.55" stopColor="#22C55E" />
                  <stop offset="1" stopColor="#4ADE80" />
                </linearGradient>
              </defs>
            </svg>
          </div>

          {/* Heading and Subtitle */}
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#0B2545] tracking-tight flex items-center gap-1.5">
              <span suppressHydrationWarning>{greeting},</span>
              <span suppressHydrationWarning className="text-[#0E3B27]">{adminName}!</span>
            </h1>
            <p className="text-xs sm:text-sm text-gray-500 font-normal mt-0.5">
              Here&apos;s what&apos;s happening with VaidyaCure today.
            </p>
          </div>
        </div>

        {/* ========================================================= */}
        {/* 2. CENTER: Pill Banner with Herbal Leaves & Quote         */}
        {/* ========================================================= */}
        <div className="w-full lg:w-auto flex-1 max-w-xl mx-auto lg:mx-4">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#EAF5EF] via-[#F3F9F5] to-[#EBF6F0] border border-[#CCE3D4] shadow-[0_2px_8px_rgba(10,54,34,0.04)] px-4 sm:px-6 py-2 sm:py-2.5 flex items-center justify-center sm:justify-start min-h-[52px]">
            {/* Left Decorative Botanical Leaves Branch */}
            <div className="absolute left-0 top-0 bottom-0 w-28 sm:w-36 pointer-events-none overflow-hidden opacity-95">
              {/* Natural layered leaves SVG branch */}
              <svg
                viewBox="0 0 140 60"
                className="w-full h-full object-cover"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                {/* Main Branch Stem */}
                <path
                  d="M-10 65 Q 40 45 75 15"
                  stroke="#2D5A3C"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
                {/* Leaf 1 (Left Lower) */}
                <path
                  d="M15 50 C 10 38 25 32 38 42 C 28 54 18 54 15 50 Z"
                  fill="#1B6338"
                  opacity="0.9"
                />
                <path d="M15 50 Q 26 44 38 42" stroke="#68D391" strokeWidth="0.9" />

                {/* Leaf 2 (Center Vibrant Green) */}
                <path
                  d="M32 38 C 30 20 54 14 68 22 C 55 38 42 42 32 38 Z"
                  fill="url(#pill_leaf_grad_1)"
                />
                <path d="M32 38 Q 50 28 68 22" stroke="#9AE6B4" strokeWidth="1" />
                <path d="M42 33 Q 48 26 55 24" stroke="#BBF7D0" strokeWidth="0.7" />

                {/* Leaf 3 (Top Delicate Shoot) */}
                <path
                  d="M60 22 C 62 10 78 6 86 12 C 77 22 69 25 60 22 Z"
                  fill="#38A169"
                />
                <path d="M60 22 Q 73 16 86 12" stroke="#C6F6D5" strokeWidth="0.8" />

                {/* Small Accent Leaf (Back) */}
                <path
                  d="M24 32 C 18 24 28 18 36 22 C 32 30 26 33 24 32 Z"
                  fill="#144C2B"
                  opacity="0.75"
                />

                <defs>
                  <linearGradient
                    id="pill_leaf_grad_1"
                    x1="32"
                    y1="38"
                    x2="68"
                    y2="22"
                    gradientUnits="userSpaceOnUse"
                  >
                    <stop stopColor="#1E7540" />
                    <stop offset="0.6" stopColor="#2F9E58" />
                    <stop offset="1" stopColor="#48BB78" />
                  </linearGradient>
                </defs>
              </svg>
            </div>

            {/* Quote Typography */}
            <div className="relative z-10 w-full flex flex-col sm:flex-row items-center justify-center pl-16 sm:pl-20 pr-1 text-center sm:text-left">
              <span className="font-serif italic font-semibold text-[#0F472B] tracking-wide text-[14px] sm:text-[15.5px] leading-tight select-none">
                <span className="text-[#15803D] text-lg font-serif mr-1">“</span>
                Better Knowledge.
                <span className="block sm:inline sm:ml-1.5 font-serif">
                  Healthier Lives.
                </span>
                <span className="text-[#15803D] text-lg font-serif ml-1">”</span>
              </span>
            </div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* 3. RIGHT: Live Date & Time + Calendar Icon                */}
        {/* ========================================================= */}
        <div className="flex items-center gap-2.5 shrink-0 self-end lg:self-center">
          {/* Formatted Date and Time Container */}
          <div className="flex items-center gap-2 text-right">
            <div className="flex flex-col items-end">
              <span
                suppressHydrationWarning
                className="text-xs sm:text-sm font-semibold text-gray-800 tracking-tight"
              >
                {currentDateStr || "Today"}
              </span>
              <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-mono font-medium text-emerald-800">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" title="Live Clock" />
                <Clock className="w-3 h-3 text-emerald-600 shrink-0" />
                <span suppressHydrationWarning className="tabular-nums tracking-wide">
                  {currentTimeStr || "--:--:--"}
                </span>
              </div>
            </div>

            {/* Calendar Icon Badge matching the reference design */}
            <div
              className="w-8 h-8 rounded-lg bg-white border border-gray-200/90 shadow-2xs flex items-center justify-center text-gray-700 hover:text-emerald-700 hover:border-emerald-300 transition-colors"
              title="Today's Date"
            >
              <Calendar className="w-4 h-4 text-emerald-800" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
