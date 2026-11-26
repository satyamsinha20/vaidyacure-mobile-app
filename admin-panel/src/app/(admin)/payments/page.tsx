"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Check, X, RefreshCw, IndianRupee } from "lucide-react";
import AdminPageShell from "@/components/admin/AdminPageShell";
import { Spinner, dangerBtn, errorMessage, ghostBtn, primaryBtn } from "@/components/ai-doctor/ui";
import { CopyButton, Empty, StatusBadge, Tabs, inr, when } from "@/components/market/ui";
import { AccessState, PromptModal, useNow, useSuperAdmin, useToast } from "@/components/market/hooks";
import { marketService, AdminBooking, Topup } from "@/services/market.service";
import { cachedLoad } from "@/lib/cache";

type Tab = "bookings" | "topups" | "refunds";
type Dialog =
  | { kind: "rejectBooking"; booking: AdminBooking }
  | { kind: "rejectTopup"; topup: Topup }
  | { kind: "approveTopup"; topup: Topup }
  | { kind: "refund"; booking: AdminBooking }
  | null;

const UTR = /^\d{12}$/;
const REFUND_REASONS: Record<string, string> = {
  doctor_no_show: "Doctor did not join (full refund)",
  patient_no_show: "Patient did not join (30% kept)",
  admin_cancel: "Cancelled by admin",
  not_verified: "Payment not verified before the slot",
};

export default function PaymentsPage() {
  const access = useSuperAdmin();
  const { toast, notify, dismiss } = useToast();
  const [tab, setTab] = useState<Tab>("bookings");
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [topups, setTopups] = useState<Topup[]>([]);
  const [refunds, setRefunds] = useState<AdminBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const now = useNow();

  const load = useCallback(async (useCache = true) => {
    try {
      await cachedLoad(
        "market:payments",
        () => Promise.all([marketService.paymentsToVerify(), marketService.listTopups("pending"), marketService.listRefunds("due")]),
        ([b, t, r]) => {
          setBookings(b);
          setTopups(t);
          setRefunds(r);
          setLoading(false);
        },
        useCache
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

  const run = async (id: string, action: () => Promise<unknown>, message: string) => {
    setBusyId(id);
    try {
      await action();
      notify(message);
      setDialog(null);
      await load();
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AdminPageShell
      title="Payments"
      subtitle="Check UPI payments against your bank app, approve wallet top-ups and send refunds"
      toast={toast}
      onDismissToast={dismiss}
      actions={
        access === "allowed" && (
          <button type="button" className={ghostBtn} onClick={() => {
              setLoading(true);
              load(false);
            }} disabled={loading}>
            {loading ? <Spinner /> : <RefreshCw className="w-3.5 h-3.5" />} Refresh
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
              { key: "bookings", label: "Doctor bookings to verify", count: bookings.length },
              { key: "topups", label: "Wallet top-ups", count: topups.length },
              { key: "refunds", label: "Refunds to send", count: refunds.length },
            ]}
          />
          <p className="text-[11px] text-gray-500">
            Open your bank / UPI app, find the payment by its 12-digit UTR, and check the amount before approving. Approving tells the
            patient and the doctor by email.
          </p>

          {loading ? (
            <div className="flex items-center gap-2 text-xs text-gray-500 p-4">
              <Spinner /> Loading…
            </div>
          ) : tab === "bookings" ? (
            bookings.length === 0 ? (
              <Empty text="No payments waiting. New UTRs from patients appear here." />
            ) : (
              <div className="space-y-2">
                {bookings.map((b) => (
                  <div key={b.id} className="p-3 rounded-2xl bg-white border border-gray-200 flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-[220px]">
                      <p className="text-sm font-bold text-gray-900">
                        {inr(b.price.total)} · UTR <span className="font-mono">{b.payment.utr}</span>
                      </p>
                      <p className="text-[11px] text-gray-600">
                        {b.patientEmail} (paid from {b.payment.payerUpi}) → {b.doctorName} · {when(b.slotStart)}
                      </p>
                      <p className="text-[10.5px] text-gray-400">
                        Fee {inr(b.price.fee)} + commission {inr(b.price.commission)} · sent {when(b.payment.submittedAt)}
                        {b.isFollowUp ? " · follow-up" : ""}
                      </p>
                    </div>
                    <CopyButton text={b.payment.utr} label="UTR" />
                    <button type="button" className={primaryBtn} disabled={busyId === b.id} onClick={() => run(b.id, () => marketService.approvePayment(b.id), "Payment approved, booking confirmed.")}>
                      {busyId === b.id ? <Spinner /> : <Check className="w-3.5 h-3.5" />} Approve
                    </button>
                    <button type="button" className={dangerBtn} onClick={() => setDialog({ kind: "rejectBooking", booking: b })}>
                      <X className="w-3.5 h-3.5" /> Reject
                    </button>
                  </div>
                ))}
              </div>
            )
          ) : tab === "topups" ? (
            topups.length === 0 ? (
              <Empty text="No wallet top-ups waiting." />
            ) : (
              <div className="space-y-2">
                {topups.map((t) => (
                  <div key={t.id} className="p-3 rounded-2xl bg-white border border-gray-200 flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-[220px]">
                      <p className="text-sm font-bold text-gray-900">
                        {inr(t.amount)} · UTR <span className="font-mono">{t.utr}</span>
                      </p>
                      <p className="text-[11px] text-gray-600">
                        {t.patientEmail} · wallet now {inr(t.walletBalance)} · {when(t.createdAt)}
                      </p>
                    </div>
                    <CopyButton text={t.utr} label="UTR" />
                    <button type="button" className={primaryBtn} disabled={busyId === t.id} onClick={() => run(t.id, () => marketService.approveTopup(t.id), `${inr(t.amount)} added to the wallet.`)}>
                      {busyId === t.id ? <Spinner /> : <Check className="w-3.5 h-3.5" />} Add {inr(t.amount)}
                    </button>
                    <button type="button" className={ghostBtn} onClick={() => setDialog({ kind: "approveTopup", topup: t })}>
                      <IndianRupee className="w-3.5 h-3.5" /> Other amount
                    </button>
                    <button type="button" className={dangerBtn} onClick={() => setDialog({ kind: "rejectTopup", topup: t })}>
                      <X className="w-3.5 h-3.5" /> Reject
                    </button>
                  </div>
                ))}
              </div>
            )
          ) : refunds.length === 0 ? (
            <Empty text="No refunds to send." />
          ) : (
            <div className="space-y-2">
              {refunds.map((b) => {
                const overdue = b.refund?.dueBy ? new Date(b.refund.dueBy).getTime() < now : false;
                return (
                  <div key={b.id} className={`p-3 rounded-2xl bg-white border flex flex-wrap items-center gap-3 ${overdue ? "border-rose-300" : "border-gray-200"}`}>
                    <div className="flex-1 min-w-[220px]">
                      <p className="text-sm font-bold text-gray-900">
                        Refund {inr(b.refund?.amount)} to <span className="font-mono">{b.refundTo || "ask the patient"}</span>
                      </p>
                      <p className="text-[11px] text-gray-600">
                        {b.patientEmail} · {b.doctorName} · {when(b.slotStart)} · {REFUND_REASONS[b.refund?.reason ?? ""] ?? b.refund?.reason}
                      </p>
                      <p className={`text-[10.5px] ${overdue ? "text-rose-700 font-bold" : "text-gray-400"}`}>
                        Send by {when(b.refund?.dueBy)} {overdue ? "(overdue)" : ""} · paid UTR {b.payment.utr || "—"}
                      </p>
                    </div>
                    <StatusBadge status={b.status} />
                    {b.refundTo && <CopyButton text={b.refundTo} label="UPI" />}
                    <button type="button" className={primaryBtn} onClick={() => setDialog({ kind: "refund", booking: b })}>
                      <Check className="w-3.5 h-3.5" /> Mark refunded
                    </button>
                    {b.refund?.reason === "not_verified" && (
                      <button
                        type="button"
                        className={ghostBtn}
                        disabled={busyId === b.id}
                        onClick={() => run(b.id, () => marketService.refundDismiss(b.id), "Closed: no payment was received.")}
                      >
                        No money received
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {dialog?.kind === "rejectBooking" && (
        <PromptModal
          title="Reject this payment?"
          subtitle={`${inr(dialog.booking.price.total)} · UTR ${dialog.booking.payment.utr}`}
          label="Reason (sent to the patient)"
          placeholder="No payment with this UTR / amount does not match"
          confirmLabel="Reject"
          onClose={() => setDialog(null)}
          onSubmit={(reason) => run(dialog.booking.id, () => marketService.rejectPayment(dialog.booking.id, reason), "Payment rejected, slot freed.")}
        />
      )}
      {dialog?.kind === "rejectTopup" && (
        <PromptModal
          title="Reject this top-up?"
          subtitle={`${inr(dialog.topup.amount)} · UTR ${dialog.topup.utr}`}
          label="Reason (sent to the patient)"
          confirmLabel="Reject"
          onClose={() => setDialog(null)}
          onSubmit={(reason) => run(dialog.topup.id, () => marketService.rejectTopup(dialog.topup.id, reason), "Top-up rejected.")}
        />
      )}
      {dialog?.kind === "approveTopup" && (
        <PromptModal
          title="Credit a different amount"
          subtitle={`Requested ${inr(dialog.topup.amount)} · use this if the patient paid another amount`}
          label="Amount actually received (₹)"
          pattern={/^\d{1,4}$/}
          patternHint="Whole rupees, 1 to 5000"
          confirmLabel="Add to wallet"
          onClose={() => setDialog(null)}
          onSubmit={(value) => run(dialog.topup.id, () => marketService.approveTopup(dialog.topup.id, Number(value)), `${inr(Number(value))} added.`)}
        />
      )}
      {dialog?.kind === "refund" && (
        <PromptModal
          title={`Refund ${inr(dialog.booking.refund?.amount)}`}
          subtitle={`Send it to ${dialog.booking.refundTo || "the patient's UPI"} from your UPI app, then enter the UTR here.`}
          label="Refund UTR (12 digits)"
          pattern={UTR}
          patternHint="Enter the 12-digit UPI reference number"
          confirmLabel="Mark refunded"
          onClose={() => setDialog(null)}
          onSubmit={(utr) => run(dialog.booking.id, () => marketService.refundPaid(dialog.booking.id, utr), "Refund recorded and the patient was told.")}
        />
      )}
    </AdminPageShell>
  );
}
