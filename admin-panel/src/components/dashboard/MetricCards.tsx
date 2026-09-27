'use client';

import React, { useState, useEffect } from 'react';
import {
  Users,
  UserCheck,
  Stethoscope,
  Search,
  MessageSquare,
  FileCheck,
} from 'lucide-react';
import { userService } from '@/services/user.service';

interface MetricItem {
  id: string;
  title: string;
  value: string;
  trend: string;
  trendDirection: 'up' | 'down';
  trendContext: string;
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  cardBg?: string;
  cardBorder?: string;
}

const METRIC_TOTAL_USERS_KEY = 'vaidya_cached_total_users';

const STATIC_METRICS: MetricItem[] = [
  {
    id: 'total_users',
    title: 'Total Users',
    value: '', // Dynamic from backend, cached in localStorage to prevent reload flashing
    trend: '↑ 12%',
    trendDirection: 'up',
    trendContext: 'vs last month',
    icon: Users,
    iconBg: 'bg-[#EBF7EE]',
    iconColor: 'text-[#16783F]',
  },
  {
    id: 'active_users',
    title: 'Active Users',
    value: '8,421',
    trend: '↑ 9%',
    trendDirection: 'up',
    trendContext: 'vs last month',
    icon: UserCheck,
    iconBg: 'bg-[#EBF7EE]',
    iconColor: 'text-[#16783F]',
  },
  {
    id: 'diagnoses',
    title: 'Diagnoses Performed',
    value: '6,284',
    trend: '↑ 18%',
    trendDirection: 'up',
    trendContext: 'vs last month',
    icon: Stethoscope,
    iconBg: 'bg-[#E6F7F5]',
    iconColor: 'text-[#0D9488]',
  },
  {
    id: 'remedy_searches',
    title: 'Remedy Searches',
    value: '18,420',
    trend: '↑ 14%',
    trendDirection: 'up',
    trendContext: 'vs last month',
    icon: Search,
    iconBg: 'bg-[#EBF7F6]',
    iconColor: 'text-[#0D9488]',
  },
  {
    id: 'feedback',
    title: 'Feedback Received',
    value: '1,204',
    trend: '↑ 6%',
    trendDirection: 'up',
    trendContext: 'vs last month',
    icon: MessageSquare,
    iconBg: 'bg-[#EBF7EE]',
    iconColor: 'text-[#16783F]',
  },
  {
    id: 'pending_reviews',
    title: 'Pending Reviews',
    value: '16',
    trend: '↓ 27%',
    trendDirection: 'down',
    trendContext: 'vs last month',
    icon: FileCheck,
    iconBg: 'bg-[#FDE9C9]',
    iconColor: 'text-[#B87113]',
    cardBg: 'bg-[#FEF6E9]',
    cardBorder: 'border-[#F8DFC0]',
  },
];

interface MetricCardsProps {
  initialTotalUsers?: number;
}

export default function MetricCards({ initialTotalUsers }: MetricCardsProps = {}) {
  const [totalUsersCount, setTotalUsersCount] = useState<number>(() => {
    if (typeof initialTotalUsers === 'number' && initialTotalUsers >= 0) {
      return initialTotalUsers;
    }
    if (typeof window !== 'undefined') {
      try {
        const cached =
          localStorage.getItem('vaidya_cached_total_app_users') ||
          localStorage.getItem(METRIC_TOTAL_USERS_KEY);
        if (cached !== null) {
          const parsed = parseInt(cached, 10);
          if (!isNaN(parsed) && parsed >= 0) return parsed;
        }
      } catch {}
    }
    return 2;
  });

  useEffect(() => {
    // 1. Immediately hydrate from shared localStorage cache
    try {
      const cached =
        localStorage.getItem('vaidya_cached_total_app_users') ||
        localStorage.getItem(METRIC_TOTAL_USERS_KEY);
      if (cached !== null) {
        const parsed = parseInt(cached, 10);
        if (!isNaN(parsed) && parsed >= 0) {
          setTotalUsersCount(parsed);
        }
      }
    } catch {}

    // 2. Fetch live user count from MongoDB users collection silently
    userService
      .getUserCount()
      .then((count) => {
        setTotalUsersCount(count);
        try {
          localStorage.setItem(METRIC_TOTAL_USERS_KEY, String(count));
          localStorage.setItem('vaidya_cached_total_app_users', String(count));
        } catch {}
      })
      .catch((err) => {
        console.error('Failed to fetch live user count:', err);
      });
  }, []);

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5 sm:gap-3.5">
      {STATIC_METRICS.map((metric) => {
        const Icon = metric.icon;
        const isPending = metric.id === 'pending_reviews';
        const isTotalUsers = metric.id === 'total_users';

        // Consistent display value without any flash or loading flicker
        const displayValue = isTotalUsers
          ? totalUsersCount.toLocaleString()
          : metric.value;

        return (
          <div
            key={metric.id}
            className={`p-3 sm:p-3.5 rounded-2xl flex items-center gap-2.5 sm:gap-3 transition-all duration-150 shadow-[0_1px_3px_rgba(0,0,0,0.03)] border ${
              isPending
                ? 'bg-[#FEF6E9] border-[#F8DFC0]'
                : 'bg-white border-[#E3ECE6]'
            }`}
          >
            {/* Left Icon Square */}
            <div
              className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl ${metric.iconBg} flex items-center justify-center shrink-0 shadow-2xs`}
            >
              <Icon className={`w-4 h-4 sm:w-5 sm:h-5 ${metric.iconColor}`} />
            </div>

            {/* Right Text Content */}
            <div className="min-w-0 flex-1">
              <p
                className="text-[11px] xl:text-[11.5px] font-medium text-gray-500 leading-tight mb-0.5 whitespace-normal line-clamp-1"
                title={metric.title}
              >
                {metric.title}
              </p>

              <h3
                suppressHydrationWarning
                className="text-xl sm:text-[22px] font-extrabold text-gray-900 tracking-tight leading-tight"
              >
                {displayValue}
              </h3>

              <div className="flex items-center gap-1 text-[11px] mt-0.5 whitespace-nowrap">
                <span
                  className={`font-bold ${
                    metric.trendDirection === 'up'
                      ? 'text-[#15803D]'
                      : 'text-[#DC2626]'
                  }`}
                >
                  {metric.trend}
                </span>
                <span className="text-gray-400 font-normal text-[10.5px]">
                  {metric.trendContext}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
