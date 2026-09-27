"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/dashboard/Sidebar";
import TopNav from "@/components/dashboard/TopNav";
import { authService, AdminUser } from "@/services/auth.service";
import { remedyService } from "@/services/remedy.service";
import { RemedyCategoryConfig } from "./RemedyCategoryView";
import {
  ArrowLeft,
  Plus,
  X,
  Upload,
  Image as ImageIcon,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Sparkles,
  Layers,
  MapPin,
  Clock,
  ShieldAlert,
  Beaker,
  Save,
  Check,
  CloudUpload,
  Loader2,
} from "lucide-react";

interface RemedyAddViewProps {
  config: RemedyCategoryConfig;
}

export default function RemedyAddView({ config }: RemedyAddViewProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);

  // Form State
  const [name, setName] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [precautions, setPrecautions] = useState("");
  const [dosage, setDosage] = useState("");
  const [preparation, setPreparation] = useState("");
  const [variety, setVariety] = useState("");
  const [habitat, setHabitat] = useState("");
  const [lifespan, setLifespan] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"Verified" | "Pending" | "Draft">("Draft");

  // Dynamic Tags: Symptoms
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [symptomInput, setSymptomInput] = useState("");

  // Dynamic Tags: Uses / Benefits
  const [uses, setUses] = useState<string[]>([]);
  const [useInput, setUseInput] = useState("");

  // Cloudinary Upload State
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<{
    text: string;
    type: "success" | "warning" | "error";
  } | null>(null);

  // Edit mode tracking
  const [editId, setEditId] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);

  // Submitting state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const cached = authService.getStoredUser();
    if (cached) setAdminUser(cached);
    authService
      .getMe()
      .then((u) => setAdminUser(u))
      .catch(() => {});
  }, []);

  // Load item if in edit mode (via query param ?id=... or ?editId=...)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const searchParams = new URLSearchParams(window.location.search);
    const id = searchParams.get("id") || searchParams.get("editId");
    if (!id) return;

    setEditId(id);
    setIsEditMode(true);

    const populate = (remedy: any) => {
      setName(remedy.name || "");
      setExcerpt(remedy.excerpt || "");
      setDescription(remedy.description || "");
      setImageUrl(remedy.imageUrl || "");
      setPrecautions(remedy.precautions || "");
      setDosage(remedy.dosage || "");
      setPreparation(remedy.preparation || "");
      setVariety(remedy.variety || "");
      setHabitat(remedy.habitat || "");
      setLifespan(remedy.lifespan || "");
      setNotes(remedy.notes || "");
      setStatus(remedy.status || "Draft");
      if (Array.isArray(remedy.symptoms)) {
        setSymptoms(remedy.symptoms);
      } else if (typeof remedy.symptoms === "string") {
        setSymptoms(remedy.symptoms ? [remedy.symptoms] : []);
      }
      if (Array.isArray(remedy.uses)) {
        setUses(remedy.uses);
      }
    };

    try {
      const storageKey = `vaidya_remedies_items_${config.slug}`;
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const items = JSON.parse(saved);
        const found = items.find((item: any) => item.id === id || item._id === id);
        if (found) {
          populate(found);
          return;
        }
      }
    } catch {}

    // Fallback fetch from MongoDB Backend API
    remedyService.getRemedies(config.slug).then((items) => {
      const found = items.find((item: any) => item.id === id || item._id === id);
      if (found) {
        populate(found);
      }
    });
  }, [config.slug]);

  // Handle image file upload to Cloudinary (folder: vaidyacure_app)
  const handleFileUpload = async (file: File) => {
    if (!file) return;

    // Show immediate local preview
    const localUrl = URL.createObjectURL(file);
    setImageUrl(localUrl);
    setIsUploadingImage(true);
    setUploadMessage({
      text: "Uploading to Cloudinary (folder: vaidyacure_app)...",
      type: "warning",
    });

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (res.ok && data.success && data.url) {
        setImageUrl(data.url);
        setUploadMessage({
          text: "Saved to Cloudinary (folder: vaidyacure_app)",
          type: "success",
        });
      } else {
        setUploadMessage({
          text:
            data.error ||
            "Cloudinary credentials pending in .env (local preview active)",
          type: "warning",
        });
      }
    } catch {
      setUploadMessage({
        text: "Cloudinary upload offline (local preview used)",
        type: "warning",
      });
    } finally {
      setIsUploadingImage(false);
    }
  };

  // Handle adding a symptom tag
  const handleAddSymptom = () => {
    const trimmed = symptomInput.trim();
    if (trimmed && !symptoms.includes(trimmed)) {
      setSymptoms([...symptoms, trimmed]);
      setSymptomInput("");
    }
  };

  const handleRemoveSymptom = (indexToRemove: number) => {
    setSymptoms(symptoms.filter((_, idx) => idx !== indexToRemove));
  };

  // Handle adding a use/benefit tag
  const handleAddUse = () => {
    const trimmed = useInput.trim();
    if (trimmed && !uses.includes(trimmed)) {
      setUses([...uses, trimmed]);
      setUseInput("");
    }
  };

  const handleRemoveUse = (indexToRemove: number) => {
    setUses(uses.filter((_, idx) => idx !== indexToRemove));
  };

  // Save or Update Remedy in localStorage and redirect back
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!name.trim()) {
      setErrorMsg("Please enter the name of the remedy/medicine.");
      return;
    }

    if (!description.trim()) {
      setErrorMsg("Please provide a description.");
      return;
    }

    setIsSubmitting(true);

    const today = new Date();
    const formattedDate = `${today.getDate().toString().padStart(2, "0")}/${(
      today.getMonth() + 1
    )
      .toString()
      .padStart(2, "0")}/${today.getFullYear()}`;

    const remedyPayload = {
      name: name.trim(),
      category: config.slug.toLowerCase(),
      excerpt: excerpt.trim(),
      description: description.trim(),
      imageUrl: imageUrl.trim(),
      symptoms: symptoms.length > 0 ? symptoms : ["General Wellness"],
      uses: uses,
      precautions: precautions.trim(),
      dosage: dosage.trim(),
      preparation: preparation.trim(),
      variety: variety.trim(),
      habitat: habitat.trim(),
      lifespan: lifespan.trim(),
      notes: notes.trim(),
      status: status,
      addedOn: formattedDate,
      addedBy: adminUser?.name || "Admin",
    };

    try {
      if (isEditMode && editId) {
        await remedyService.updateRemedy(editId, config.slug, remedyPayload);
      } else {
        await remedyService.createRemedy(config.slug, remedyPayload);
      }
    } catch (err) {
      console.error("Failed to save remedy:", err);
    }

    // Redirect back to the category listing page
    router.push(`/remedies/${config.slug}`);
  };

  return (
    <div className="h-screen overflow-hidden bg-[#F3F7F5] flex flex-col text-gray-900 selection:bg-emerald-500/20">
      {/* Top Navigation */}
      <TopNav
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        adminUser={adminUser}
      />

      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        {/* Sidebar */}
        <Sidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          adminUser={adminUser}
        />

        {/* Content Area - Fits 100% on Single Screen */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden lg:pl-64 transition-all duration-300">
          <main className="flex-1 p-3 sm:p-3.5 lg:p-4 overflow-hidden flex flex-col max-w-[1600px] w-full mx-auto gap-2.5 h-full min-h-0">
            {/* Header with Back, Title & Quick Actions */}
            <div className="flex items-center justify-between gap-3 shrink-0 pb-2 border-b border-gray-200/70">
              <div className="flex items-center gap-2.5 min-w-0">
                <Link
                  href={`/remedies/${config.slug}`}
                  className="p-1.5 rounded-xl bg-white border border-gray-200 text-gray-600 hover:text-emerald-800 hover:border-emerald-300 transition-colors shadow-2xs cursor-pointer shrink-0"
                  title={`Back to ${config.pluralName}`}
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                </Link>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[11px] text-gray-500 truncate">
                    <span className="font-semibold text-emerald-800">
                      Remedies &amp; Medicines
                    </span>
                    <span>&gt;</span>
                    <Link
                      href={`/remedies/${config.slug}`}
                      className="hover:text-emerald-700 transition-colors"
                    >
                      {config.title}
                    </Link>
                    <span>&gt;</span>
                    <span className="text-gray-600 font-medium">
                      {isEditMode
                        ? `Edit ${config.singularName}`
                        : `Add New ${config.singularName}`}
                    </span>
                  </div>
                  <h1 className="text-lg sm:text-xl font-extrabold text-[#111827] tracking-tight leading-tight truncate">
                    {isEditMode
                      ? `Edit ${name ? `"${name}"` : config.singularName}`
                      : `Add New ${config.singularName}`}
                  </h1>
                </div>
              </div>

              {/* Top Quick Actions */}
              <div className="flex items-center gap-2 shrink-0">
                <Link
                  href={`/remedies/${config.slug}`}
                  className="px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 bg-white border border-gray-200 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </Link>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="bg-[#063019] hover:bg-[#094625] active:bg-[#042413] text-white px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                >
                  {isEditMode ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Update {config.singularName}</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>Save {config.singularName}</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Error Message if any */}
            {errorMsg && (
              <div className="p-2 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs text-red-700 shrink-0">
                <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Single-Screen 3-Column Form Grid */}
            <form
              onSubmit={handleSubmit}
              className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 gap-2.5 overflow-hidden"
            >
              {/* COLUMN 1: Core Identification & Habitat */}
              <div className="bg-white rounded-2xl p-3 sm:p-3.5 border border-gray-200/80 shadow-2xs flex flex-col justify-between overflow-hidden">
                <div className="space-y-2.5 overflow-y-auto pr-0.5 scrollbar-none">
                  <div className="flex items-center gap-1.5 pb-1.5 border-b border-gray-100">
                    <FileText className="w-3.5 h-3.5 text-emerald-700" />
                    <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
                      Core Identification
                    </h2>
                  </div>

                  {/* Name */}
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-700 mb-0.5">
                      Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={`e.g. ${
                        config.slug === "herbs"
                          ? "Ashwagandha (Withania somnifera)"
                          : "Product / Medicine Name"
                      }`}
                      className="w-full px-2.5 py-1.5 text-xs font-medium text-gray-900 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-emerald-600 transition-colors"
                    />
                  </div>

                  {/* Short Excerpt */}
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-700 mb-0.5">
                      Short Excerpt (1-2 lines)
                    </label>
                    <input
                      type="text"
                      value={excerpt}
                      onChange={(e) => setExcerpt(e.target.value)}
                      placeholder="e.g. Powerful botanical adaptogen for stamina and soothing stress."
                      className="w-full px-2.5 py-1.5 text-xs text-gray-800 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-emerald-600 transition-colors"
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-700 mb-0.5">
                      Description &amp; Overview <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      required
                      rows={3}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Detailed pharmacological overview, mechanisms, and therapeutic properties..."
                      className="w-full px-2.5 py-1.5 text-xs text-gray-800 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-emerald-600 transition-colors resize-none"
                    />
                  </div>

                  {/* Variety & Habitat (Grid 2 cols) */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-700 mb-0.5 flex items-center gap-1">
                        <Layers className="w-3 h-3 text-emerald-700" />
                        <span>Variety / Forms</span>
                      </label>
                      <input
                        type="text"
                        value={variety}
                        onChange={(e) => setVariety(e.target.value)}
                        placeholder="e.g. Churna, Extract"
                        className="w-full px-2.5 py-1.5 text-xs text-gray-800 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-emerald-600 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-700 mb-0.5 flex items-center gap-1 truncate">
                        <MapPin className="w-3 h-3 text-emerald-700 shrink-0" />
                        <span>Habitat / Found</span>
                      </label>
                      <input
                        type="text"
                        value={habitat}
                        onChange={(e) => setHabitat(e.target.value)}
                        placeholder="e.g. India, Arid zones"
                        className="w-full px-2.5 py-1.5 text-xs text-gray-800 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-emerald-600 transition-colors"
                      />
                    </div>
                  </div>

                  {/* Lifespan / Shelf Life */}
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-700 mb-0.5 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-emerald-700" />
                      <span>Lifespan / Shelf Life</span>
                    </label>
                    <input
                      type="text"
                      value={lifespan}
                      onChange={(e) => setLifespan(e.target.value)}
                      placeholder="e.g. Perennial / 24 months shelf life"
                      className="w-full px-2.5 py-1.5 text-xs text-gray-800 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-emerald-600 transition-colors"
                    />
                  </div>
                </div>
              </div>

              {/* COLUMN 2: Clinical Indications & Usage */}
              <div className="bg-white rounded-2xl p-3 sm:p-3.5 border border-gray-200/80 shadow-2xs flex flex-col justify-between overflow-hidden">
                <div className="space-y-2.5 overflow-y-auto pr-0.5 scrollbar-none">
                  <div className="flex items-center gap-1.5 pb-1.5 border-b border-gray-100">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-700" />
                    <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
                      Symptoms, Uses &amp; Dosage
                    </h2>
                  </div>

                  {/* Symptoms Multi-Entry */}
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-700 mb-0.5">
                      Symptoms / Concerns (Multiple entries)
                    </label>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <input
                        type="text"
                        value={symptomInput}
                        onChange={(e) => setSymptomInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddSymptom();
                          }
                        }}
                        placeholder="Type symptom (e.g. Fever, Cough) & Enter"
                        className="flex-1 px-2.5 py-1.5 text-xs text-gray-800 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-emerald-600 transition-colors"
                      />
                      <button
                        type="button"
                        onClick={handleAddSymptom}
                        className="px-2.5 py-1.5 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 rounded-xl text-xs font-semibold flex items-center gap-0.5 border border-emerald-200/80 transition-colors cursor-pointer shrink-0"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add</span>
                      </button>
                    </div>

                    {/* Symptoms Tag Chips */}
                    <div className="flex flex-wrap gap-1 max-h-14 overflow-y-auto p-1.5 bg-gray-50/70 border border-gray-100 rounded-xl scrollbar-none">
                      {symptoms.length > 0 ? (
                        symptoms.map((sym, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold bg-white border border-emerald-200 text-emerald-900 shadow-2xs"
                          >
                            <span>{sym}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveSymptom(idx)}
                              className="text-gray-400 hover:text-red-500 cursor-pointer"
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </span>
                        ))
                      ) : (
                        <span className="text-[10.5px] text-gray-400 italic px-1">
                          No symptoms added yet. e.g. Cough × Fever ×
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Uses / Benefits Multi-Entry */}
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-700 mb-0.5">
                      Uses / Benefits (Multiple entries)
                    </label>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <input
                        type="text"
                        value={useInput}
                        onChange={(e) => setUseInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddUse();
                          }
                        }}
                        placeholder="Type benefit (e.g. Immunity Boost) & Enter"
                        className="flex-1 px-2.5 py-1.5 text-xs text-gray-800 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-emerald-600 transition-colors"
                      />
                      <button
                        type="button"
                        onClick={handleAddUse}
                        className="px-2.5 py-1.5 bg-blue-50 text-blue-800 hover:bg-blue-100 rounded-xl text-xs font-semibold flex items-center gap-0.5 border border-blue-200/80 transition-colors cursor-pointer shrink-0"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add</span>
                      </button>
                    </div>

                    {/* Uses Tag Chips */}
                    <div className="flex flex-wrap gap-1 max-h-14 overflow-y-auto p-1.5 bg-gray-50/70 border border-gray-100 rounded-xl scrollbar-none">
                      {uses.length > 0 ? (
                        uses.map((use, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold bg-white border border-blue-200 text-blue-900 shadow-2xs"
                          >
                            <span>{use}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveUse(idx)}
                              className="text-gray-400 hover:text-red-500 cursor-pointer"
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </span>
                        ))
                      ) : (
                        <span className="text-[10.5px] text-gray-400 italic px-1">
                          No benefits added yet. e.g. Immunity × Sleep ×
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Dosage & Preparation (Grid 2 cols) */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-700 mb-0.5 flex items-center gap-1">
                        <Beaker className="w-3 h-3 text-emerald-700" />
                        <span>Dosage / Usage</span>
                      </label>
                      <input
                        type="text"
                        value={dosage}
                        onChange={(e) => setDosage(e.target.value)}
                        placeholder="e.g. 500mg twice daily"
                        className="w-full px-2.5 py-1.5 text-xs text-gray-800 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-emerald-600 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-700 mb-0.5 truncate">
                        Preparation Method
                      </label>
                      <input
                        type="text"
                        value={preparation}
                        onChange={(e) => setPreparation(e.target.value)}
                        placeholder="e.g. Powder, Decoction"
                        className="w-full px-2.5 py-1.5 text-xs text-gray-800 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-emerald-600 transition-colors"
                      />
                    </div>
                  </div>

                  {/* Precautions */}
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-700 mb-0.5 flex items-center gap-1">
                      <ShieldAlert className="w-3 h-3 text-amber-600" />
                      <span>Precautions &amp; Contraindications</span>
                    </label>
                    <textarea
                      rows={2}
                      value={precautions}
                      onChange={(e) => setPrecautions(e.target.value)}
                      placeholder="e.g. Avoid during pregnancy; consult doctor if on thyroid medication..."
                      className="w-full px-2.5 py-1.5 text-xs text-gray-800 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-emerald-600 transition-colors resize-none"
                    />
                  </div>
                </div>
              </div>

              {/* COLUMN 3: Media (Cloudinary), Status & Notes */}
              <div className="bg-white rounded-2xl p-3 sm:p-3.5 border border-gray-200/80 shadow-2xs flex flex-col justify-between overflow-hidden">
                <div className="space-y-2.5 overflow-y-auto pr-0.5 scrollbar-none">
                  <div className="flex items-center justify-between pb-1.5 border-b border-gray-100">
                    <div className="flex items-center gap-1.5">
                      <CloudUpload className="w-3.5 h-3.5 text-emerald-700" />
                      <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
                        Image &amp; Cloudinary
                      </h2>
                    </div>
                    <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/60">
                      folder: vaidyacure_app
                    </span>
                  </div>

                  {/* Cloudinary File Upload / URL Input */}
                  <div>
                    <div className="flex items-center justify-between mb-0.5">
                      <label className="text-[11px] font-semibold text-gray-700">
                        Upload Image
                      </label>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-[10.5px] font-bold text-emerald-800 hover:text-emerald-950 underline cursor-pointer"
                      >
                        Browse File
                      </button>
                    </div>

                    {/* Hidden Native File Input */}
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(file);
                      }}
                      className="hidden"
                    />

                    {/* Image URL Input */}
                    <input
                      type="url"
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      placeholder="Or paste Cloudinary image URL..."
                      className="w-full px-2.5 py-1.5 text-xs text-gray-800 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-emerald-600 transition-colors mb-1.5"
                    />

                    {/* Interactive Dropzone / Preview Box */}
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="rounded-xl border border-dashed border-gray-300 hover:border-emerald-500 bg-gray-50/70 hover:bg-emerald-50/20 transition-all p-2 flex flex-col items-center justify-center text-center h-22 overflow-hidden relative cursor-pointer group"
                    >
                      {isUploadingImage ? (
                        <div className="flex flex-col items-center gap-1 text-emerald-800">
                          <Loader2 className="w-5 h-5 animate-spin text-emerald-700" />
                          <span className="text-[10.5px] font-semibold">
                            Uploading to Cloudinary...
                          </span>
                        </div>
                      ) : imageUrl ? (
                        <div className="relative w-full h-full rounded-lg overflow-hidden">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={imageUrl}
                            alt="Preview"
                            className="w-full h-full object-cover rounded-lg"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = "none";
                            }}
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[11px] font-semibold">
                            Click to change image
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-0.5 text-gray-400 group-hover:text-emerald-700 transition-colors">
                          <Upload className="w-4 h-4 text-emerald-600" />
                          <span className="text-[11px] text-gray-700 font-semibold">
                            Click or Drag Image Here
                          </span>
                          <span className="text-[10px] text-gray-400">
                            Auto-saves to Cloudinary (vaidyacure_app)
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Upload status message */}
                    {uploadMessage && (
                      <p
                        className={`text-[10px] mt-1 font-semibold leading-tight ${
                          uploadMessage.type === "success"
                            ? "text-emerald-700"
                            : uploadMessage.type === "warning"
                            ? "text-amber-700"
                            : "text-red-600"
                        }`}
                      >
                        {uploadMessage.text}
                      </p>
                    )}
                  </div>

                  {/* Verification Status Pills */}
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                      Verification Status
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        {
                          val: "Draft",
                          label: "Draft",
                          activeBg: "bg-gray-100 border-gray-400 text-gray-800",
                        },
                        {
                          val: "Pending",
                          label: "Pending",
                          activeBg: "bg-amber-50 border-amber-400 text-amber-900",
                        },
                        {
                          val: "Verified",
                          label: "Verified",
                          activeBg: "bg-emerald-50 border-emerald-500 text-emerald-900",
                        },
                      ].map((opt) => (
                        <button
                          key={opt.val}
                          type="button"
                          onClick={() =>
                            setStatus(opt.val as "Verified" | "Pending" | "Draft")
                          }
                          className={`py-1.5 px-2 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer flex items-center justify-center gap-1 ${
                            status === opt.val
                              ? `${opt.activeBg} shadow-2xs font-extrabold ring-1 ring-emerald-500/20`
                              : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                          }`}
                        >
                          {status === opt.val && <Check className="w-3 h-3" />}
                          <span>{opt.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Additional Notes */}
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-700 mb-0.5">
                      Additional Notes
                    </label>
                    <textarea
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Classical references, clinical footnotes, or special remarks..."
                      className="w-full px-2.5 py-1.5 text-xs text-gray-800 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-emerald-600 transition-colors resize-none"
                    />
                  </div>
                </div>

                {/* Bottom Card Action */}
                <div className="pt-2 border-t border-gray-100 flex flex-col gap-1.5">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-[#063019] hover:bg-[#094625] active:bg-[#042413] text-white py-2 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isEditMode ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Update {config.singularName}</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5" />
                        <span>+ Add {config.singularName}</span>
                      </>
                    )}
                  </button>
                  <Link
                    href={`/remedies/${config.slug}`}
                    className="text-center text-[11px] text-gray-400 hover:text-gray-700"
                  >
                    Discard and return to list
                  </Link>
                </div>
              </div>
            </form>
          </main>
        </div>
      </div>
    </div>
  );
}
