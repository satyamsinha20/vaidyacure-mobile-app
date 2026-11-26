"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { authService } from "@/services/auth.service";
import { ApiError } from "@/lib/api";
import { useSessionUser } from "@/components/app/SessionProvider";
import { Field, Modal, Spinner, inputClass, primaryBtn, ghostBtn } from "@/components/ai-doctor/ui";
import type { Toast } from "@/components/admin/AdminPageShell";

/** Super admin check for money pages (the backend enforces the same rule) */
export function useSuperAdmin() {
  const sessionUser = useSessionUser();
  // The login cookies answer at once (no "Checking access…" wait); the backend confirms
  const [access, setAccess] = useState<"checking" | "allowed" | "denied">(() =>
    sessionUser ? (sessionUser.role === "superadmin" ? "allowed" : "denied") : "checking"
  );
  useEffect(() => {
    authService
      .getMe()
      .then((u) => setAccess(u.role === "superadmin" ? "allowed" : "denied"))
      .catch((error: unknown) => {
        // A rejected login always closes the page; a network hiccup keeps the cookie's answer
        const rejected = error instanceof ApiError && (error.status === 401 || error.status === 403);
        setAccess((current) => (current === "checking" || rejected ? "denied" : current));
      });
  }, []);
  return access;
}

export function AccessState({ access }: { access: "checking" | "allowed" | "denied" }) {
  if (access === "checking") {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-500 p-4">
        <Spinner /> Checking access…
      </div>
    );
  }
  if (access === "denied") {
    return (
      <div className="p-6 rounded-2xl bg-white border border-gray-200 text-center">
        <Lock className="w-6 h-6 mx-auto text-gray-400" />
        <p className="text-sm font-bold text-gray-900 mt-2">Access denied</p>
        <p className="text-xs text-gray-500 mt-1">Only the Super Admin can manage doctors and money.</p>
      </div>
    );
  }
  return null;
}

/** The current time, refreshed every `ms` (keeps Date.now() out of rendering) */
export function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(timer);
  }, [ms]);
  return now;
}

export function useToast() {
  const [toast, setToast] = useState<Toast | null>(null);
  const notify = useCallback((message: string, kind: "success" | "error" = "success") => setToast({ message, kind }), []);
  const dismiss = useCallback(() => setToast(null), []);
  return { toast, notify, dismiss };
}

/** A small form dialog for one text value (reason, UTR …) */
export function PromptModal({
  title,
  subtitle,
  label,
  placeholder,
  confirmLabel,
  pattern,
  patternHint,
  extra,
  onSubmit,
  onClose,
}: {
  title: string;
  subtitle?: string;
  label: string;
  placeholder?: string;
  confirmLabel: string;
  pattern?: RegExp;
  patternHint?: string;
  extra?: React.ReactNode;
  onSubmit: (value: string) => Promise<void>;
  onClose: () => void;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const valid = value.trim().length >= 3 && (!pattern || pattern.test(value.trim()));
  return (
    <Modal
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={ghostBtn} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={primaryBtn}
            disabled={!valid || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onSubmit(value.trim());
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy && <Spinner />} {confirmLabel}
          </button>
        </>
      }
    >
      {extra}
      <Field label={label} hint={pattern && value && !pattern.test(value.trim()) ? patternHint : undefined}>
        <input autoFocus className={inputClass} value={value} placeholder={placeholder} onChange={(e) => setValue(e.target.value)} />
      </Field>
    </Modal>
  );
}
