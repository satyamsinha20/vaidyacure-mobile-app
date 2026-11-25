"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";
import DoctorShell from "@/components/doctor/DoctorShell";
import { Spinner, errorMessage, primaryBtn } from "@/components/ai-doctor/ui";
import { Card, Stat, StatusBadge, dateOnly, inr, when } from "@/components/market/ui";
import { useNow, useToast } from "@/components/market/hooks";
import { doctorPanelService, DoctorDashboard } from "@/services/doctorPanel.service";

export default function DoctorHome() {
  const { toast, notify, dismiss } = useToast();
  const [data, setData] = useState<DoctorDashboard | null>(null);
  const now = useNow();

  useEffect(() => {
    const load = () =>
      doctorPanelService
        .dashboard()
        .then(setData)
        .catch((e) => notify(errorMessage(e), "error"));
    load();
    // Keep "next consultation" fresh while the panel is open
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [notify]);

  const planDays = data?.planValidUntil ? Math.ceil((new Date(data.planValidUntil).getTime() - now) / 86_400_000) : -1;

  return (
    <DoctorShell title="Dashboard" subtitle="Your consultations and earnings at a glance" toast={toast} onDismissToast={dismiss}>
      {!data ? (
        <Spinner />
      ) : (
        <>
          {(!data.hasHours || !data.hasBank || planDays <= 30) && (
            <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
              {!data.hasHours && (
                <p className="flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" /> Patients cannot book you yet: <Link className="underline font-bold" href="/doctor/availability">set your working hours</Link>.
                </p>
              )}
              {!data.hasBank && (
                <p className="flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" /> Add your bank or UPI details in <Link className="underline font-bold" href="/doctor/profile">Profile & payouts</Link> to get paid.
                </p>
              )}
              {planDays <= 30 && (
                <p className="flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {planDays < 0 ? "Your platform plan has expired: patients cannot book you." : `Your platform plan ends on ${dateOnly(data.planValidUntil)} (${planDays} days).`} Please contact VaidyaCure to renew.
                </p>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Today" value={data.todayCount} hint="Consultations booked for today" tone="sky" />
            <Stat label="Reports to send" value={data.reportsPending} hint="Earnings count after the report" tone={data.reportsPending ? "amber" : "gray"} />
            <Stat label="Waiting for payout" value={inr(data.earnings.pending)} hint={`${inr(data.earnings.payableNow)} from finished weeks`} tone="green" />
            <Stat label="Paid to you" value={inr(data.earnings.settled)} hint={`Total earned ${inr(data.earnings.earned)}`} />
          </div>
          <Card title="Next consultation">
            {data.next ? (
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[220px]">
                  <p className="text-sm font-bold">
                    {data.next.patient.name}, {data.next.patient.age} y, {data.next.patient.gender} {data.next.isFollowUp && "· follow-up"}
                  </p>
                  <p className="text-[11px] text-gray-600">{data.next.patient.problem}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">{when(data.next.slotStart)} · {data.next.consultMinutes} minutes</p>
                </div>
                <StatusBadge status={data.next.status} />
                <Link href={`/doctor/consultations/${data.next.id}`} className={primaryBtn}>
                  Open <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            ) : (
              <p className="text-xs text-gray-500">No upcoming consultation.</p>
            )}
          </Card>
        </>
      )}
    </DoctorShell>
  );
}
