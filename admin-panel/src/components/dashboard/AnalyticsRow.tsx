'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ArrowRight } from 'lucide-react';

// Detailed SVG Illustrations for the 5 Popular Remedies to match realistic thumbnails
const AshwagandhaThumbnail: React.FC = () => (
  <svg viewBox="0 0 44 44" className="w-9 h-9 rounded-xl overflow-hidden shadow-2xs">
    <rect width="44" height="44" fill="#FBF4EA" />
    {/* Roots bundle */}
    <g stroke="#9C6B37" strokeWidth="3" strokeLinecap="round">
      <path d="M12 34 Q 22 22 32 10" />
      <path d="M16 36 Q 24 24 30 14" stroke="#875322" />
      <path d="M10 32 Q 20 20 28 8" stroke="#B8834F" />
      <path d="M22 36 Q 26 26 36 18" stroke="#704218" />
    </g>
    <ellipse cx="22" cy="24" rx="14" ry="5" fill="#5C3610" fillOpacity="0.1" />
  </svg>
);

const TulsiThumbnail: React.FC = () => (
  <svg viewBox="0 0 44 44" className="w-9 h-9 rounded-xl overflow-hidden shadow-2xs">
    <rect width="44" height="44" fill="#EDF7F1" />
    {/* Basil leaves */}
    <path
      d="M22 34 C 22 24 12 20 12 14 C 18 14 22 20 22 34 Z"
      fill="#23854A"
    />
    <path
      d="M22 34 C 22 24 32 20 32 14 C 26 14 22 20 22 34 Z"
      fill="#1A6C3A"
    />
    <path
      d="M22 30 C 22 18 22 10 22 8 C 22 10 22 18 22 30 Z"
      stroke="#104D27"
      strokeWidth="1.5"
    />
    <path
      d="M17 22 Q 22 19 27 22"
      stroke="#79D89A"
      strokeWidth="1.5"
      fill="none"
    />
  </svg>
);

const GingerThumbnail: React.FC = () => (
  <svg viewBox="0 0 44 44" className="w-9 h-9 rounded-xl overflow-hidden shadow-2xs">
    <rect width="44" height="44" fill="#FAF2E7" />
    {/* Knotted ginger rhizome */}
    <path
      d="M12 26 C 10 20 16 16 22 18 C 26 14 32 16 34 22 C 36 28 30 32 24 32 C 16 32 12 30 12 26 Z"
      fill="#CCA063"
    />
    <circle cx="18" cy="21" r="5" fill="#E2BD86" />
    <circle cx="28" cy="22" r="5" fill="#D3A76C" />
    <path d="M15 24 Q 22 26 31 24" stroke="#A87A3E" strokeWidth="1.5" fill="none" />
  </svg>
);

const ParacetamolThumbnail: React.FC = () => (
  <svg viewBox="0 0 44 44" className="w-9 h-9 rounded-xl overflow-hidden shadow-2xs">
    <rect width="44" height="44" fill="#EFF6FF" />
    {/* Pill blister pack / Tablets */}
    <rect x="10" y="14" width="24" height="16" rx="4" fill="#DBEAFE" stroke="#BFDBFE" strokeWidth="1.5" />
    <ellipse cx="17" cy="22" rx="4.5" ry="3" fill="#FFFFFF" stroke="#93C5FD" strokeWidth="1" />
    <line x1="17" y1="19.5" x2="17" y2="24.5" stroke="#93C5FD" strokeWidth="0.8" />
    <ellipse cx="27" cy="22" rx="4.5" ry="3" fill="#FFFFFF" stroke="#93C5FD" strokeWidth="1" />
    <line x1="27" y1="19.5" x2="27" y2="24.5" stroke="#93C5FD" strokeWidth="0.8" />
  </svg>
);

const TurmericThumbnail: React.FC = () => (
  <svg viewBox="0 0 44 44" className="w-9 h-9 rounded-xl overflow-hidden shadow-2xs">
    <rect width="44" height="44" fill="#FEF8E8" />
    {/* Turmeric bowl / powder mound */}
    <ellipse cx="22" cy="30" rx="14" ry="5" fill="#8E4700" fillOpacity="0.2" />
    <path
      d="M10 27 C 12 18 32 18 34 27 Z"
      fill="#E69500"
    />
    <path
      d="M14 26 C 17 19 27 19 30 26 Z"
      fill="#FFB703"
    />
    <circle cx="22" cy="20" r="3" fill="#FFC83B" />
  </svg>
);

interface RemedyItem {
  rank: number;
  name: string;
  views: string;
  percentage: number;
  thumbnail: React.ReactNode;
}

const POPULAR_REMEDIES: RemedyItem[] = [
  {
    rank: 1,
    name: 'Ashwagandha',
    views: '3,842 views',
    percentage: 82,
    thumbnail: <AshwagandhaThumbnail />,
  },
  {
    rank: 2,
    name: 'Tulsi (Holy Basil)',
    views: '3,120 views',
    percentage: 71,
    thumbnail: <TulsiThumbnail />,
  },
  {
    rank: 3,
    name: 'Ginger',
    views: '2,984 views',
    percentage: 66,
    thumbnail: <GingerThumbnail />,
  },
  {
    rank: 4,
    name: 'Paracetamol',
    views: '2,410 views',
    percentage: 64,
    thumbnail: <ParacetamolThumbnail />,
  },
  {
    rank: 5,
    name: 'Turmeric',
    views: '2,315 views',
    percentage: 61,
    thumbnail: <TurmericThumbnail />,
  },
];

const CATEGORY_DISTRIBUTION = [
  { name: 'Herbs', percentage: 28, color: '#094B27' },
  { name: 'Allopathic', percentage: 22, color: '#10B981' },
  { name: 'Ayurveda', percentage: 15, color: '#34D399' },
  { name: 'Homeopathy', percentage: 12, color: '#0D9488' },
  { name: 'Supplements', percentage: 8, color: '#6EE7B7' },
  { name: 'Others', percentage: 15, color: '#9CA3AF' },
];

export default function AnalyticsRow() {
  const [timeRange, setTimeRange] = useState('Last 7 Days');
  const [isTimeDropdownOpen, setIsTimeDropdownOpen] = useState(false);

  // SVG Chart Data (Interpolated to match reference curve)
  const chartPoints = [
    { label: 'Sep 8', value: '650', x: 20, y: 130 },
    { label: 'Sep 9', value: '920', x: 68, y: 105 },
    { label: 'Sep 10', value: '810', x: 116, y: 115 },
    { label: 'Sep 11', value: '1,150', x: 164, y: 88 },
    { label: 'Sep 12', value: '1,380', x: 212, y: 68 },
    { label: 'Sep 13', value: '1,260', x: 260, y: 80 },
    { label: 'Sep 14', value: '1,450', x: 308, y: 62 },
    { label: 'Sep 15', value: '1,780', x: 356, y: 35 },
  ];

  const linePath =
    'M 20 130 C 45 118, 55 105, 68 105 C 85 105, 98 115, 116 115 C 138 115, 148 88, 164 88 C 182 88, 195 68, 212 68 C 230 68, 245 80, 260 80 C 278 80, 292 62, 308 62 C 326 62, 340 35, 356 35';
  const areaPath = `${linePath} L 356 160 L 20 160 Z`;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 sm:gap-4">
      {/* ============================================================== */}
      {/* 1. USER ACTIVITY (LINE CHART) - 5 Cols                          */}
      {/* ============================================================== */}
      <div className="lg:col-span-5 bg-white border border-[#E3ECE6] rounded-2xl p-4 sm:p-4.5 shadow-[0_1px_3px_rgba(0,0,0,0.03)] flex flex-col justify-between">
        {/* Header with Time Range Dropdown */}
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-gray-900 tracking-tight">User Activity</h3>

          {/* Time range dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsTimeDropdownOpen(!isTimeDropdownOpen)}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <span>{timeRange}</span>
              <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
            </button>

            {isTimeDropdownOpen && (
              <div className="absolute right-0 mt-1 w-32 rounded-xl bg-white border border-gray-100 shadow-lg p-1 z-30">
                {['Last 7 Days', 'Last 30 Days', 'This Month'].map((opt) => (
                  <button
                    key={opt}
                    onClick={() => {
                      setTimeRange(opt);
                      setIsTimeDropdownOpen(false);
                    }}
                    className="w-full text-left px-3 py-1.5 rounded-lg text-xs font-medium text-gray-700 hover:bg-emerald-50 hover:text-emerald-800"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* SVG Area Line Chart Container */}
        <div className="relative w-full h-40 pt-2">
          {/* Y Axis Grid Lines & Labels */}
          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none text-[10px] text-gray-400 pb-5">
            <div className="flex items-center">
              <span className="w-8 text-right pr-2">2,000</span>
              <div className="flex-1 h-[1px] bg-gray-100" />
            </div>
            <div className="flex items-center">
              <span className="w-8 text-right pr-2">1,500</span>
              <div className="flex-1 h-[1px] bg-gray-100" />
            </div>
            <div className="flex items-center">
              <span className="w-8 text-right pr-2">1,000</span>
              <div className="flex-1 h-[1px] bg-gray-100" />
            </div>
            <div className="flex items-center">
              <span className="w-8 text-right pr-2">500</span>
              <div className="flex-1 h-[1px] bg-gray-100" />
            </div>
            <div className="flex items-center">
              <span className="w-8 text-right pr-2">0</span>
              <div className="flex-1 h-[1px] bg-gray-200" />
            </div>
          </div>

          {/* SVG Line Canvas */}
          <div className="absolute inset-0 pl-8 pb-5">
            <svg
              viewBox="0 0 380 160"
              className="w-full h-full overflow-visible"
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="emeraldGradFlow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10B981" stopOpacity="0.30" />
                  <stop offset="100%" stopColor="#10B981" stopOpacity="0.02" />
                </linearGradient>
              </defs>

              {/* Shaded Area */}
              <path d={areaPath} fill="url(#emeraldGradFlow)" />

              {/* Connected Line */}
              <path
                d={linePath}
                fill="none"
                stroke="#10B981"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Data points */}
              {chartPoints.map((pt, idx) => (
                <circle
                  key={idx}
                  cx={pt.x}
                  cy={pt.y}
                  r={4}
                  fill="#10B981"
                  stroke="#FFFFFF"
                  strokeWidth="2"
                  className="transition-transform hover:scale-125"
                />
              ))}
            </svg>

            {/* X Axis Date Labels */}
            <div className="flex justify-between text-[10px] text-gray-400 mt-1 px-1">
              {chartPoints.map((pt) => (
                <span key={pt.label}>{pt.label}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 2. POPULAR REMEDIES - 4 Cols                                    */}
      {/* ============================================================== */}
      <div className="lg:col-span-4 bg-white border border-[#E3ECE6] rounded-2xl p-4 sm:p-4.5 shadow-[0_1px_3px_rgba(0,0,0,0.03)] flex flex-col justify-between">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-gray-900 tracking-tight">Popular Remedies</h3>
          <Link
            href="/remedies"
            className="text-xs font-semibold text-[#0E5832] hover:text-emerald-700 flex items-center gap-1 transition-colors"
          >
            <span>View All</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* 5 Ranked Remedies */}
        <div className="space-y-2">
          {POPULAR_REMEDIES.map((remedy) => (
            <div key={remedy.rank} className="flex items-center gap-2.5">
              {/* Rank number */}
              <span className="w-4 text-center text-xs font-semibold text-gray-400 shrink-0">
                {remedy.rank}
              </span>

              {/* Thumbnail */}
              <div className="shrink-0">{remedy.thumbnail}</div>

              {/* Title & View Count */}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-gray-900 truncate leading-tight">
                  {remedy.name}
                </p>
                <p className="text-[10px] text-gray-400 leading-tight mt-0.5">{remedy.views}</p>
              </div>

              {/* Progress Bar & Percentage */}
              <div className="flex items-center gap-2 w-28 shrink-0">
                <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#0E5832] transition-all duration-300"
                    style={{ width: `${remedy.percentage}%` }}
                  />
                </div>
                <span className="text-xs font-bold text-gray-800 w-8 text-right">
                  {remedy.percentage}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ============================================================== */}
      {/* 3. CATEGORY USAGE (DONUT CHART) - 3 Cols                        */}
      {/* ============================================================== */}
      <div className="lg:col-span-3 bg-white border border-[#E3ECE6] rounded-2xl p-4 sm:p-4.5 shadow-[0_1px_3px_rgba(0,0,0,0.03)] flex flex-col justify-between">
        {/* Header */}
        <div className="mb-2">
          <h3 className="text-sm font-bold text-gray-900 tracking-tight">Category Usage</h3>
        </div>

        {/* Donut Chart & Legend Row */}
        <div className="flex items-center justify-between gap-3 my-auto">
          {/* SVG Donut Chart */}
          <div className="relative w-28 h-28 sm:w-30 sm:h-30 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
              {/* 1. Herbs: 28% -> 66.85 */}
              <circle
                cx="50"
                cy="50"
                r="38"
                fill="none"
                stroke="#094B27"
                strokeWidth="15"
                strokeDasharray="66.85 238.76"
                strokeDashoffset="0"
              />
              {/* 2. Allopathic: 22% -> 52.52 */}
              <circle
                cx="50"
                cy="50"
                r="38"
                fill="none"
                stroke="#10B981"
                strokeWidth="15"
                strokeDasharray="52.52 238.76"
                strokeDashoffset="-66.85"
              />
              {/* 3. Ayurveda: 15% -> 35.81 */}
              <circle
                cx="50"
                cy="50"
                r="38"
                fill="none"
                stroke="#34D399"
                strokeWidth="15"
                strokeDasharray="35.81 238.76"
                strokeDashoffset="-119.37"
              />
              {/* 4. Homeopathy: 12% -> 28.65 */}
              <circle
                cx="50"
                cy="50"
                r="38"
                fill="none"
                stroke="#0D9488"
                strokeWidth="15"
                strokeDasharray="28.65 238.76"
                strokeDashoffset="-155.18"
              />
              {/* 5. Supplements: 8% -> 19.1 */}
              <circle
                cx="50"
                cy="50"
                r="38"
                fill="none"
                stroke="#6EE7B7"
                strokeWidth="15"
                strokeDasharray="19.1 238.76"
                strokeDashoffset="-183.83"
              />
              {/* 6. Others: 15% -> 35.81 */}
              <circle
                cx="50"
                cy="50"
                r="38"
                fill="none"
                stroke="#9CA3AF"
                strokeWidth="15"
                strokeDasharray="35.81 238.76"
                strokeDashoffset="-202.93"
              />
            </svg>

            {/* Donut Center Label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-sm font-black text-gray-900 leading-tight">18,420</span>
              <span className="text-[10px] text-gray-400 font-medium">Searches</span>
            </div>
          </div>

          {/* Color-Coded Category Legend */}
          <div className="grid grid-cols-1 gap-y-1.5 w-full text-xs">
            {CATEGORY_DISTRIBUTION.map((item) => (
              <div key={item.name} className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 truncate">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-[11px] font-medium text-gray-600 truncate">
                    {item.name}
                  </span>
                </div>
                <span className="text-[11px] font-bold text-gray-900 ml-1">
                  {item.percentage}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
