"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CalendarPlus, Eye, KeyRound, Landmark, Lock, LockOpen, Pencil, Plus } from "lucide-react";
import AdminPageShell from "@/components/admin/AdminPageShell";
import { Field, Modal, Spinner, errorMessage, ghostBtn, inputClass, primaryBtn } from "@/components/ai-doctor/ui";
import { Card, CopyButton, Empty, Tabs, WeeklyHoursEditor, dateOnly, inr, when } from "@/components/market/ui";
import { AccessState, PromptModal, useNow, useSuperAdmin, useToast } from "@/components/market/hooks";
import {
  marketService,
  BankDetails,
  DoctorLogin,
  DoctorProfileInput,
  MarketSettings,
  RealDoctor,
} from "@/services/market.service";
import { cachedLoad } from "@/lib/cache";

type Tab = "doctors" | "rules";

const emptyProfile: DoctorProfileInput = {
  name: "",
  email: "",
  qualification: "",
  specialization: "",
  experienceYears: 0,
  about: "",
  languages: ["Hindi", "English"],
  avatarColor: "#0E7490",
  feeInr: 500,
  consultMinutes: 15,
};

const appPrice = (fee: number, commissionPercent: number) => fee + Math.round(fee * commissionPercent) / 100;

const daysLeft = (iso: string | null, now: number) => (iso ? Math.ceil((new Date(iso).getTime() - now) / 86_400_000) : -1);

const initials = (name: string) => name.replace(/^Dr\.?\s*/i, "").slice(0, 2).toUpperCase();

export default function DoctorsPage() {
  const access = useSuperAdmin();
  const { toast, notify, dismiss } = useToast();
  const [tab, setTab] = useState<Tab>("doctors");
  const [doctors, setDoctors] = useState<RealDoctor[]>([]);
  const [commission, setCommission] = useState(10);
  const now = useNow();
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<RealDoctor | null>(null);
  const [editing, setEditing] = useState<RealDoctor | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [login, setLogin] = useState<DoctorLogin | null>(null);
  const [renewFor, setRenewFor] = useState<RealDoctor | null>(null);
  const [bankFor, setBankFor] = useState<{ doctor: RealDoctor; bank: BankDetails | null } | null>(null);

  const load = useCallback(async () => {
    try {
      await cachedLoad(
        "market:doctors",
        () => Promise.all([marketService.listDoctors(), marketService.getSettings()]),
        ([list, settings]) => {
          setDoctors(list);
          setCommission(settings.settings.commissionPercent);
          setLoading(false);
        }
      );
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

  /** Lock = ban: the doctor is logged out, cannot log in and cannot be booked until unlocked */
  const toggleLock = (d: RealDoctor) => {
    const question = d.isActive
      ? `Lock ${d.name}? They are logged out at once, cannot log in, and patients cannot book them until you unlock.`
      : `Unlock ${d.name}? They can log in again.`;
    if (!window.confirm(question)) return;
    act(() => marketService.updateDoctor(d.id, { isActive: !d.isActive }), d.isActive ? "Doctor locked and logged out." : "Doctor unlocked.");
  };

  const resetPassword = async (d: RealDoctor) => {
    if (!window.confirm(`Reset ${d.name}'s password? Their current logins will stop working.`)) return;
    setViewing(null);
    try {
      setLogin((await marketService.resetPassword(d.id)).login);
    } catch (error) {
      notify(errorMessage(error), "error");
    }
  };

  const openBank = async (d: RealDoctor) => {
    setViewing(null);
    try {
      setBankFor({ doctor: d, bank: await marketService.getBank(d.id) });
    } catch (error) {
      notify(errorMessage(error), "error");
    }
  };

  return (
    <AdminPageShell
      title="Real Doctors"
      subtitle="Create doctor logins after the yearly platform fee, and set fees and booking rules"
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
              <div className="rounded-2xl bg-white border border-gray-200 overflow-x-auto">
                <table className="w-full min-w-[640px] text-xs">
                  <thead>
                    <tr className="text-left text-[10.5px] text-gray-500 uppercase bg-gray-50">
                      <th className="px-3 py-2.5 font-bold">Reg. No.</th>
                      <th className="px-3 py-2.5 font-bold">Name</th>
                      <th className="px-3 py-2.5 font-bold text-right">Total consultations</th>
                      <th className="px-3 py-2.5 font-bold text-right">Fee</th>
                      <th className="px-3 py-2.5 font-bold text-right">Earning</th>
                      <th className="px-3 py-2.5 font-bold text-center">View</th>
                      <th className="px-3 py-2.5 font-bold text-center">Lock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {doctors.map((d) => (
                      <tr key={d.id} className={`border-t border-gray-100 ${d.isActive ? "" : "bg-rose-50/50"}`}>
                        <td className="px-3 py-2.5 font-mono text-gray-700 whitespace-nowrap">{d.doctorCode}</td>
                        <td className="px-3 py-2.5 font-bold text-gray-900">{d.name}</td>
                        <td className="px-3 py-2.5 text-right">{d.consultations}</td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">
                          {inr(d.feeInr)}
                          {d.requestedFeeInr !== null && (
                            <span className="block text-[10px] font-bold text-amber-700">asks {inr(d.requestedFeeInr)}</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold whitespace-nowrap">{inr(d.earned)}</td>
                        <td className="px-3 py-2.5 text-center">
                          <button
                            type="button"
                            title="View details"
                            aria-label={`View ${d.name}`}
                            onClick={() => setViewing(d)}
                            className="inline-flex p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 cursor-pointer"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <button
                            type="button"
                            title={d.isActive ? "Lock (ban) this doctor" : "Unlock this doctor"}
                            aria-label={d.isActive ? `Lock ${d.name}` : `Unlock ${d.name}`}
                            onClick={() => toggleLock(d)}
                            className={`inline-flex items-center gap-1 p-1.5 rounded-lg border text-[11px] font-bold cursor-pointer ${
                              d.isActive ? "border-gray-200 text-gray-500 hover:bg-gray-50" : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                            }`}
                          >
                            {d.isActive ? <LockOpen className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                            {!d.isActive && "Locked"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          {tab === "rules" && <RulesTab notify={notify} />}
        </>
      )}

      {viewing && (
        <DoctorDetails
          doctor={viewing}
          commission={commission}
          now={now}
          onClose={() => setViewing(null)}
          onEdit={() => {
            setEditing(viewing);
            setViewing(null);
            setFormOpen(true);
          }}
          onRenew={() => {
            setRenewFor(viewing);
            setViewing(null);
          }}
          onResetPassword={() => resetPassword(viewing)}
          onBank={() => openBank(viewing)}
          onFeeDecision={(decision) => {
            setViewing(null);
            act(() => marketService.decideFee(viewing.id, decision), decision === "approve" ? "Fee updated." : "Fee request rejected.");
          }}
        />
      )}

      {formOpen && (
        <DoctorForm
          doctor={editing}
          commission={commission}
          onClose={() => setFormOpen(false)}
          onSaved={async (createdLogin) => {
            setFormOpen(false);
            if (createdLogin) setLogin(createdLogin);
            notify(createdLogin ? `Doctor created: ${createdLogin.doctorCode}` : "Doctor updated.");
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
/* ONE DOCTOR (eye button)                                                    */
/* -------------------------------------------------------------------------- */
function DoctorDetails({
  doctor: d,
  commission,
  now,
  onClose,
  onEdit,
  onRenew,
  onResetPassword,
  onBank,
  onFeeDecision,
}: {
  doctor: RealDoctor;
  commission: number;
  now: number;
  onClose: () => void;
  onEdit: () => void;
  onRenew: () => void;
  onResetPassword: () => void;
  onBank: () => void;
  onFeeDecision: (decision: "approve" | "reject") => void;
}) {
  const left = daysLeft(d.planValidUntil, now);
  const issues = [
    !d.isActive && "Locked",
    left < 0 && "Plan expired",
    d.mustChangePassword && "Has not logged in yet",
    !d.mustChangePassword && !d.termsAcceptedAt && "Terms not accepted",
    !d.availability.weekly.length && "No working hours",
  ].filter(Boolean) as string[];
  const rows: Array<[string, React.ReactNode]> = [
    ["Registration number", <span key="code" className="font-mono">{d.doctorCode}</span>],
    ["Email", d.email],
    ["Qualification", d.qualification],
    ["Specialization", d.specialization],
    ["Experience", `${d.experienceYears} years`],
    ["Languages", d.languages.join(", ") || "—"],
    ["Fee", `${inr(d.feeInr)} → app price ${inr(appPrice(d.feeInr, commission))}`],
    ["Consultation length", `${d.consultMinutes} min`],
    ["Total consultations", String(d.consultations)],
    ["Total earning", inr(d.earned)],
    [
      "Platform plan",
      <span key="plan" className={left < 0 ? "text-rose-700 font-bold" : left <= 30 ? "text-amber-700 font-bold" : ""}>
        {left < 0 ? "Expired" : "Valid until"} {dateOnly(d.planValidUntil)}
        {left >= 0 && left <= 30 ? ` (${left} days left)` : ""}
      </span>,
    ],
    ["Last login", when(d.lastLoginAt)],
    [
      "Payout details",
      <span key="bank">
        {d.bankHint || "Not added yet"}
        {d.bankChanged && <b className="block text-amber-700">Changed, check before paying</b>}
      </span>,
    ],
  ];

  return (
    <Modal
      title={d.name}
      subtitle={`Reg. No. ${d.doctorCode}`}
      onClose={onClose}
      footer={
        <button type="button" className={ghostBtn} onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-black shrink-0" style={{ background: d.avatarColor }}>
          {initials(d.name)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-gray-900 truncate">{d.name}</p>
          <p className="text-[11px] text-gray-600">
            {d.qualification} · {d.specialization}
          </p>
        </div>
        {d.bookable ? (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">Bookable</span>
        ) : (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-600 border border-gray-200">Not bookable</span>
        )}
      </div>
      {issues.length > 0 && <p className="text-[11px] text-amber-700">⚠ {issues.join(" · ")}</p>}
      {d.requestedFeeInr !== null && (
        <div className="p-2 rounded-xl bg-amber-50 border border-amber-200 flex flex-wrap items-center gap-2 text-[11px] text-amber-900">
          Fee change requested: {inr(d.feeInr)} → <b>{inr(d.requestedFeeInr)}</b>
          <button type="button" className={primaryBtn} onClick={() => onFeeDecision("approve")}>
            Approve
          </button>
          <button type="button" className={ghostBtn} onClick={() => onFeeDecision("reject")}>
            Reject
          </button>
        </div>
      )}
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
        {rows.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-[10.5px] text-gray-500 font-bold">{label}</dt>
            <dd className="text-xs text-gray-900 break-words">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap gap-1.5 pt-3 border-t border-gray-100">
        <button type="button" className={ghostBtn} onClick={onEdit}>
          <Pencil className="w-3.5 h-3.5" /> Edit
        </button>
        <button type="button" className={ghostBtn} onClick={onRenew}>
          <CalendarPlus className="w-3.5 h-3.5" /> Record plan payment
        </button>
        <button type="button" className={ghostBtn} onClick={onResetPassword}>
          <KeyRound className="w-3.5 h-3.5" /> Reset password
        </button>
        <button type="button" className={ghostBtn} onClick={onBank}>
          <Landmark className="w-3.5 h-3.5" /> Payout details
        </button>
      </div>
    </Modal>
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
      subtitle={doctor ? `Reg. No. ${doctor.doctorCode}` : "The registration number (VC-DOC-000001, VC-DOC-000002 …) is created automatically."}
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
    cachedLoad("market:settings", () => marketService.getSettings(), (r) => setForm(r.settings)).catch((e) => notify(errorMessage(e), "error"));
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
