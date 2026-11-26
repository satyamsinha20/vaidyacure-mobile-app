"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, ShieldCheck, Stethoscope } from "lucide-react";
import { Field, Spinner, errorMessage, inputClass, primaryBtn } from "@/components/ai-doctor/ui";
import { authService } from "@/services/auth.service";
import { doctorPanelService, DoctorMe } from "@/services/doctorPanel.service";

/** First login: set an own password, then accept the doctor terms */
export default function DoctorSetupPage() {
  const router = useRouter();
  const [me, setMe] = useState<DoctorMe | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    doctorPanelService
      .me()
      .then((d) => {
        if (!d.mustChangePassword && d.termsAcceptedAt) router.replace("/doctor");
        else setMe(d);
      })
      .catch(() => router.replace("/login"));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changePassword = async () => {
    setError(null);
    if (next !== repeat) return setError("The two new passwords do not match.");
    setBusy(true);
    try {
      authService.replaceToken(await doctorPanelService.changePassword(current, next));
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const accept = async () => {
    setBusy(true);
    try {
      await doctorPanelService.acceptTerms();
      router.replace("/doctor");
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  if (!me) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#F1F7F9] flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-3xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-2xl bg-[#0B4A5C] text-white flex items-center justify-center">
            <Stethoscope className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-black">Welcome, {me.name}</h1>
            <p className="text-[11px] text-gray-500">Reg. No. {me.doctorCode} · two quick steps before your panel opens</p>
          </div>
        </div>
        {error && <p className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">{error}</p>}

        {me.mustChangePassword ? (
          <div className="space-y-3">
            <p className="text-sm font-bold flex items-center gap-1.5">
              <KeyRound className="w-4 h-4" /> Step 1: choose your own password
            </p>
            <Field label="Temporary password (from VaidyaCure)">
              <input type="password" className={inputClass} value={current} onChange={(e) => setCurrent(e.target.value)} />
            </Field>
            <Field label="New password" hint="At least 8 characters with letters and numbers">
              <input type="password" className={inputClass} value={next} onChange={(e) => setNext(e.target.value)} />
            </Field>
            <Field label="New password again">
              <input type="password" className={inputClass} value={repeat} onChange={(e) => setRepeat(e.target.value)} />
            </Field>
            <button type="button" className={primaryBtn} disabled={busy || !current || next.length < 8} onClick={changePassword}>
              {busy && <Spinner />} Save password
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-bold flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" /> Step 2: doctor terms
            </p>
            <ul className="text-xs text-gray-700 space-y-1.5 list-disc pl-4 max-h-72 overflow-y-auto">
              <li>
                I am a registered medical practitioner (VaidyaCure Reg. No. {me.doctorCode}) and will follow the
                Telemedicine Practice Guidelines, 2020, including what may be prescribed online.
              </li>
              <li>I will start every confirmed consultation within {me.rules.doctorJoinMinutes} minutes of its time. If I do not, the patient gets a full refund and I earn nothing for it.</li>
              <li>
                If the patient does not reply within {me.rules.patientReplyMinutes} minutes of my first message, {me.rules.patientNoShowKeepPercent}% of the payment is kept
                and I receive my share of it.
              </li>
              <li>I will send a written report after every consultation; I am paid only for consultations with a report.</li>
              <li>
                Each paid consultation includes {me.rules.followUpFreeCount} free follow-ups within {me.rules.followUpHours} hours. I will not charge patients for these.
              </li>
              <li>
                <b>Chats are recorded and may be reviewed by VaidyaCure for patient safety.</b> Phone numbers, emails, UPI ids and account numbers are
                hidden automatically.
              </li>
              <li>I will never ask a patient to pay me directly or to contact me outside VaidyaCure. All payments go through VaidyaCure and are paid to me weekly.</li>
              <li>I will keep patient information confidential and use it only for their care.</li>
            </ul>
            <label className="flex items-start gap-2 text-xs cursor-pointer">
              <input type="checkbox" className="mt-0.5 accent-[#0B4A5C]" checked={agree} onChange={(e) => setAgree(e.target.checked)} />I have read and accept these terms.
            </label>
            <button type="button" className={primaryBtn} disabled={busy || !agree} onClick={accept}>
              {busy && <Spinner />} Accept and open my panel
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
