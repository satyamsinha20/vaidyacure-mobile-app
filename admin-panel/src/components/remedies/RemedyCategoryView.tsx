"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import Sidebar from "@/components/dashboard/Sidebar";
import TopNav from "@/components/dashboard/TopNav";
import { authService, AdminUser } from "@/services/auth.service";
import { remedyService } from "@/services/remedy.service";
import {
  Sprout,
  CheckCircle2,
  Clock,
  FileText,
  Search,
  Calendar,
  ChevronDown,
  Plus,
  X,
  Trash2,
  Check,
  Eye,
  Edit3,
  MapPin,
  AlertTriangle,
  Beaker,
  Sparkles,
  Layers,
} from "lucide-react";

export interface RemedyCategoryConfig {
  slug: string;
  title: string;
  singularName: string;
  pluralName: string;
  subtitle: string;
}

export interface RemedyItem {
  id: string;
  name: string;
  category?: string;
  excerpt?: string;
  description?: string;
  imageUrl?: string;
  symptoms: string[] | string;
  uses?: string[];
  precautions?: string;
  dosage?: string;
  preparation?: string;
  variety?: string;
  habitat?: string;
  lifespan?: string;
  notes?: string;
  status: "Verified" | "Pending" | "Draft";
  addedOn: string;
  addedBy: string;
}

interface RemedyCategoryViewProps {
  config: RemedyCategoryConfig;
}

export default function RemedyCategoryView({ config }: RemedyCategoryViewProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [items, setItems] = useState<RemedyItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // View Details Modal state
  const [selectedViewItem, setSelectedViewItem] = useState<RemedyItem | null>(null);

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All Status");
  const [symptomFilter, setSymptomFilter] = useState("All Symptoms");
  const [dateFilter, setDateFilter] = useState("Added On");

  // Dropdown open states
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [isSymptomsDropdownOpen, setIsSymptomsDropdownOpen] = useState(false);
  const [isDateDropdownOpen, setIsDateDropdownOpen] = useState(false);

  // Close view modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedViewItem(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Load admin user & shared remedies for this category from backend
  useEffect(() => {
    const cached = authService.getStoredUser();
    if (cached) setAdminUser(cached);
    authService
      .getMe()
      .then((u) => setAdminUser(u))
      .catch(() => {});

    // 1. Instant load from local cache if available
    try {
      const storageKey = `vaidya_remedies_items_${config.slug}`;
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        setItems(JSON.parse(saved));
      }
    } catch {}

    // 2. Fetch live shared catalog from MongoDB Backend (syncs across SuperAdmin, Moderator, Editor)
    remedyService
      .getRemedies(config.slug)
      .then((data) => {
        setItems(data);
        setIsLoaded(true);
      })
      .catch(() => {
        setIsLoaded(true);
      });
  }, [config.slug]);

  // Persist items on change
  const saveItems = (newItems: RemedyItem[]) => {
    setItems(newItems);
    try {
      const storageKey = `vaidya_remedies_items_${config.slug}`;
      localStorage.setItem(storageKey, JSON.stringify(newItems));
    } catch {}
  };

  const handleDeleteItem = async (id: string, name?: string) => {
    if (window.confirm(`Are you sure you want to delete ${name ? `"${name}"` : "this item"}?`)) {
      setItems((prev) => prev.filter((item) => item.id !== id));
      if (selectedViewItem && selectedViewItem.id === id) {
        setSelectedViewItem(null);
      }
      await remedyService.deleteRemedy(id, config.slug);
    }
  };

  // Metrics computation
  const totalCount = items.length;
  const verifiedCount = items.filter((i) => i.status === "Verified").length;
  const pendingCount = items.filter((i) => i.status === "Pending").length;
  const draftCount = items.filter((i) => i.status === "Draft").length;

  // Filtered items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const symptomsStr = Array.isArray(item.symptoms)
        ? item.symptoms.join(" ")
        : item.symptoms || "";

      const matchesSearch =
        !searchQuery.trim() ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
        symptomsStr.toLowerCase().includes(searchQuery.toLowerCase().trim());

      const matchesStatus =
        statusFilter === "All Status" || item.status === statusFilter;

      const matchesSymptom =
        symptomFilter === "All Symptoms" ||
        symptomsStr.toLowerCase().includes(symptomFilter.toLowerCase());

      return matchesSearch && matchesStatus && matchesSymptom;
    });
  }, [items, searchQuery, statusFilter, symptomFilter]);

  // Unique symptoms list for filter dropdown
  const uniqueSymptoms = useMemo(() => {
    const list = new Set<string>();
    items.forEach((item) => {
      if (Array.isArray(item.symptoms)) {
        item.symptoms.forEach((s) => list.add(s.trim()));
      } else if (typeof item.symptoms === "string") {
        item.symptoms
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .forEach((s) => list.add(s));
      }
    });
    return Array.from(list);
  }, [items]);

  return (
    <div className="h-screen overflow-hidden bg-[#F3F7F5] flex flex-col text-gray-900 selection:bg-emerald-500/20">
      {/* Top Navigation */}
      <TopNav
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        adminUser={adminUser}
      />

      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        {/* Sidebar with active category tree */}
        <Sidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          adminUser={adminUser}
        />

        {/* Content Area */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden lg:pl-64 transition-all duration-300">
          <main className="flex-1 p-3 sm:p-4 lg:p-4.5 overflow-hidden flex flex-col max-w-[1520px] w-full mx-auto gap-2.5 sm:gap-3 h-full min-h-0">
            {/* Header with Breadcrumb & Nature Heals Better Calligraphy */}
            <div className="flex items-start justify-between gap-4 shrink-0">
              <div>
                <div className="flex items-center gap-1.5 text-xs mb-0.5">
                  <span className="font-semibold text-emerald-800">
                    Remedies &amp; Medicines
                  </span>
                  <span className="text-gray-400">&gt;</span>
                  <span className="text-gray-500 font-medium">
                    {config.title}
                  </span>
                </div>
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-[#111827] tracking-tight">
                  {config.title}
                </h1>
                <p className="text-xs text-gray-500 mt-0.5">
                  {config.subtitle}
                </p>
              </div>

              {/* Botanical Watermark Slogan: "Nature Heals Better" */}
              <div className="hidden sm:flex items-center gap-2 select-none pointer-events-none pr-1">
                <div className="text-right">
                  <span
                    style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
                    className="block text-lg sm:text-xl italic font-bold text-[#14532D] leading-tight"
                  >
                    Nature
                  </span>
                  <span
                    style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
                    className="block text-base sm:text-lg italic font-bold text-[#15803D] leading-tight"
                  >
                    Heals Better
                  </span>
                </div>
                {/* Botanical leaves SVG */}
                <svg
                  width="40"
                  height="40"
                  viewBox="0 0 64 64"
                  fill="none"
                  className="shrink-0 drop-shadow-xs"
                >
                  <path
                    d="M12 52 C24 40, 36 28, 52 12"
                    stroke="#16A34A"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                  <path
                    d="M52 12 C50 6, 42 4, 38 10 C34 16, 46 16, 52 12 Z"
                    fill="#22C55E"
                    opacity="0.85"
                  />
                  <path
                    d="M38 26 C33 21, 26 21, 24 28 C22 35, 33 33, 38 26 Z"
                    fill="#16A34A"
                    opacity="0.8"
                  />
                  <path
                    d="M46 18 C52 20, 56 26, 51 30 C46 34, 43 24, 46 18 Z"
                    fill="#86EFAC"
                    opacity="0.9"
                  />
                  <path
                    d="M26 38 C20 35, 14 37, 14 43 C14 49, 23 45, 26 38 Z"
                    fill="#22C55E"
                    opacity="0.75"
                  />
                  <path
                    d="M32 32 C37 36, 40 42, 35 45 C30 48, 29 38, 32 32 Z"
                    fill="#86EFAC"
                    opacity="0.8"
                  />
                </svg>
              </div>
            </div>

            {/* 4 Metric Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 shrink-0">
              {/* Card 1: Total */}
              <div className="bg-[#E8F8F0]/30 border border-[#D5EFE1] rounded-2xl p-3 sm:p-3.5 flex items-center gap-3 shadow-2xs">
                <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-[#CEF2DC] text-[#136C3D] flex items-center justify-center shrink-0">
                  <Sprout className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-700">
                    Total {config.pluralName}
                  </p>
                  <p className="text-xl sm:text-2xl font-extrabold text-gray-900 leading-tight">
                    {totalCount}
                  </p>
                  <p className="text-[10.5px] text-gray-400">
                    All {config.pluralName.toLowerCase()} in database
                  </p>
                </div>
              </div>

              {/* Card 2: Verified */}
              <div className="bg-[#E8F8F0]/30 border border-[#D5EFE1] rounded-2xl p-3 sm:p-3.5 flex items-center gap-3 shadow-2xs">
                <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-[#CEF2DC] text-[#136C3D] flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-700">
                    Verified {config.pluralName}
                  </p>
                  <p className="text-xl sm:text-2xl font-extrabold text-gray-900 leading-tight">
                    {verifiedCount}
                  </p>
                  <p className="text-[10.5px] text-gray-400">Approved and live</p>
                </div>
              </div>

              {/* Card 3: Pending */}
              <div className="bg-[#FFFDF3] border border-[#FDE5B3] rounded-2xl p-3 sm:p-3.5 flex items-center gap-3 shadow-2xs">
                <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-[#FEE8B7] text-[#D97706] flex items-center justify-center shrink-0">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-700">
                    Pending {config.pluralName}
                  </p>
                  <p className="text-xl sm:text-2xl font-extrabold text-gray-900 leading-tight">
                    {pendingCount}
                  </p>
                  <p className="text-[10.5px] text-gray-400">Awaiting verification</p>
                </div>
              </div>

              {/* Card 4: Draft */}
              <div className="bg-[#F5F9FF] border border-[#D6E5FD] rounded-2xl p-3 sm:p-3.5 flex items-center gap-3 shadow-2xs">
                <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-[#D7E6FD] text-[#2563EB] flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-700">
                    Draft {config.pluralName}
                  </p>
                  <p className="text-xl sm:text-2xl font-extrabold text-gray-900 leading-tight">
                    {draftCount}
                  </p>
                  <p className="text-[10.5px] text-gray-400">Saved as draft</p>
                </div>
              </div>
            </div>

            {/* Filter & Action Bar */}
            <div className="bg-white rounded-2xl p-2 sm:p-2.5 border border-gray-200/80 shadow-2xs flex flex-wrap items-center justify-between gap-2.5 shrink-0">
              {/* Left Filters */}
              <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
                {/* Search Input */}
                <div className="relative w-full sm:w-60 md:w-68">
                  <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={`Search ${config.pluralName.toLowerCase()} by name...`}
                    className="w-full pl-8.5 pr-3 py-1.5 text-xs text-gray-800 placeholder:text-gray-400 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-emerald-600 transition-colors"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Dropdown 1: All Status */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setIsStatusDropdownOpen(!isStatusDropdownOpen);
                      setIsSymptomsDropdownOpen(false);
                      setIsDateDropdownOpen(false);
                    }}
                    className="px-2.5 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-xl flex items-center gap-1.5 hover:border-gray-300 transition-colors cursor-pointer"
                  >
                    <span>{statusFilter}</span>
                    <ChevronDown className="w-3 h-3 text-gray-500" />
                  </button>

                  {isStatusDropdownOpen && (
                    <div className="absolute left-0 mt-1 w-36 bg-white border border-gray-200 rounded-xl shadow-lg py-1 z-20">
                      {["All Status", "Verified", "Pending", "Draft"].map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => {
                            setStatusFilter(st);
                            setIsStatusDropdownOpen(false);
                          }}
                          className={`w-full px-3 py-1.5 text-left text-xs flex items-center justify-between ${
                            statusFilter === st
                              ? "font-semibold text-emerald-800 bg-emerald-50"
                              : "text-gray-700 hover:bg-gray-50"
                          }`}
                        >
                          <span>{st}</span>
                          {statusFilter === st && (
                            <Check className="w-3.5 h-3.5 text-emerald-700" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Dropdown 2: All Symptoms */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setIsSymptomsDropdownOpen(!isSymptomsDropdownOpen);
                      setIsStatusDropdownOpen(false);
                      setIsDateDropdownOpen(false);
                    }}
                    className="px-2.5 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-xl flex items-center gap-1.5 hover:border-gray-300 transition-colors cursor-pointer"
                  >
                    <span>{symptomFilter}</span>
                    <ChevronDown className="w-3 h-3 text-gray-500" />
                  </button>

                  {isSymptomsDropdownOpen && (
                    <div className="absolute left-0 mt-1 w-44 bg-white border border-gray-200 rounded-xl shadow-lg py-1 z-20 max-h-48 overflow-y-auto">
                      <button
                        type="button"
                        onClick={() => {
                          setSymptomFilter("All Symptoms");
                          setIsSymptomsDropdownOpen(false);
                        }}
                        className={`w-full px-3 py-1.5 text-left text-xs ${
                          symptomFilter === "All Symptoms"
                            ? "font-semibold text-emerald-800 bg-emerald-50"
                            : "text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        All Symptoms
                      </button>
                      {uniqueSymptoms.map((sym) => (
                        <button
                          key={sym}
                          type="button"
                          onClick={() => {
                            setSymptomFilter(sym);
                            setIsSymptomsDropdownOpen(false);
                          }}
                          className={`w-full px-3 py-1.5 text-left text-xs truncate ${
                            symptomFilter === sym
                              ? "font-semibold text-emerald-800 bg-emerald-50"
                              : "text-gray-700 hover:bg-gray-50"
                          }`}
                        >
                          {sym}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Dropdown 3: Added On */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setIsDateDropdownOpen(!isDateDropdownOpen);
                      setIsStatusDropdownOpen(false);
                      setIsSymptomsDropdownOpen(false);
                    }}
                    className="px-2.5 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-xl flex items-center gap-1.5 hover:border-gray-300 transition-colors cursor-pointer"
                  >
                    <Calendar className="w-3 h-3 text-gray-500" />
                    <span>{dateFilter}</span>
                    <ChevronDown className="w-3 h-3 text-gray-500" />
                  </button>

                  {isDateDropdownOpen && (
                    <div className="absolute left-0 mt-1 w-40 bg-white border border-gray-200 rounded-xl shadow-lg py-1 z-20">
                      {["Added On", "Newest First", "Oldest First"].map((df) => (
                        <button
                          key={df}
                          type="button"
                          onClick={() => {
                            setDateFilter(df);
                            setIsDateDropdownOpen(false);
                          }}
                          className={`w-full px-3 py-1.5 text-left text-xs ${
                            dateFilter === df
                              ? "font-semibold text-emerald-800 bg-emerald-50"
                              : "text-gray-700 hover:bg-gray-50"
                          }`}
                        >
                          {df}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Right Action Button: Navigates to dedicated Add Page */}
              <Link
                href={`/remedies/${config.slug}/new`}
                className="bg-[#063019] hover:bg-[#094625] active:bg-[#042413] text-white px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Add New {config.singularName}</span>
              </Link>
            </div>

            {/* Table or Empty State Container */}
            <div className="flex-1 min-h-0 bg-white rounded-2xl border border-gray-200/80 shadow-2xs overflow-hidden flex flex-col">
              {/* Table Header */}
              <div className="shrink-0 bg-[#F9FAFB] border-b border-gray-200/80 px-4 py-2 text-xs font-semibold text-gray-600 grid grid-cols-12 items-center gap-2">
                <div className="col-span-1 flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  />
                  <span className="text-gray-400">#</span>
                </div>
                <div className="col-span-1">Image</div>
                <div className="col-span-2">Name</div>
                <div className="col-span-3">Symptoms</div>
                <div className="col-span-1">Status</div>
                <div className="col-span-1">Added On</div>
                <div className="col-span-1">Added By</div>
                <div className="col-span-2 text-right pr-2">Actions</div>
              </div>

              {/* Table Body or Empty State */}
              {/* Show cached items instantly; live API data replaces them when it arrives */}
              {filteredItems.length > 0 ? (
                <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-gray-100">
                  {filteredItems.map((item, idx) => {
                    const displaySymptoms = Array.isArray(item.symptoms)
                      ? item.symptoms.join(", ")
                      : item.symptoms;

                    return (
                      <div
                        key={item.id}
                        className="px-4 py-2 text-xs text-gray-700 grid grid-cols-12 items-center gap-2 hover:bg-gray-50/70 transition-colors"
                      >
                        <div className="col-span-1 flex items-center gap-2">
                          <input
                            type="checkbox"
                            className="rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                          />
                          <span className="text-gray-400 font-mono text-[11px]">
                            {idx + 1}
                          </span>
                        </div>
                        {/* 16:9 Thumbnail Image */}
                        <div className="col-span-1 flex items-center">
                          <div
                            onClick={() => setSelectedViewItem(item)}
                            className="w-14 aspect-video rounded-lg overflow-hidden bg-emerald-50/60 border border-gray-200/80 shrink-0 flex items-center justify-center shadow-2xs cursor-pointer group hover:border-emerald-400 hover:shadow-xs transition-all"
                            title={`View ${item.name}`}
                          >
                            {item.imageUrl ? (
                              <img
                                src={item.imageUrl}
                                alt={item.name}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                              />
                            ) : (
                              <div className="flex items-center justify-center w-full h-full bg-gradient-to-br from-[#EBF8F0] to-[#DDF5E6]">
                                <Sprout className="w-3.5 h-3.5 text-[#0D7A46]" />
                              </div>
                            )}
                          </div>
                        </div>
                        <div
                          onClick={() => setSelectedViewItem(item)}
                          className="col-span-2 font-semibold text-gray-900 truncate hover:text-emerald-700 transition-colors cursor-pointer"
                          title={item.name}
                        >
                          {item.name}
                        </div>
                        <div className="col-span-3 text-gray-600 truncate">
                          {displaySymptoms}
                        </div>
                        <div className="col-span-1">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-bold ${
                              item.status === "Verified"
                                ? "bg-emerald-100 text-emerald-800"
                                : item.status === "Pending"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-gray-100 text-gray-700"
                            }`}
                          >
                            {item.status}
                          </span>
                        </div>
                        <div className="col-span-1 text-gray-500 text-[11px]">
                          {item.addedOn}
                        </div>
                        <div className="col-span-1 text-gray-600 truncate text-[11px]">
                          {item.addedBy}
                        </div>
                        <div className="col-span-2 flex items-center justify-end gap-1 text-right pr-1">
                          {/* View Button */}
                          <button
                            type="button"
                            onClick={() => setSelectedViewItem(item)}
                            className="p-1.5 rounded-lg text-gray-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer"
                            title={`View ${item.name} details`}
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          {/* Edit Button */}
                          <Link
                            href={`/remedies/${config.slug}/edit?id=${item.id}`}
                            className="p-1.5 rounded-lg text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                            title={`Edit ${item.name}`}
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </Link>
                          {/* Delete Button */}
                          <button
                            type="button"
                            onClick={() => handleDeleteItem(item.id, item.name)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                            title={`Delete ${item.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : !isLoaded ? (
                /* First load with no cache: show a loader instead of a false "No items found" */
                <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-4 text-center">
                  <div className="w-8 h-8 rounded-full border-[3px] border-[#EBF8F0] border-t-[#063019] animate-spin mb-3" />
                  <p className="text-xs sm:text-[13px] text-gray-500">
                    Loading {config.pluralName.toLowerCase()}...
                  </p>
                </div>
              ) : (
                /* Empty State Matching Screenshot */
                <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-4 text-center">
                  {/* Sprout Illustration with Sparkles */}
                  <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-[#EBF8F0] flex items-center justify-center relative mx-auto mb-2.5 shrink-0">
                    <svg
                      width="46"
                      height="46"
                      viewBox="0 0 64 64"
                      fill="none"
                      className="drop-shadow-xs"
                    >
                      {/* Stem */}
                      <path
                        d="M32 50 C32 40, 32 30, 32 24"
                        stroke="#0D7A46"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                      />
                      {/* Left Leaf */}
                      <path
                        d="M32 26 C24 26, 16 18, 18 12 C24 10, 32 18, 32 26 Z"
                        fill="#0D7A46"
                      />
                      {/* Right Leaf */}
                      <path
                        d="M32 26 C40 26, 48 18, 46 12 C40 10, 32 18, 32 26 Z"
                        fill="#0D7A46"
                      />
                      {/* Sparkle Left */}
                      <path
                        d="M17 33 L17 37 M15 35 L19 35"
                        stroke="#86EFAC"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                      {/* Sparkle Right */}
                      <path
                        d="M48 24 L48 30 M45 27 L51 27"
                        stroke="#34D399"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>

                  {/* Heading */}
                  <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-1">
                    No {config.pluralName.toLowerCase()} found
                  </h3>

                  {/* Subtitle */}
                  <p className="text-xs sm:text-[13px] text-gray-500 max-w-md mx-auto mb-3.5 leading-relaxed">
                    You haven't added any {config.pluralName.toLowerCase()} yet.
                    Start building your {config.singularName.toLowerCase()}{" "}
                    library by adding your first {config.singularName.toLowerCase()}
                    .
                  </p>

                  {/* Navigates to dedicated Add Page */}
                  <Link
                    href={`/remedies/${config.slug}/new`}
                    className="bg-[#063019] hover:bg-[#094625] active:bg-[#042413] text-white px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Add New {config.singularName}</span>
                  </Link>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>

      {/* View Details Modal */}
      {selectedViewItem && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
          onClick={() => setSelectedViewItem(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-gray-200/90 max-w-3xl w-full max-h-[88vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between gap-3 bg-[#F9FAFB] shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-[#EBF8F0] text-[#0D7A46] flex items-center justify-center font-bold text-sm shrink-0 border border-emerald-200/60">
                  <Sprout className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base sm:text-lg font-bold text-gray-900 truncate">
                      {selectedViewItem.name}
                    </h2>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-bold shrink-0 ${
                        selectedViewItem.status === "Verified"
                          ? "bg-emerald-100 text-emerald-800"
                          : selectedViewItem.status === "Pending"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {selectedViewItem.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 truncate">
                    {config.singularName} Details • Added on {selectedViewItem.addedOn} by {selectedViewItem.addedBy}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/remedies/${config.slug}/edit?id=${selectedViewItem.id}`}
                  className="p-1.5 rounded-xl bg-white border border-gray-200 text-gray-700 hover:text-blue-600 hover:bg-blue-50 transition-colors flex items-center gap-1 text-xs font-semibold px-2.5 shadow-2xs"
                  title="Edit this item"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit</span>
                </Link>
                <button
                  type="button"
                  onClick={() => setSelectedViewItem(null)}
                  className="p-1.5 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
                  title="Close (Esc)"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Top Section: Image & Excerpt/Description */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                {/* Image */}
                <div className="md:col-span-1">
                  {selectedViewItem.imageUrl ? (
                    <div className="w-full aspect-4/3 rounded-xl overflow-hidden border border-gray-200 bg-gray-50 shadow-2xs">
                      <img
                        src={selectedViewItem.imageUrl}
                        alt={selectedViewItem.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-full aspect-4/3 rounded-xl border border-dashed border-gray-200 bg-[#EBF8F0] flex flex-col items-center justify-center text-[#0D7A46]">
                      <Sprout className="w-8 h-8 mb-1" />
                      <span className="text-[11px] font-medium text-gray-500">No Image Uploaded</span>
                    </div>
                  )}
                </div>

                {/* Excerpt & Description */}
                <div className="md:col-span-2 space-y-2.5">
                  {selectedViewItem.excerpt && (
                    <div className="p-2.5 bg-emerald-50/70 border border-emerald-100 rounded-xl text-xs text-emerald-950 font-medium leading-relaxed italic">
                      "{selectedViewItem.excerpt}"
                    </div>
                  )}
                  <div>
                    <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-1">
                      Description
                    </h4>
                    <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-line">
                      {selectedViewItem.description || "No description provided."}
                    </p>
                  </div>
                </div>
              </div>

              {/* Symptoms & Uses Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-gray-100">
                {/* Symptoms */}
                <div className="bg-gray-50/70 rounded-xl p-3 border border-gray-100">
                  <h4 className="text-xs font-bold text-gray-900 mb-2 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    Symptoms &amp; Conditions Treated
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {Array.isArray(selectedViewItem.symptoms) && selectedViewItem.symptoms.length > 0 ? (
                      selectedViewItem.symptoms.map((s, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[11px] font-medium"
                        >
                          {s}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-gray-400 italic">None specified</span>
                    )}
                  </div>
                </div>

                {/* Uses & Benefits */}
                <div className="bg-gray-50/70 rounded-xl p-3 border border-gray-100">
                  <h4 className="text-xs font-bold text-gray-900 mb-2 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                    Uses &amp; Key Benefits
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedViewItem.uses && selectedViewItem.uses.length > 0 ? (
                      selectedViewItem.uses.map((u, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100 text-[11px] font-medium"
                        >
                          {u}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-gray-400 italic">None specified</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Clinical / Dosage / Precautions */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-gray-100">
                {/* Dosage */}
                <div className="bg-gray-50/70 rounded-xl p-3 border border-gray-100">
                  <h4 className="text-xs font-bold text-gray-900 mb-1 flex items-center gap-1.5">
                    <Beaker className="w-3.5 h-3.5 text-emerald-600" />
                    Dosage &amp; Usage
                  </h4>
                  <p className="text-xs text-gray-700">
                    {selectedViewItem.dosage || <span className="text-gray-400 italic">Not specified</span>}
                  </p>
                </div>

                {/* Preparation */}
                <div className="bg-gray-50/70 rounded-xl p-3 border border-gray-100">
                  <h4 className="text-xs font-bold text-gray-900 mb-1 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-teal-600" />
                    Preparation Method
                  </h4>
                  <p className="text-xs text-gray-700">
                    {selectedViewItem.preparation || <span className="text-gray-400 italic">Not specified</span>}
                  </p>
                </div>

                {/* Precautions */}
                <div className="bg-amber-50/50 rounded-xl p-3 border border-amber-200/60">
                  <h4 className="text-xs font-bold text-amber-900 mb-1 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                    Precautions &amp; Safety
                  </h4>
                  <p className="text-xs text-amber-900">
                    {selectedViewItem.precautions || <span className="text-amber-700/60 italic">No specific warnings</span>}
                  </p>
                </div>
              </div>

              {/* Botanical / Product Attributes */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-gray-100">
                <div className="bg-gray-50/70 rounded-xl p-3 border border-gray-100">
                  <span className="text-[10.5px] font-semibold text-gray-500 block uppercase">Variety / Species</span>
                  <span className="text-xs font-semibold text-gray-800">
                    {selectedViewItem.variety || <span className="text-gray-400 italic font-normal">N/A</span>}
                  </span>
                </div>

                <div className="bg-gray-50/70 rounded-xl p-3 border border-gray-100">
                  <span className="text-[10.5px] font-semibold text-gray-500 block uppercase flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-emerald-600" />
                    Habitat / Kaha Paya Jata Hai
                  </span>
                  <span className="text-xs font-semibold text-gray-800">
                    {selectedViewItem.habitat || <span className="text-gray-400 italic font-normal">N/A</span>}
                  </span>
                </div>

                <div className="bg-gray-50/70 rounded-xl p-3 border border-gray-100">
                  <span className="text-[10.5px] font-semibold text-gray-500 block uppercase flex items-center gap-1">
                    <Clock className="w-3 h-3 text-emerald-600" />
                    Lifespan / Season
                  </span>
                  <span className="text-xs font-semibold text-gray-800">
                    {selectedViewItem.lifespan || <span className="text-gray-400 italic font-normal">N/A</span>}
                  </span>
                </div>
              </div>

              {/* Notes (if any) */}
              {selectedViewItem.notes && (
                <div className="bg-gray-50/70 rounded-xl p-3 border border-gray-100">
                  <span className="text-[10.5px] font-semibold text-gray-500 block uppercase mb-1">Additional Notes</span>
                  <p className="text-xs text-gray-700 whitespace-pre-line">{selectedViewItem.notes}</p>
                </div>
              )}
            </div>

            {/* Modal Footer Actions */}
            <div className="px-5 py-3 border-t border-gray-100 bg-[#F9FAFB] flex items-center justify-between gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleDeleteItem(selectedViewItem.id, selectedViewItem.name)}
                className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-xl transition-colors font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedViewItem(null)}
                  className="px-3.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 bg-white border border-gray-200 rounded-xl transition-colors cursor-pointer"
                >
                  Close
                </button>
                <Link
                  href={`/remedies/${config.slug}/edit?id=${selectedViewItem.id}`}
                  className="bg-[#063019] hover:bg-[#094625] text-white px-4 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit {config.singularName}</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
