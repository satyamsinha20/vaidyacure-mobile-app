'use client';

import React from 'react';
import Link from 'next/link';
import { Plus, Users, BarChart2, Leaf } from 'lucide-react';

export const QuickActionsBar: React.FC = () => {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-3.5 sm:gap-4 items-stretch">
      {/* Botanical banner card - 5 columns */}
      <div className="xl:col-span-5 bg-gradient-to-r from-[#D6ECE0] via-[#E8F5EE] to-[#DCEDE3] rounded-2xl p-4 border border-[#CDE5D7] shadow-[0_1px_3px_rgba(0,0,0,0.03)] flex items-center justify-between relative overflow-hidden">
        {/* Left botanical leaf artwork */}
        <div className="flex items-center gap-3.5 relative z-10">
          <div className="w-10 h-10 rounded-2xl bg-white/80 border border-emerald-900/10 flex items-center justify-center shrink-0 shadow-2xs">
            <Leaf className="w-5 h-5 text-[#0F472B]" />
          </div>
          <div>
            <h4 className="font-bold text-gray-900 text-sm tracking-tight">Keep Knowledge Growing</h4>
            <p className="text-xs text-gray-600 mt-0.5">
              Manage content. Ensure safety. Help millions live better.
            </p>
          </div>
        </div>

        {/* Right botanical leaf decorative graphic */}
        <div className="hidden sm:flex items-center opacity-75">
          <Leaf className="w-8 h-8 text-[#288450] rotate-45 transform" />
        </div>
      </div>

      {/* Quick action buttons card - 7 columns */}
      <div className="xl:col-span-7 bg-white rounded-2xl p-4 border border-[#E3ECE6] shadow-[0_1px_3px_rgba(0,0,0,0.03)] flex flex-col sm:flex-row items-center justify-between gap-3">
        <span className="text-sm font-bold text-gray-900 tracking-tight shrink-0 hidden sm:inline">
          Quick Actions
        </span>

        <div className="flex flex-wrap items-center gap-2.5 justify-end w-full sm:w-auto">
          <Link
            href="/remedies/new"
            className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-white bg-[#0D4827] hover:bg-[#145C33] active:bg-[#09391E] rounded-xl shadow-xs transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add New Remedy
          </Link>

          <Link
            href="/articles/new"
            className="flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold text-gray-800 bg-[#EEF7F2] hover:bg-[#E2F1E8] rounded-xl border border-[#D5EADB] transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4 text-[#0D4827]" />
            Add Article
          </Link>

          <Link
            href="/users"
            className="flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold text-gray-800 bg-[#EEF7F2] hover:bg-[#E2F1E8] rounded-xl border border-[#D5EADB] transition-colors cursor-pointer"
          >
            <Users className="w-4 h-4 text-[#0D4827]" />
            Manage Users
          </Link>

          <Link
            href="/analytics"
            className="flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold text-gray-800 bg-[#EEF7F2] hover:bg-[#E2F1E8] rounded-xl border border-[#D5EADB] transition-colors cursor-pointer"
          >
            <BarChart2 className="w-4 h-4 text-[#0D4827]" />
            View Reports
          </Link>
        </div>
      </div>
    </div>
  );
};

export default QuickActionsBar;
