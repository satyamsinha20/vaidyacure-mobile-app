"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Leaf,
} from "lucide-react";
import { authService } from "@/services/auth.service";
import { ROUTES } from "@/lib/constants";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get("redirect") || ROUTES.DASHBOARD;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  // Auto-redirect if already authenticated on client mount
  useEffect(() => {
    if (authService.isAuthenticated()) {
      router.replace(ROUTES.DASHBOARD);
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsLoading(true);

    try {
      await authService.login(email, password);
      setIsSuccess(true);

      // Smooth transition to dashboard
      setTimeout(() => {
        router.push(redirectPath);
      }, 500);
    } catch (err: any) {
      setIsLoading(false);
      setErrorMessage(
        err.message || "Invalid credentials. Please verify your email and password."
      );
    }
  };

  return (
    <main className="min-h-screen w-full flex items-center justify-center p-4 bg-[#F3F7F5] text-gray-900 selection:bg-emerald-500/20 relative overflow-hidden">
      {/* Subtle background ambient circles */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-200/25 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-teal-100/30 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Brand Header */}
        <div className="text-center mb-6 flex flex-col items-center">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-800 flex items-center justify-center shadow-md shadow-emerald-950/20 mb-3">
            <Leaf className="w-6 h-6 text-white" />
          </div>

          <h1 className="text-2xl font-black tracking-tight text-gray-900 leading-tight">
            Vaidya<span className="text-emerald-600">Cure</span>
          </h1>
          <p className="text-xs text-gray-500 font-medium mt-0.5">
            Healing Naturally, Living Better
          </p>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 text-[10px] font-bold tracking-wider uppercase border border-emerald-200/80 mt-2 shadow-2xs">
            <span>Admin & Operations Portal</span>
          </div>
        </div>

        {/* Clean White Card matching Dashboard aesthetics */}
        <div className="bg-white rounded-3xl p-7 sm:p-9 border border-[#E2ECE5] shadow-[0_4px_24px_rgba(0,0,0,0.04)] relative">
          {isSuccess ? (
            /* Success State */
            <div className="text-center py-6 space-y-3 animate-in fade-in zoom-in duration-300">
              <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-700 mx-auto flex items-center justify-center border border-emerald-200 shadow-xs">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-gray-900">
                Authentication Verified
              </h3>
              <p className="text-xs text-gray-500 max-w-xs mx-auto">
                Welcome back! Loading clinical dashboard...
              </p>
              <div className="pt-2 flex justify-center">
                <Loader2 className="w-5 h-5 text-emerald-700 animate-spin" />
              </div>
            </div>
          ) : (
            /* Login Form */
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Error Alert Banner */}
              {errorMessage && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-xs text-rose-700 animate-in fade-in duration-200">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                  <span className="font-medium leading-relaxed">{errorMessage}</span>
                </div>
              )}

              {/* Email Input */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                  Email
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    className="w-full pl-10 pr-4 h-11 text-xs rounded-xl bg-gray-50/80 border border-gray-200 text-gray-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500/25 focus:border-emerald-500 transition-all"
                  />
                </div>
              </div>

              {/* Password Input */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    className="w-full pl-10 pr-10 h-11 text-xs rounded-xl bg-gray-50/80 border border-gray-200 text-gray-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500/25 focus:border-emerald-500 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 p-1 cursor-pointer"
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Keep session active Checkbox */}
              <div className="flex items-center pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded-md border-gray-300 text-emerald-700 focus:ring-emerald-500 accent-[#0D4827] cursor-pointer"
                  />
                  <span className="text-xs text-gray-600 font-medium">
                    Keep session active
                  </span>
                </label>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full h-11 rounded-xl bg-[#0D4827] hover:bg-[#145C33] active:bg-[#09391E] text-white font-bold text-xs tracking-wider uppercase transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed mt-3"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Authenticating...</span>
                  </>
                ) : (
                  <>
                    <span>Authenticate</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* Card Footer */}
          <div className="mt-6 pt-4 border-t border-gray-100 text-center">
            <p className="text-[11px] text-gray-400 font-medium">
              VaidyaCure Clinical Systems • Authorized Personnel Only
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
