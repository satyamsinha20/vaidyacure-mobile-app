"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CalendarPlus, Eye, KeyRound, Pencil, Plus, Power, RefreshCw, Send } from "lucide-react";
import AdminPageShell from "@/components/admin/AdminPageShell";
import { Field, Modal, Spinner, Toggle, dangerBtn, errorMessage, ghostBtn, inputClass, primaryBtn } from "@/components/ai-doctor/ui";
import { Card, CopyButton, Empty, Tabs, WeeklyHoursEditor, dateOnly, inr, when } from "@/components/market/ui";
import { AccessState, PromptModal, useNow, useSuperAdmin, useToast } from "@/components/market/hooks";
import {
  marketService,
  BankDetails,
  DoctorLogin,
  DoctorProfileInput,
  EmailConfig,
  MarketSettings,
  RealDoctor,
} from "@/services/market.service";

type Tab = "doctors" | "rules" | "email";

const emptyProfile: DoctorProfileInput = {
  name: "",
  email: "",
  qualification: "",
  specialization: "",
  registrationNumber: "",
  registrationCouncil: "",
  experienceYears: 0,
  about: "",
  languages: ["Hindi", "English"],
  avatarColor: "#0E7490",
  feeInr: 500,
  consultMinutes: 15,
};

const appPrice = (fee: number, commissionPercent: number) => fee + Math.round(fee * commissionPercent) / 100;

const daysLeft = (iso: string | null, now: number) => (iso ? Math.ceil((new Date(iso).getTime() - now) / 86_400_000) : -1);

export default function DoctorsPage() {
  const access = useSuperAdmin();
  const { toast, notify, dismiss } = useToast();
  const [tab, setTab] = useState<Tab>("doctors");
  const [doctors, setDoctors] = useState<RealDoctor[]>([]);
  const [commission, setCommission] = useState(10);
  const now = useNow();
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<RealDoctor | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [login, setLogin] = useState<DoctorLogin | null>(null);
  const [renewFor, setRenewFor] = useState<RealDoctor | null>(null);
  const [bankFor, setBankFor] = useState<{ doctor: RealDoctor; bank: BankDetails | null } | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, settings] = await Promise.all([marketService.listDoctors(), marketService.getSettings()]);
      setDoctors(list);
      setCommission(settings.settings.commissionPercent);
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    if (access === "allowed") load();
  }, [access, load]);

  const act = async (action: () => Promise<unknown>, message: string) => {
    try {
      await action();
      notify(message);
      await load();
    } catch (error) {
      notify(errorMessage(error), "error");
    }
  };

  return (
    <AdminPageShell
      title="Real Doctors"
      subtitle="Create doctor logins after the yearly platform fee, set fees and rules, and manage payment email"
      toast={toast}
      onDismissToast={dismiss}
      actions={
        access === "allowed" &&
        tab === "doctors" && (
          <button
            type="button"
            className={primaryBtn}
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="w-3.5 h-3.5" /> Add doctor
          </button>
        )
      }
    >
      <AccessState access={access} />
      {access === "allowed" && (
        <>
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { key: "doctors", label: "Doctors" },
              { key: "rules", label: "Rules & UPI" },
              { key: "email", label: "Email & reminders" },
            ]}
          />
          {tab === "doctors" &&
            (loading ? (
              <div className="flex items-center gap-2 text-xs text-gray-500 p-4">
                <Spinner /> Loading…
              </div>
            ) : doctors.length === 0 ? (
              <Empty text="No real doctors yet. When a doctor pays the yearly platform fee, add them here to create their login." />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {doctors.map((d) => {
                  const left = daysLeft(d.planValidUntil, now);
                  const issues = [
                    !d.isActive && "Turned off",
                    left < 0 && "Plan expired",
                    d.mustChangePassword && "Has not logged in yet",
                    !d.mustChangePassword && !d.termsAcceptedAt && "Terms not accepted",
                    !d.availability.weekly.length && "No working hours",
                  ].filter(Boolean) as string[];
                  return (
                    <div key={d.id} className="p-4 rounded-2xl bg-white border border-gray-200 space-y-2">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-black" style={{ background: d.avatarColor }}>
                          {d.name.replace(/^Dr\.?\s*/i, "").slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-black text-gray-900 truncate">
                            {d.name} <span className="text-[11px] font-mono text-gray-500">{d.doctorCode}</span>
                          </p>
                          <p className="text-[11px] text-gray-600">
                            {d.qualification} · {d.specialization} · Reg. {d.registrationNumber} ({d.registrationCouncil})
                          </p>
                          <p className="text-[11px] text-gray-600">
                            Fee {inr(d.feeInr)} → app price {inr(appPrice(d.feeInr, commission))} · {d.consultMinutes} min · {d.email}
                          </p>
                        </div>
                        {d.bookable ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">Bookable</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-600 border border-gray-200">Not bookable</span>
                        )}
                      </div>
                      <p className={`text-[11px] ${left < 0 ? "text-rose-700 font-bold" : left <= 30 ? "text-amber-700 font-bold" : "text-gray-500"}`}>
                        Platform plan {left < 0 ? "expired" : "valid until"} {dateOnly(d.planValidUntil)}
                        {left >= 0 && left <= 30 ? ` (${left} days left)` : ""} · last login {when(d.lastLoginAt)}
                      </p>
                      {issues.length > 0 && <p className="text-[11px] text-amber-700">⚠ {issues.join(" · ")}</p>}
                      {d.requestedFeeInr !== null && (
                        <div className="p-2 rounded-xl bg-amber-50 border border-amber-200 flex flex-wrap items-center gap-2 text-[11px] text-amber-900">
                          Fee change requested: {inr(d.feeInr)} → <b>{inr(d.requestedFeeInr)}</b>
                          <button type="button" className={primaryBtn} onClick={() => act(() => marketService.decideFee(d.id, "approve"), "Fee updated.")}>
                            Approve
                          </button>
                          <button type="button" className={ghostBtn} onClick={() => act(() => marketService.decideFee(d.id, "reject"), "Fee request rejected.")}>
                            Reject
                          </button>
                        </div>
                      )}
                      <p className="text-[11px] text-gray-500">
                        Payout details: {d.bankHint || "not added yet"}
                        {d.bankChanged && <span className="ml-1 font-bold text-amber-700">(changed, check before paying)</span>}
                      </p>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        <button
                          type="button"
                          className={ghostBtn}
                          onClick={() => {
                            setEditing(d);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil className="w-3.5 h-3.5" /> Edit
                        </button>
                        <button type="button" className={ghostBtn} onClick={() => setRenewFor(d)}>
                          <CalendarPlus className="w-3.5 h-3.5" /> Record plan payment
                        </button>
                        <button
                          type="button"
                          className={ghostBtn}
                          onClick={async () => {
                            if (!window.confirm(`Reset ${d.name}'s password? Their current logins will stop working.`)) return;
                            try {
                              setLogin((await marketService.resetPassword(d.id)).login);
                            } catch (error) {
                              notify(errorMessage(error), "error");
                            }
                          }}
                        >
                          <KeyRound className="w-3.5 h-3.5" /> Reset password
                        </button>
                        <button
                          type="button"
                          className={ghostBtn}
                          onClick={async () => {
                            try {
                              setBankFor({ doctor: d, bank: await marketService.getBank(d.id) });
                            } catch (error) {
                              notify(errorMessage(error), "error");
                            }
                          }}
                        >
                          <Eye className="w-3.5 h-3.5" /> Payout details
                        </button>
                        <button
                          type="button"
                          className={d.isActive ? dangerBtn : primaryBtn}
                          onClick={() => act(() => marketService.updateDoctor(d.id, { isActive: !d.isActive }), d.isActive ? "Doctor turned off and logged out." : "Doctor turned on.")}
                        >
                          <Power className="w-3.5 h-3.5" /> {d.isActive ? "Turn off" : "Turn on"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          {tab === "rules" && <RulesTab notify={notify} />}
          {tab === "email" && <EmailTab notify={notify} />}
        </>
      )}

      {formOpen && (
        <DoctorForm
          doctor={editing}
          commission={commission}
          onClose={() => setFormOpen(false)}
          onSaved={async (createdLogin) => {
            setFormOpen(false);
            if (createdLogin) setLogin(createdLogin);
            notify(editing ? "Doctor updated." : "Doctor created.");
            await load();
          }}
          notify={notify}
        />
      )}

      {login && (
        <Modal
          title="Doctor login details"
          subtitle="Share these with the doctor. The password is shown only now; they must change it on first login."
          onClose={() => setLogin(null)}
          footer={
            <button type="button" className={primaryBtn} onClick={() => setLogin(null)}>
              Done
            </button>
          }
        >
          {[
            ["Login page", typeof window !== "undefined" ? `${window.location.origin}/login` : "/login"],
            ["Doctor ID", login.doctorCode],
            ["Email", login.email],
            ["Temporary password", login.password],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-2 p-2 rounded-xl bg-gray-50 border border-gray-200">
              <div>
                <p className="text-[10.5px] text-gray-500 font-bold">{label}</p>
                <p className="text-sm font-mono text-gray-900 break-all">{value}</p>
              </div>
              <CopyButton text={value} />
            </div>
          ))}
          <p className="text-[11px] text-amber-700 flex gap-1">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Send it privately (not in a group chat).
          </p>
        </Modal>
      )}

      {renewFor && (
        <PromptModal
          title={`Platform plan payment: ${renewFor.name}`}
          subtitle={`Current plan until ${dateOnly(renewFor.planValidUntil)}. Recording a payment extends it by one year.`}
          label="Amount received (₹)"
          pattern={/^\d{1,7}$/}
          patternHint="Whole rupees"
          confirmLabel="Record & extend"
          onClose={() => setRenewFor(null)}
          onSubmit={async (value) => {
            await act(() => marketService.renewPlan(renewFor.id, { amountInr: Number(value), utr: "" }), "Plan extended by one year.");
            setRenewFor(null);
          }}
        />
      )}

      {bankFor && (
        <Modal
          title={`Payout details: ${bankFor.doctor.name}`}
          subtitle="Encrypted on the server. Opening this is recorded in the audit log."
          onClose={() => setBankFor(null)}
          footer={
            <>
              {bankFor.doctor.bankChanged && (
                <button
                  type="button"
                  className={primaryBtn}
                  onClick={async () => {
                    await act(() => marketService.markBankReviewed(bankFor.doctor.id), "Marked as checked.");
                    setBankFor(null);
                  }}
                >
                  I have checked these details
                </button>
              )}
              <button type="button" className={ghostBtn} onClick={() => setBankFor(null)}>
                Close
              </button>
            </>
          }
        >
          {!bankFor.bank ? (
            <p className="text-xs text-gray-500">The doctor has not added bank or UPI details yet.</p>
          ) : (
            (
              [
                ["Account holder", bankFor.bank.accountName],
                ["Account number", bankFor.bank.accountNumber],
                ["IFSC", bankFor.bank.ifsc],
                ["Bank", bankFor.bank.bankName],
                ["UPI id", bankFor.bank.upiId],
              ] as const
            )
              .filter(([, v]) => v)
              .map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-2 p-2 rounded-xl bg-gray-50 border border-gray-200">
                  <div>
                    <p className="text-[10.5px] text-gray-500 font-bold">{label}</p>
                    <p className="text-sm font-mono text-gray-900">{value}</p>
                  </div>
                  <CopyButton text={value} />
                </div>
              ))
          )}
        </Modal>
      )}
    </AdminPageShell>
  );
}

/* -------------------------------------------------------------------------- */
/* ADD / EDIT DOCTOR                                                          */
/* -------------------------------------------------------------------------- */
function DoctorForm({
  doctor,
  commission,
  onClose,
  onSaved,
  notify,
}: {
  doctor: RealDoctor | null;
  commission: number;
  onClose: () => void;
  onSaved: (login: DoctorLogin | null) => Promise<void>;
  notify: (m: string, k?: "success" | "error") => void;
}) {
  const [form, setForm] = useState<DoctorProfileInput>(doctor ? { ...emptyProfile, ...doctor } : emptyProfile);
  const [availability, setAvailability] = useState(doctor?.availability ?? { weekly: [], daysOff: [] });
  const [plan, setPlan] = useState({ amountInr: 0, utr: "", validUntil: "" });
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof DoctorProfileInput>(k: K, v: DoctorProfileInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const profile: DoctorProfileInput = {
        name: form.name,
        email: form.email,
        qualification: form.qualification,
        specialization: form.specialization,
        registrationNumber: form.registrationNumber,
        registrationCouncil: form.registrationCouncil,
        experienceYears: Number(form.experienceYears) || 0,
        about: form.about,
        languages: form.languages,
        avatarColor: form.avatarColor,
        feeInr: Number(form.feeInr),
        consultMinutes: Number(form.consultMinutes),
      };
      if (doctor) {
        await marketService.updateDoctor(doctor.id, { ...profile, availability });
        await onSaved(null);
      } else {
        const created = await marketService.createDoctor({
          ...profile,
          plan: { amountInr: Number(plan.amountInr) || 0, utr: plan.utr, ...(plan.validUntil ? { validUntil: plan.validUntil } : {}) },
        });
        await onSaved(created.login);
      }
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={doctor ? `Edit ${doctor.name}` : "Add a real doctor"}
      subtitle={doctor ? doctor.doctorCode : "Check the registration number with the State Medical Council / NMC before adding."}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={ghostBtn} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={primaryBtn} onClick={save} disabled={saving}>
            {saving && <Spinner />} {doctor ? "Save" : "Create login"}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Full name">
          <input className={inputClass} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Dr. Neha Singh" />
        </Field>
        <Field label="Email (also a login ID)">
          <input className={inputClass} value={form.email} onChange={(e) => set("email", e.target.value.trim())} />
        </Field>
        <Field label="Qualification">
          <input className={inputClass} value={form.qualification} onChange={(e) => set("qualification", e.target.value)} placeholder="MBBS, MD (Medicine)" />
        </Field>
        <Field label="Specialization">
          <input className={inputClass} value={form.specialization} onChange={(e) => set("specialization", e.target.value)} placeholder="General Physician" />
        </Field>
        <Field label="Registration number">
          <input className={inputClass} value={form.registrationNumber} onChange={(e) => set("registrationNumber", e.target.value)} />
        </Field>
        <Field label="Medical council">
          <input className={inputClass} value={form.registrationCouncil} onChange={(e) => set("registrationCouncil", e.target.value)} placeholder="Bihar Medical Council" />
        </Field>
        <Field label="Doctor's fee (₹)" hint={`App price: ${inr(appPrice(Number(form.feeInr || 0), commission))} (fee + ${commission}% commission). Multiple of ₹10.`}>
          <input type="number" min={10} step={10} className={inputClass} value={form.feeInr} onChange={(e) => set("feeInr", Number(e.target.value))} />
        </Field>
        <Field label="Consultation length (minutes)" hint="10 to 15 is usual">
          <input type="number" min={10} max={30} className={inputClass} value={form.consultMinutes} onChange={(e) => set("consultMinutes", Number(e.target.value))} />
        </Field>
        <Field label="Experience (years)">
          <input type="number" min={0} max={70} className={inputClass} value={form.experienceYears} onChange={(e) => set("experienceYears", Number(e.target.value))} />
        </Field>
        <Field label="Languages (comma separated)">
          <input
            className={inputClass}
            value={form.languages.join(", ")}
            onChange={(e) => set("languages", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
          />
        </Field>
      </div>
      <Field label="About (shown in the app)">
        <textarea className={`${inputClass} h-16 py-2`} maxLength={300} value={form.about} onChange={(e) => set("about", e.target.value)} />
      </Field>
      <Field label="Avatar colour">
        <input type="color" className="w-24 h-9 rounded-xl border border-gray-200 cursor-pointer" value={form.avatarColor} onChange={(e) => set("avatarColor", e.target.value)} />
      </Field>
      {doctor ? (
        <div className="p-3 rounded-xl border border-gray-200 space-y-2">
          <p className="text-[11px] font-bold text-gray-700">Working hours (the doctor can also change these)</p>
          <WeeklyHoursEditor value={availability} onChange={setAvailability} />
        </div>
      ) : (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2">
          <p className="text-[11px] font-bold text-emerald-900">Yearly platform fee received</p>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Amount (₹)">
              <input type="number" min={0} className={inputClass} value={plan.amountInr} onChange={(e) => setPlan({ ...plan, amountInr: Number(e.target.value) })} />
            </Field>
            <Field label="UTR / reference">
              <input className={inputClass} value={plan.utr} onChange={(e) => setPlan({ ...plan, utr: e.target.value })} />
            </Field>
            <Field label="Valid until" hint="Empty = 1 year">
              <input type="date" className={inputClass} value={plan.validUntil} onChange={(e) => setPlan({ ...plan, validUntil: e.target.value })} />
            </Field>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* RULES                                                                      */
/* -------------------------------------------------------------------------- */
const RULE_FIELDS: Array<{ key: keyof MarketSettings; label: string; hint: string }> = [
  { key: "commissionPercent", label: "Commission (%)", hint: "Added on top of the doctor's fee (₹500 + 10% = ₹550)." },
  { key: "platformFeeInr", label: "Yearly platform fee (₹)", hint: "What doctors pay you for one year (for your records)." },
  { key: "minLeadMinutes", label: "Book at least (minutes ahead)", hint: "Gives you time to check the payment." },
  { key: "paymentWindowMinutes", label: "Time to pay (minutes)", hint: "Slot is held this long for the UTR." },
  { key: "bookingDaysAhead", label: "Bookings open (days ahead)", hint: "" },
  { key: "slotGapMinutes", label: "Gap between consultations (minutes)", hint: "" },
  { key: "doctorJoinMinutes", label: "Doctor must start within (minutes)", hint: "Otherwise: full refund to the patient." },
  { key: "patientReplyMinutes", label: "Patient must reply within (minutes)", hint: "After the doctor's first message." },
  { key: "patientNoShowKeepPercent", label: "Kept when patient does not join (%)", hint: "The rest is refunded." },
  { key: "noShowAdminSharePercent", label: "Your share of the kept amount (%)", hint: "The rest goes to the doctor." },
  { key: "followUpHours", label: "Free follow-up window (hours)", hint: "120 hours = 5 days." },
  { key: "followUpFreeCount", label: "Free follow-ups", hint: "Per paid consultation." },
  { key: "refundHours", label: "Refund within (hours)", hint: "Deadline shown in Payments > Refunds." },
];

function RulesTab({ notify }: { notify: (m: string, k?: "success" | "error") => void }) {
  const [form, setForm] = useState<MarketSettings | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    marketService
      .getSettings()
      .then((r) => setForm(r.settings))
      .catch((e) => notify(errorMessage(e), "error"));
  }, [notify]);
  if (!form) return <Spinner />;
  return (
    <Card title="Payment and booking rules" subtitle="Patients pay to your UPI id and enter the UTR; you verify it in Payments.">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Your UPI id (patients pay here)" hint="Use a business UPI QR id if you can.">
          <input className={inputClass} value={form.upiId} onChange={(e) => setForm({ ...form, upiId: e.target.value.trim() })} placeholder="vaidyacure@okaxis" />
        </Field>
        <Field label="Name shown with the UPI id">
          <input className={inputClass} value={form.upiName} onChange={(e) => setForm({ ...form, upiName: e.target.value })} />
        </Field>
        {RULE_FIELDS.map((f) => (
          <Field key={f.key} label={f.label} hint={f.hint || undefined}>
            <input type="number" className={inputClass} value={form[f.key] as number} onChange={(e) => setForm({ ...form, [f.key]: Number(e.target.value) })} />
          </Field>
        ))}
      </div>
      <button
        type="button"
        className={primaryBtn}
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          try {
            setForm(await marketService.saveSettings(form));
            notify("Rules saved. The app picks them up within a minute.");
          } catch (error) {
            notify(errorMessage(error), "error");
          } finally {
            setSaving(false);
          }
        }}
      >
        {saving && <Spinner />} Save rules
      </button>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* EMAIL (Nodemailer SMTP) + CRON                                             */
/* -------------------------------------------------------------------------- */
function EmailTab({ notify }: { notify: (m: string, k?: "success" | "error") => void }) {
  const [cfg, setCfg] = useState<EmailConfig | null>(null);
  const [password, setPassword] = useState("");
  const [testTo, setTestTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [cronUrl, setCronUrl] = useState<string | null>(null);
  const [cronConfigured, setCronConfigured] = useState(false);

  const load = useCallback(() => {
    marketService
      .getSettings()
      .then((r) => {
        setCfg(r.email);
        setCronConfigured(r.cronConfigured);
      })
      .catch((e) => notify(errorMessage(e), "error"));
  }, [notify]);
  useEffect(load, [load]);
  if (!cfg) return <Spinner />;

  const save = async (removePassword = false) => {
    setBusy(true);
    try {
      await marketService.saveEmail({
        enabled: cfg.enabled,
        host: cfg.host,
        port: cfg.port,
        secure: cfg.secure,
        user: cfg.user,
        fromName: cfg.fromName,
        fromEmail: cfg.fromEmail,
        ...(password ? { password } : {}),
        ...(removePassword ? { removePassword: true } : {}),
      });
      setPassword("");
      notify("Email settings saved.");
      load();
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <Card
        title="Email (login codes, bookings, refunds)"
        subtitle="Gmail: turn on 2-Step Verification, then create an App Password at myaccount.google.com/apppasswords and paste it here."
        actions={
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${cfg.ready ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
            {cfg.ready ? "Ready" : "Not set up"}
          </span>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Gmail / SMTP username">
            <input className={inputClass} value={cfg.user} onChange={(e) => setCfg({ ...cfg, user: e.target.value.trim() })} placeholder="yourname@gmail.com" />
          </Field>
          <Field label={cfg.hasPassword ? `App password (saved ${cfg.passHint})` : "App password"} hint="Stored encrypted. Never shown again.">
            <input type="password" autoComplete="off" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={cfg.hasPassword ? "Paste a new one to replace" : "16-character app password"} />
          </Field>
          <Field label="Sender name">
            <input className={inputClass} value={cfg.fromName} onChange={(e) => setCfg({ ...cfg, fromName: e.target.value })} />
          </Field>
          <Field label="Sender email (optional)" hint="Empty = the username">
            <input className={inputClass} value={cfg.fromEmail} onChange={(e) => setCfg({ ...cfg, fromEmail: e.target.value.trim() })} />
          </Field>
          <Field label="SMTP server">
            <input className={inputClass} value={cfg.host} onChange={(e) => setCfg({ ...cfg, host: e.target.value.trim() })} />
          </Field>
          <div className="grid grid-cols-2 gap-2 items-end">
            <Field label="Port">
              <input type="number" className={inputClass} value={cfg.port} onChange={(e) => setCfg({ ...cfg, port: Number(e.target.value) })} />
            </Field>
            <div className="pb-1.5">
              <Toggle checked={cfg.secure} onChange={(v) => setCfg({ ...cfg, secure: v })} label="SSL" />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Toggle checked={cfg.enabled} onChange={(v) => setCfg({ ...cfg, enabled: v })} label={cfg.enabled ? "Sending on" : "Sending off"} />
          <button type="button" className={primaryBtn} onClick={() => save()} disabled={busy}>
            {busy && <Spinner />} Save
          </button>
          {cfg.hasPassword && (
            <button type="button" className={dangerBtn} onClick={() => window.confirm("Remove the saved password? Emails will stop.") && save(true)}>
              Remove password
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100">
          <input className={`${inputClass} max-w-xs`} value={testTo} onChange={(e) => setTestTo(e.target.value.trim())} placeholder="Send a test email to…" />
          <button
            type="button"
            className={ghostBtn}
            disabled={!testTo || busy}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await marketService.testEmail(testTo);
                notify(r.message, r.ok ? "success" : "error");
              } catch (error) {
                notify(errorMessage(error), "error");
              } finally {
                setBusy(false);
              }
            }}
          >
            <Send className="w-3.5 h-3.5" /> Send test
          </button>
        </div>
      </Card>

      <Card
        title="Reminders on time (cron)"
        subtitle="Reminder emails 15 minutes before, and 'consultation time now' alerts, need a ping every minute. No-shows and refunds work without it."
        actions={
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${cronConfigured ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-50 text-gray-600 border-gray-200"}`}>
            {cronConfigured ? "Key created" : "Not set up"}
          </span>
        }
      >
        <ol className="text-[11px] text-gray-600 list-decimal pl-4 space-y-0.5">
          <li>Create a free account at cron-job.org.</li>
          <li>Generate the secret URL below and add it there as a job that runs every 1 minute.</li>
        </ol>
        {cronUrl ? (
          <div className="flex items-center gap-2 p-2 rounded-xl bg-gray-50 border border-gray-200">
            <p className="text-[11px] font-mono break-all flex-1">{cronUrl}</p>
            <CopyButton text={cronUrl} />
          </div>
        ) : (
          <button
            type="button"
            className={ghostBtn}
            onClick={async () => {
              if (cronConfigured && !window.confirm("Create a new URL? The old one will stop working.")) return;
              try {
                const { key } = await marketService.createCronKey();
                const api = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000/api").replace(/\/+$/, "");
                setCronUrl(`${api}/cron/tick?key=${key}`);
                setCronConfigured(true);
              } catch (error) {
                notify(errorMessage(error), "error");
              }
            }}
          >
            <RefreshCw className="w-3.5 h-3.5" /> {cronConfigured ? "Create a new secret URL" : "Create secret URL"}
          </button>
        )}
        <p className="text-[10.5px] text-gray-500">The URL is shown once. Keep it private.</p>
      </Card>
    </div>
  );
}
