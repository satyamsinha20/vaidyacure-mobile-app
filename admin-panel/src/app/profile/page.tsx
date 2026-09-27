"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  User,
  Mail,
  Shield,
  Calendar,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import TopNav from "@/components/dashboard/TopNav";
import { authService, AdminUser } from "@/services/auth.service";
import { ROUTES } from "@/lib/constants";

export default function ProfilePage() {
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Profile Edit States
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [isProfileSaved, setIsProfileSaved] = useState(false);

  // Change Password States
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);

  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  useEffect(() => {
    const cachedUser = authService.getStoredUser();
    if (cachedUser) {
      setAdminUser(cachedUser);
      setName(cachedUser.name);
      setEmail(cachedUser.email);
    } else {
      setAdminUser({
        id: "admin_1",
        name: "Satyam Kumar Sinha",
        email: "admin@vaidyacure.com",
        role: "superadmin",
      });
      setName("Satyam Kumar Sinha");
      setEmail("admin@vaidyacure.com");
    }

    authService
      .getMe()
      .then((user) => {
        setAdminUser(user);
        setName(user.name);
        setEmail(user.email);
      })
      .catch(() => {});
  }, []);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminUser) {
      const updated = { ...adminUser, name, email };
      setAdminUser(updated);
      localStorage.setItem("vaidya_admin_user", JSON.stringify(updated));
      setIsProfileSaved(true);
      setTimeout(() => setIsProfileSaved(false), 3000);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");

    if (newPassword.length < 6) {
      setPasswordError("New password must be at least 6 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("New password and confirm password do not match.");
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const res = await authService.changePassword(currentPassword, newPassword);
      setPasswordSuccess(res.message || "Password updated successfully!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setPasswordError(err.message || "Failed to update password. Please check your current password.");
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  return (
    <div className="h-screen overflow-hidden bg-[#F3F7F5] flex flex-col text-gray-900 selection:bg-emerald-500/20">
      {/* Full-Width Top Navigation Bar */}
      <TopNav
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        adminUser={adminUser}
      />

      {/* Main Body Container (Sidebar below navbar + Content) */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        {/* Sidebar positioned under TopNav */}
        <Sidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          adminUser={adminUser}
        />

        {/* Profile Content Area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden lg:pl-64 transition-all duration-300">
          {/* Profile Content Body - Single Viewport Without Scroll */}
          <main className="flex-1 p-3 sm:p-4 lg:p-5 flex flex-col justify-between overflow-hidden max-w-[1240px] w-full mx-auto gap-3">
          {/* Header & Back Button */}
          <div className="flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <Link
                href={ROUTES.DASHBOARD}
                className="p-1.5 rounded-xl bg-white border border-gray-200 text-gray-600 hover:text-emerald-800 hover:border-emerald-300 transition-colors shadow-2xs"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
              </Link>
              <div>
                <h1 className="text-lg sm:text-xl font-black text-gray-900 tracking-tight leading-tight">
                  Admin Profile
                </h1>
                <p className="text-[11px] text-gray-500">
                  Manage personal details and account credentials
                </p>
              </div>
            </div>

            {/* Role Badge */}
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-2xs">
              {adminUser?.role === "superadmin" ? "Super Admin" : "Administrator"}
            </span>
          </div>

          {/* Profile Overview Card - Compact */}
          <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-[#E3ECE6] shadow-[0_1px_3px_rgba(0,0,0,0.03)] flex items-center gap-4 shrink-0">
            <div className="w-13 h-13 rounded-2xl bg-[#0D4D2B] text-white flex items-center justify-center text-xl font-black shadow-md shrink-0">
              {name ? name.charAt(0).toUpperCase() : "A"}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold text-gray-900 leading-tight truncate">
                {name || "Admin"}
              </h2>
              <p className="text-xs text-gray-500 mt-0.5 truncate">
                {email || "admin@vaidyacure.com"}
              </p>
              <div className="flex items-center gap-4 mt-1.5 text-[11px] text-gray-500">
                <div className="flex items-center gap-1">
                  <Shield className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Full Access Privileges</span>
                </div>
                <div className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Joined September 2026</span>
                </div>
              </div>
            </div>
          </div>

          {/* Two-Column Grid: Edit Profile & Change Password - Fit within Viewport */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 flex-1 min-h-0 items-stretch">
            {/* 1. Edit Information Form */}
            <div className="bg-white rounded-2xl p-4 border border-[#E3ECE6] shadow-[0_1px_3px_rgba(0,0,0,0.03)] flex flex-col justify-between">
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-gray-900 mb-0.5">
                  Edit Account Information
                </h3>
                <p className="text-[11px] text-gray-400 mb-3 pb-2 border-b border-gray-100">
                  Update public administrator name and contact email
                </p>

                {isProfileSaved && (
                  <div className="mb-2.5 p-2 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-xs font-semibold text-emerald-800">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Profile updated successfully!</span>
                  </div>
                )}

                <form onSubmit={handleSaveProfile} className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">
                      Full Name
                    </label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full h-8.5 pl-9 pr-3 rounded-xl bg-gray-50/80 border border-gray-200 focus:bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 text-xs text-gray-900 outline-none transition-all"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">
                      Email Address
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full h-8.5 pl-9 pr-3 rounded-xl bg-gray-50/80 border border-gray-200 focus:bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 text-xs text-gray-900 outline-none transition-all"
                        required
                      />
                    </div>
                  </div>

                  <div className="pt-1">
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-xl bg-[#0D4827] hover:bg-[#145C33] active:bg-[#09391E] text-white text-xs font-bold shadow-2xs transition-all cursor-pointer"
                    >
                      Save Changes
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {/* 2. Change Password Form */}
            <div className="bg-white rounded-2xl p-4 border border-[#E3ECE6] shadow-[0_1px_3px_rgba(0,0,0,0.03)] flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Lock className="w-3.5 h-3.5 text-emerald-700" />
                  <h3 className="text-xs sm:text-sm font-bold text-gray-900">
                    Change Password
                  </h3>
                </div>
                <p className="text-[11px] text-gray-400 mb-3 pb-2 border-b border-gray-100">
                  Ensure account security with a strong password
                </p>

                {passwordSuccess && (
                  <div className="mb-2.5 p-2 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-xs font-semibold text-emerald-800">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>{passwordSuccess}</span>
                  </div>
                )}

                {passwordError && (
                  <div className="mb-2.5 p-2 rounded-xl bg-rose-50 border border-rose-200 flex items-center gap-2 text-xs font-semibold text-rose-700">
                    <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    <span>{passwordError}</span>
                  </div>
                )}

                <form onSubmit={handleChangePassword} className="space-y-2.5">
                  {/* Current Password */}
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-0.5">
                      Current Password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      <input
                        type={showCurrentPass ? "text" : "password"}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="w-full h-8 pl-9 pr-9 rounded-xl bg-gray-50/80 border border-gray-200 focus:bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 text-xs text-gray-900 outline-none transition-all"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPass(!showCurrentPass)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 p-1"
                      >
                        {showCurrentPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* New Password */}
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-0.5">
                      New Password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      <input
                        type={showNewPass ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full h-8 pl-9 pr-9 rounded-xl bg-gray-50/80 border border-gray-200 focus:bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 text-xs text-gray-900 outline-none transition-all"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPass(!showNewPass)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 p-1"
                      >
                        {showNewPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Confirm New Password */}
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-0.5">
                      Confirm New Password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      <input
                        type={showConfirmPass ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full h-8 pl-9 pr-9 rounded-xl bg-gray-50/80 border border-gray-200 focus:bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 text-xs text-gray-900 outline-none transition-all"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPass(!showConfirmPass)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 p-1"
                      >
                        {showConfirmPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div className="pt-1">
                    <button
                      type="submit"
                      disabled={isUpdatingPassword}
                      className="px-4 py-2 rounded-xl bg-[#0D4827] hover:bg-[#145C33] active:bg-[#09391E] text-white text-xs font-bold shadow-2xs transition-all cursor-pointer disabled:opacity-60"
                    >
                      {isUpdatingPassword ? "Updating..." : "Update Password"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  </div>
);
}
