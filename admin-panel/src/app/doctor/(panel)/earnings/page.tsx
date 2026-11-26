"use client";

import React, { useEffect, useState } from "react";
import DoctorShell from "@/components/doctor/DoctorShell";
import { Spinner, errorMessage } from "@/components/ai-doctor/ui";
import { Card, Empty, Stat, dateOnly, inr, when } from "@/components/market/ui";
import { useToast } from "@/components/market/hooks";
import { doctorPanelService, DoctorEarnings } from "@/services/doctorPanel.service";
import { cachedLoad } from "@/lib/cache";

export default function EarningsPage() {
  const { toast, notify, dismiss } = useToast();
  const [data, setData] = useState<DoctorEarnings | null>(null);

  useEffect(() => {
    cachedLoad("doctor:earnings", () => doctorPanelService.earnings(), setData).catch((e) => notify(errorMessage(e), "error"));
  }, [notify]);

  return (
    <DoctorShell
      title="Earnings"
      subtitle="You get your full fee for every consultation with a report (the app adds its commission on top for patients). Paid every week."
      toast={toast}
      onDismissToast={dismiss}
    >
      {!data ? (
        <Spinner />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Total earned" value={inr(data.totals.earned)} tone="sky" />
            <Stat label="Paid to you" value={inr(data.totals.settled)} tone="green" />
            <Stat label="Waiting" value={inr(data.totals.pending)} />
            <Stat label="Payable now" value={inr(data.totals.payableNow)} hint="From finished weeks" tone="amber" />
          </div>
          <Card title="By week (Monday–Sunday)">
            {data.weeks.length === 0 ? (
              <Empty text="No earnings yet." />
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[10.5px] text-gray-500 uppercase">
                    <th className="py-1.5">Week from</th>
                    <th>Consultations</th>
                    <th>Earned</th>
                    <th>Paid</th>
                    <th>Waiting</th>
                  </tr>
                </thead>
                <tbody>
                  {data.weeks.map((w) => (
                    <tr key={w.weekStart} className="border-t border-gray-100">
                      <td className="py-1.5">
                        {dateOnly(`${w.weekStart}T12:00:00+05:30`)} {w.isCurrent && <span className="text-[10px] text-cyan-700 font-bold">(this week)</span>}
                      </td>
                      <td>{w.consultations}</td>
                      <td className="font-bold">{inr(w.amount)}</td>
                      <td className="text-emerald-700">{inr(w.settled)}</td>
                      <td>{inr(w.pending)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
          <Card title="Payouts received">
            {data.settlements.length === 0 ? (
              <Empty text="No payouts yet." />
            ) : (
              <div className="space-y-2">
                {data.settlements.map((s) => (
                  <div key={s.id} className="p-2.5 rounded-xl bg-gray-50 border border-gray-100 flex flex-wrap gap-2 items-center text-xs">
                    <span className="font-bold text-emerald-800">{inr(s.amount)}</span>
                    <span>{s.consultations} consultations</span>
                    <span className="text-gray-500">UTR {s.utr}</span>
                    <span className="text-gray-500 ml-auto">{when(s.paidAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </DoctorShell>
  );
}
