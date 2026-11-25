"use client";

import React, { useCallback, useEffect, useState } from "react";
import AdminPageShell from "@/components/admin/AdminPageShell";
import { Spinner, errorMessage } from "@/components/ai-doctor/ui";
import { Card, Stat, Tabs, inr, dateOnly } from "@/components/market/ui";
import { AccessState, useSuperAdmin, useToast } from "@/components/market/hooks";
import { marketService, Earnings } from "@/services/market.service";

const STATUS_LABELS: Record<string, string> = {
  completed: "Completed",
  confirmed: "Upcoming",
  doctor_no_show: "Doctor no-show",
  patient_no_show: "Patient no-show",
  cancelled: "Cancelled",
  payment_rejected: "Payment rejected",
  expired: "Expired",
  awaiting_payment: "Waiting for payment",
  payment_review: "Payment to check",
  in_progress: "In progress",
  chat_ended: "Report pending",
};

export default function EarningsPage() {
  const access = useSuperAdmin();
  const { toast, notify, dismiss } = useToast();
  const [range, setRange] = useState<"week" | "month" | "all">("week");
  const [data, setData] = useState<Earnings | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setData(await marketService.earnings(range));
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setLoading(false);
    }
  }, [range, notify]);

  useEffect(() => {
    if (access === "allowed") load();
  }, [access, load]);

  return (
    <AdminPageShell title="Earnings" subtitle="Money in, refunds, doctors' share and your income" toast={toast} onDismissToast={dismiss}>
      <AccessState access={access} />
      {access === "allowed" && (
        <>
          <Tabs
            value={range}
            onChange={(r) => {
              setLoading(true);
              setRange(r);
            }}
            tabs={[
              { key: "week", label: "This week" },
              { key: "month", label: "Last 30 days" },
              { key: "all", label: "All time" },
            ]}
          />
          {loading || !data ? (
            <Spinner />
          ) : (
            <>
              <p className="text-[11px] text-gray-500">From {dateOnly(data.from)} (India time)</p>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Stat label="Your income" value={inr(data.income.total)} hint={`Commission ${inr(data.income.commission)} + premium AI ${inr(data.income.premiumAi)}`} tone="green" />
                <Stat label="Doctor bookings paid" value={inr(data.collected.bookings)} hint="Verified UPI payments" />
                <Stat label="Wallet top-ups" value={inr(data.collected.walletTopups)} hint={`Unspent in wallets: ${inr(data.walletBalances)}`} />
                <Stat label="Refunds sent" value={inr(data.refunds.paid)} hint={data.refunds.due ? `${inr(data.refunds.due)} still to send` : "Nothing pending"} tone={data.refunds.due ? "rose" : "gray"} />
                <Stat label="Doctors earned" value={inr(data.doctors.earned)} hint="Their share of consultations" tone="sky" />
                <Stat label="Paid to doctors" value={inr(data.doctors.paid)} />
                <Stat label="Owed to doctors" value={inr(data.doctors.pending)} hint="All unpaid weeks" tone={data.doctors.pending ? "amber" : "gray"} />
              </div>
              <Card title="Doctor bookings by status">
                <div className="flex flex-wrap gap-2">
                  {Object.entries(data.bookingsByStatus).length === 0 && <p className="text-xs text-gray-500">No bookings in this period.</p>}
                  {Object.entries(data.bookingsByStatus).map(([status, n]) => (
                    <span key={status} className="px-2.5 py-1 rounded-full bg-gray-50 border border-gray-200 text-[11px]">
                      {STATUS_LABELS[status] ?? status}: <b>{n}</b>
                    </span>
                  ))}
                </div>
              </Card>
            </>
          )}
        </>
      )}
    </AdminPageShell>
  );
}
