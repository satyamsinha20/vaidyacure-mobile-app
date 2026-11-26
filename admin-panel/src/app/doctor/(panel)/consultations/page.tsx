"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import DoctorShell from "@/components/doctor/DoctorShell";
import { Spinner, errorMessage } from "@/components/ai-doctor/ui";
import { Empty, StatusBadge, Tabs, inr, when } from "@/components/market/ui";
import { useToast } from "@/components/market/hooks";
import { doctorPanelService, DoctorBooking } from "@/services/doctorPanel.service";
import { cachedLoad } from "@/lib/cache";

type Scope = "upcoming" | "today" | "past";

export default function ConsultationsPage() {
  const { toast, notify, dismiss } = useToast();
  const [scope, setScope] = useState<Scope>("upcoming");
  const [rows, setRows] = useState<DoctorBooking[] | null>(null);

  useEffect(() => {
    cachedLoad(`doctor:bookings:${scope}`, () => doctorPanelService.bookings(scope), setRows).catch((e) => notify(errorMessage(e), "error"));
  }, [scope, notify]);

  return (
    <DoctorShell title="Consultations" subtitle="Open a consultation to chat with the patient and send the report" toast={toast} onDismissToast={dismiss}>
      <Tabs
        value={scope}
        onChange={(s) => {
          setRows(null);
          setScope(s);
        }}
        tabs={[
          { key: "upcoming", label: "Upcoming" },
          { key: "today", label: "Today" },
          { key: "past", label: "Past" },
        ]}
      />
      {!rows ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <Empty text="Nothing here yet." />
      ) : (
        <div className="space-y-2">
          {rows.map((b) => (
            <Link key={b.id} href={`/doctor/consultations/${b.id}`} className="block p-3 rounded-2xl bg-white border border-gray-200 hover:border-cyan-300">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[220px]">
                  <p className="text-sm font-bold">
                    {b.patient.name} · {b.patient.age} y · {b.patient.gender}
                    {b.isFollowUp && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-cyan-50 text-cyan-800 border border-cyan-200">Free follow-up</span>}
                  </p>
                  <p className="text-[11px] text-gray-600 truncate">{b.patient.problem}</p>
                  <p className="text-[11px] text-gray-500">{when(b.slotStart)} · {b.consultMinutes} min</p>
                </div>
                {b.earnings && <span className="text-xs font-bold text-emerald-700">{inr(b.earnings.amount)}</span>}
                <StatusBadge status={b.status} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </DoctorShell>
  );
}
