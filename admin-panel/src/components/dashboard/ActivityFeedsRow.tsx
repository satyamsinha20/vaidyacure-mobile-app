'use client';

import React from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Leaf,
  Pill,
  FlaskConical,
  FileText,
  Sprout,
  Star,
} from 'lucide-react';

interface RecentUser {
  id: string;
  name: string;
  email: string;
  initials: string;
  timeAgo: string;
}

const recentUsers: RecentUser[] = [
  { id: '1', name: 'Ananya Sharma', email: 'ananya@gmail.com', initials: 'AS', timeAgo: 'Joined 2 minutes ago' },
  { id: '2', name: 'Rohan Kumar', email: 'rohan.k@gmail.com', initials: 'RK', timeAgo: 'Joined 14 minutes ago' },
  { id: '3', name: 'Meera Patel', email: 'meera.patel@gmail.com', initials: 'MP', timeAgo: 'Joined 36 minutes ago' },
  { id: '4', name: 'Sarthak Verma', email: 'sarthakv@gmail.com', initials: 'SV', timeAgo: 'Joined 1 hour ago' },
  { id: '5', name: 'Kavya Tiwari', email: 'kavya.t@gmail.com', initials: 'KT', timeAgo: 'Joined 2 hours ago' },
];

interface FeedbackItem {
  id: string;
  emoji: string;
  stars: number;
  title: string;
  comment: string;
  timeAgo: string;
}

const recentFeedback: FeedbackItem[] = [
  {
    id: '1',
    emoji: '😊',
    stars: 5,
    title: 'Very helpful!',
    comment: 'Loved the natural remedies. Very easy to use.',
    timeAgo: '2 hours ago',
  },
  {
    id: '2',
    emoji: '😃',
    stars: 4,
    title: 'Good information',
    comment: 'Helped me understand my symptoms better.',
    timeAgo: '5 hours ago',
  },
  {
    id: '3',
    emoji: '🌟',
    stars: 5,
    title: 'Amazing app!',
    comment: 'Great combination of modern and natural heal...',
    timeAgo: '1 day ago',
  },
  {
    id: '4',
    emoji: '🙂',
    stars: 4,
    title: 'Needs more details',
    comment: 'Would be great to add dosage information.',
    timeAgo: '1 day ago',
  },
  {
    id: '5',
    emoji: '💚',
    stars: 5,
    title: 'Very useful',
    comment: 'Clean interface and trustworthy content.',
    timeAgo: '2 days ago',
  },
];

interface PendingItem {
  id: string;
  name: string;
  type: string;
  icon: React.ReactNode;
}

const pendingVerifications: PendingItem[] = [
  {
    id: '1',
    name: "St. John's Wort",
    type: 'Herb',
    icon: <Leaf className="w-4 h-4 text-[#16783F]" />,
  },
  {
    id: '2',
    name: 'Azithromycin',
    type: 'Allopathic',
    icon: <Pill className="w-4 h-4 text-[#16783F]" />,
  },
  {
    id: '3',
    name: 'Ashoka',
    type: 'Ayurveda',
    icon: <Sprout className="w-4 h-4 text-[#16783F]" />,
  },
  {
    id: '4',
    name: 'Echinacea',
    type: 'Supplement',
    icon: <FlaskConical className="w-4 h-4 text-[#16783F]" />,
  },
  {
    id: '5',
    name: 'Migraine Treatment Guide',
    type: 'Article',
    icon: <FileText className="w-4 h-4 text-[#16783F]" />,
  },
];

export const ActivityFeedsRow: React.FC = () => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5 sm:gap-4">
      {/* Column 1: Recent Users */}
      <div className="bg-white border border-[#E3ECE6] rounded-2xl p-4 sm:p-4.5 shadow-[0_1px_3px_rgba(0,0,0,0.03)] flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-gray-900 text-sm tracking-tight">Recent Users</h3>
            <Link
              href="/users"
              className="text-xs font-semibold text-[#0E5832] hover:text-emerald-700 flex items-center gap-1 transition-colors"
            >
              <span>View All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="space-y-2.5">
            {recentUsers.map((user) => (
              <div
                key={user.id}
                className="flex items-center justify-between hover:bg-gray-50/60 p-1 rounded-xl transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-[#D4EBDB] text-[#0B4B27] font-bold text-xs flex items-center justify-center shrink-0">
                    {user.initials}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-gray-900 leading-tight">
                      {user.name}
                    </div>
                    <div className="text-[11px] text-gray-400 leading-tight mt-0.5">
                      {user.email}
                    </div>
                  </div>
                </div>
                <div className="text-[11px] text-gray-400 font-medium shrink-0 ml-1">
                  {user.timeAgo}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Column 2: Recent Feedback */}
      <div className="bg-white border border-[#E3ECE6] rounded-2xl p-4 sm:p-4.5 shadow-[0_1px_3px_rgba(0,0,0,0.03)] flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-gray-900 text-sm tracking-tight">Recent Feedback</h3>
            <Link
              href="/feedback"
              className="text-xs font-semibold text-[#0E5832] hover:text-emerald-700 flex items-center gap-1 transition-colors"
            >
              <span>View All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="space-y-2.5">
            {recentFeedback.map((fb) => (
              <div
                key={fb.id}
                className="flex items-start gap-2.5 hover:bg-gray-50/60 p-1 rounded-xl transition-colors"
              >
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-sm shrink-0 mt-0.5">
                  {fb.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <div className="flex items-center gap-1.5 truncate">
                      <div className="flex text-amber-400 shrink-0">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            className={`w-3 h-3 ${
                              i < fb.stars
                                ? 'fill-amber-400 text-amber-400'
                                : 'fill-gray-200 text-gray-200'
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-xs font-bold text-gray-900 truncate">
                        {fb.title}
                      </span>
                    </div>
                    <span className="text-[11px] text-gray-400 shrink-0">{fb.timeAgo}</span>
                  </div>
                  <p className="text-[11px] text-gray-500 truncate leading-tight">
                    {fb.comment}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Column 3: Pending Verification */}
      <div className="bg-white border border-[#E3ECE6] rounded-2xl p-4 sm:p-4.5 shadow-[0_1px_3px_rgba(0,0,0,0.03)] flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-gray-900 text-sm tracking-tight">
              Pending Verification
            </h3>
            <Link
              href="/safety"
              className="text-xs font-semibold text-[#0E5832] hover:text-emerald-700 flex items-center gap-1 transition-colors"
            >
              <span>View All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="space-y-2.5">
            {pendingVerifications.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between hover:bg-gray-50/60 p-1 rounded-xl transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-[#EAF7EE] flex items-center justify-center shrink-0">
                    {item.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-gray-900 truncate leading-tight">
                      {item.name}
                    </div>
                    <div className="text-[11px] text-gray-400 leading-tight mt-0.5">
                      {item.type}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="px-3.5 py-1 text-xs font-semibold text-[#A56814] bg-[#FDF1DA] hover:bg-[#FBE8C4] active:bg-[#F8DEAF] rounded-full border border-[#F6DEB6] transition-colors shrink-0 shadow-2xs cursor-pointer ml-1"
                >
                  Review
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ActivityFeedsRow;
