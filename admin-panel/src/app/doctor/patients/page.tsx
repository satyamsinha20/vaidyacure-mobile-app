"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import DoctorShell from "@/components/doctor/DoctorShell";
import { Spinner, errorMessage } from "@/components/ai-doctor/ui";
import { Empty, StatusBadge, when } from "@/components/market/ui";
import { useToast } from "@/components/market/hooks";
import { doctorPanelService, DoctorPatient } from "@/services/doctorPanel.service";

export default function PatientsPage() {
  const { toast, notify, dismiss } = useToast();
  const [rows, setRows] = useState<DoctorPatient[] | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    doctorPanelService
      .patients()
      .then(setRows)
      .catch((e) => notify(errorMessage(e), "error"));
  }, [notify]);

  const shown = (rows ?? []).filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <DoctorShell title="My patients" subtitle="Patients you have consulted, with their reports. Contact details are never shown." toast={toast} onDismissToast={dismiss}>
      <input className="w-full max-w-xs h-9 px-3 rounded-xl bg-white border border-gray-200 text-xs" placeholder="Search by name" value={q} onChange={(e) => setQ(e.target.value)} />
      {!rows ? (
        <Spinner />
      ) : shown.length === 0 ? (
        <Empty text="No patients yet." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {shown.map((p) => (
            <div key={p.key} className="p-3 rounded-2xl bg-white border border-gray-200 space-y-2">
              <p className="text-sm font-bold">
                {p.name} · {p.age} y · {p.gender}
              </p>
              <p className="text-[11px] text-gray-500">
                {p.consultations} consultation{p.consultations === 1 ? "" : "s"} · last {when(p.lastAt)}
              </p>
              <div className="space-y-1">
                {p.bookings.map((b) => (
                  <Link key={b.id} href={`/doctor/consultations/${b.id}`} className="flex items-center gap-2 p-2 rounded-xl bg-gray-50 hover:bg-cyan-50 text-[11px]">
                    <span className="flex-1 truncate">
                      {when(b.slotStart)} · {b.problem}
                    </span>
                    {b.hasReport && <span className="text-emerald-700 font-bold">Report</span>}
                    <StatusBadge status={b.status} />
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </DoctorShell>
  );
}
