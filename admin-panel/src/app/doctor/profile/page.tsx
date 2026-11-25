"use client";

import React, { useState } from "react";
import DoctorShell from "@/components/doctor/DoctorShell";
import { Field, Spinner, errorMessage, inputClass, primaryBtn } from "@/components/ai-doctor/ui";
import { Card, dateOnly, inr, when } from "@/components/market/ui";
import { useToast } from "@/components/market/hooks";
import { authService } from "@/services/auth.service";
import { doctorPanelService, DoctorMe } from "@/services/doctorPanel.service";
import type { BankDetails } from "@/services/market.service";

export default function ProfilePage() {
  const { toast, notify, dismiss } = useToast();
  const [me, setMe] = useState<DoctorMe | null>(null);
  const [about, setAbout] = useState("");
  const [languages, setLanguages] = useState("");
  const [fee, setFee] = useState(0);
  const [bank, setBank] = useState<BankDetails>({ accountName: "", accountNumber: "", ifsc: "", bankName: "", upiId: "" });
  const [pw, setPw] = useState({ current: "", next: "" });
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, action: () => Promise<unknown>, message: string) => {
    setBusy(key);
    try {
      await action();
      notify(message);
    } catch (e) {
      notify(errorMessage(e), "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <DoctorShell
      title="Profile & payouts"
      subtitle="Your public profile, fee and where VaidyaCure sends your weekly payout"
      toast={toast}
      onDismissToast={dismiss}
      onMe={(d) => {
        setMe(d);
        setAbout(d.about);
        setLanguages(d.languages.join(", "));
        setFee(d.requestedFeeInr ?? d.feeInr);
        setBank((b) => ({ ...b, accountName: b.accountName || d.name }));
      }}
    >
      {me && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <Card title="Profile" subtitle="Name, qualification and registration are set by VaidyaCure. Ask the admin to change them.">
            <p className="text-xs text-gray-700">
              <b>{me.name}</b> · {me.qualification} · {me.specialization}
              <br />
              Reg. {me.registrationNumber} ({me.registrationCouncil}) · {me.experienceYears} years
              <br />
              Platform plan valid until {dateOnly(me.planValidUntil)}
            </p>
            <Field label="About you (shown to patients)">
              <textarea className={`${inputClass} h-20 py-2`} maxLength={300} value={about} onChange={(e) => setAbout(e.target.value)} />
            </Field>
            <Field label="Languages (comma separated)">
              <input className={inputClass} value={languages} onChange={(e) => setLanguages(e.target.value)} />
            </Field>
            <button
              type="button"
              className={primaryBtn}
              disabled={busy === "profile"}
              onClick={() =>
                run("profile", () => doctorPanelService.updateProfile({ about, languages: languages.split(",").map((s) => s.trim()).filter(Boolean) }), "Profile saved.")
              }
            >
              {busy === "profile" && <Spinner />} Save profile
            </button>
          </Card>

          <Card title="Fee" subtitle={`Your fee ${inr(me.feeInr)} · patients pay ${inr(me.appPriceInr)} (VaidyaCure adds ${me.commissionPercent}% on top). You receive the full fee.`}>
            {me.requestedFeeInr !== null && <p className="text-[11px] text-amber-700 font-bold">Waiting for admin approval: {inr(me.requestedFeeInr)}</p>}
            <Field label="New fee (₹, multiple of 10)">
              <input type="number" min={10} step={10} className={inputClass} value={fee} onChange={(e) => setFee(Number(e.target.value))} />
            </Field>
            <button type="button" className={primaryBtn} disabled={busy === "fee"} onClick={() => run("fee", () => doctorPanelService.requestFee(fee), "Fee change sent to the admin.")}>
              {busy === "fee" && <Spinner />} Request fee change
            </button>
          </Card>

          <Card title="Payout details" subtitle={me.bankHint ? `Saved: ${me.bankHint} (updated ${when(me.bankUpdatedAt)})` : "Not added yet"}>
            <p className="text-[11px] text-gray-500">Stored encrypted. Only the VaidyaCure admin can see the full details, to send your weekly payout.</p>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Account holder name">
                <input className={inputClass} value={bank.accountName} onChange={(e) => setBank({ ...bank, accountName: e.target.value })} />
              </Field>
              <Field label="Bank name">
                <input className={inputClass} value={bank.bankName} onChange={(e) => setBank({ ...bank, bankName: e.target.value })} />
              </Field>
              <Field label="Account number">
                <input className={inputClass} inputMode="numeric" value={bank.accountNumber} onChange={(e) => setBank({ ...bank, accountNumber: e.target.value.replace(/\D/g, "") })} />
              </Field>
              <Field label="IFSC">
                <input className={inputClass} value={bank.ifsc} onChange={(e) => setBank({ ...bank, ifsc: e.target.value.toUpperCase().trim() })} />
              </Field>
            </div>
            <Field label="UPI id (optional if bank account is given)">
              <input className={inputClass} value={bank.upiId} onChange={(e) => setBank({ ...bank, upiId: e.target.value.trim() })} placeholder="name@oksbi" />
            </Field>
            <button
              type="button"
              className={primaryBtn}
              disabled={busy === "bank"}
              onClick={() =>
                run(
                  "bank",
                  async () => {
                    const r = await doctorPanelService.updateBank(bank);
                    setMe({ ...me, bankHint: r.bankHint, bankUpdatedAt: new Date().toISOString() });
                    setBank({ ...bank, accountNumber: "", upiId: "" });
                  },
                  "Payout details saved."
                )
              }
            >
              {busy === "bank" && <Spinner />} Save payout details
            </button>
          </Card>

          <Card title="Password">
            <Field label="Current password">
              <input type="password" className={inputClass} value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
            </Field>
            <Field label="New password" hint="At least 8 characters with letters and numbers. Other devices will be logged out.">
              <input type="password" className={inputClass} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
            </Field>
            <button
              type="button"
              className={primaryBtn}
              disabled={busy === "pw" || !pw.current || pw.next.length < 8}
              onClick={() =>
                run(
                  "pw",
                  async () => {
                    authService.replaceToken(await doctorPanelService.changePassword(pw.current, pw.next));
                    setPw({ current: "", next: "" });
                  },
                  "Password changed."
                )
              }
            >
              {busy === "pw" && <Spinner />} Change password
            </button>
          </Card>
        </div>
      )}
    </DoctorShell>
  );
}
