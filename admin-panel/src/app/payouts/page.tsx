"use client";

import React, { useCallback, useEffect, useState } from "react";
import { BadgeIndianRupee, RefreshCw } from "lucide-react";
import AdminPageShell from "@/components/admin/AdminPageShell";
import { Field, Modal, Spinner, errorMessage, ghostBtn, inputClass, primaryBtn } from "@/components/ai-doctor/ui";
import { Card, CopyButton, Empty, dateOnly, inr, when } from "@/components/market/ui";
import { AccessState, useSuperAdmin, useToast } from "@/components/market/hooks";
import { marketService, BankDetails, PayoutRow, SettlementRow } from "@/services/market.service";

export default function PayoutsPage() {
  const access = useSuperAdmin();
  const { toast, notify, dismiss } = useToast();
  const [rows, setRows] = useState<PayoutRow[]>([]);
  const [history, setHistory] = useState<SettlementRow[]>([]);
  const [currentWeek, setCurrentWeek] = useState("");
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState<{ row: PayoutRow; bank: BankDetails | null } | null>(null);
  const [utr, setUtr] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await marketService.payouts();
      setRows(data.doctors);
      setHistory(data.history);
      setCurrentWeek(data.currentWeek);
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    if (access === "allowed") load();
  }, [access, load]);

  const openPay = async (row: PayoutRow) => {
    try {
      setUtr("");
      setNote("");
      setPaying({ row, bank: await marketService.getBank(row.doctorId) });
    } catch (error) {
      notify(errorMessage(error), "error");
    }
  };

  const settle = async () => {
    if (!paying) return;
    setBusy(true);
    try {
      const r = await marketService.settle(paying.row.doctorId, utr, note);
      notify(`${inr(r.amount)} for ${r.consultations} consultations marked as paid. The doctor was emailed.`);
      setPaying(null);
      await load();
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminPageShell
      title="Doctor Payouts"
      subtitle="Every Monday, pay each doctor for last week's consultations and record the UTR"
      toast={toast}
      onDismissToast={dismiss}
      actions={
        access === "allowed" && (
          <button type="button" className={ghostBtn} onClick={() => {
              setLoading(true);
              load();
            }} disabled={loading}>
            {loading ? <Spinner /> : <RefreshCw className="w-3.5 h-3.5" />} Refresh
          </button>
        )
      }
    >
      <AccessState access={access} />
      {access === "allowed" && (
        <>
          <Card
            title="To pay now"
            subtitle={`Finished weeks only (Monday–Sunday, India time). This week started ${dateOnly(`${currentWeek}T12:00:00+05:30`)} and is paid next week.`}
          >
            {loading ? (
              <Spinner />
            ) : rows.length === 0 ? (
              <Empty text="No doctor earnings yet." />
            ) : (
              <div className="space-y-2">
                {rows.map((r) => (
                  <div key={r.doctorId} className="p-3 rounded-xl border border-gray-200 flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-[200px]">
                      <p className="text-sm font-bold text-gray-900">
                        {r.name} <span className="font-mono text-[11px] text-gray-500">{r.doctorCode}</span>
                      </p>
                      <p className="text-[11px] text-gray-600">
                        {r.bankHint || "No payout details yet"}
                        {r.bankChanged && <b className="text-amber-700"> · details changed, check them</b>}
                      </p>
                      <p className="text-[10.5px] text-gray-400">Running this week: {inr(r.thisWeek)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-black text-gray-900">{inr(r.payable)}</p>
                      <p className="text-[10.5px] text-gray-500">{r.consultations} consultations</p>
                    </div>
                    <button type="button" className={primaryBtn} disabled={r.payable <= 0} onClick={() => openPay(r)}>
                      <BadgeIndianRupee className="w-3.5 h-3.5" /> Pay
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Payout history">
            {history.length === 0 ? (
              <Empty text="No payouts yet." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[10.5px] text-gray-500 uppercase">
                      <th className="py-1.5">Paid</th>
                      <th>Doctor</th>
                      <th>Amount</th>
                      <th>Consultations</th>
                      <th>Weeks</th>
                      <th>UTR</th>
                      <th>By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={h.id} className="border-t border-gray-100">
                        <td className="py-1.5">{when(h.paidAt)}</td>
                        <td>{h.doctorName}</td>
                        <td className="font-bold">{inr(h.amount)}</td>
                        <td>{h.consultations}</td>
                        <td>{h.weeks.join(", ")}</td>
                        <td className="font-mono">{h.utr}</td>
                        <td className="text-gray-500">{h.paidByEmail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {paying && (
        <Modal
          title={`Pay ${paying.row.name}: ${inr(paying.row.payable)}`}
          subtitle="Send the money from your bank / UPI app first, then record the UTR here."
          onClose={() => setPaying(null)}
          footer={
            <>
              <button type="button" className={ghostBtn} onClick={() => setPaying(null)}>
                Cancel
              </button>
              <button type="button" className={primaryBtn} disabled={busy || utr.trim().length < 6} onClick={settle}>
                {busy && <Spinner />} Mark as paid
              </button>
            </>
          }
        >
          {paying.bank ? (
            (
              [
                ["Account holder", paying.bank.accountName],
                ["Account number", paying.bank.accountNumber],
                ["IFSC", paying.bank.ifsc],
                ["UPI id", paying.bank.upiId],
              ] as const
            )
              .filter(([, v]) => v)
              .map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-2 p-2 rounded-xl bg-gray-50 border border-gray-200">
                  <div>
                    <p className="text-[10.5px] text-gray-500 font-bold">{label}</p>
                    <p className="text-sm font-mono">{value}</p>
                  </div>
                  <CopyButton text={value} />
                </div>
              ))
          ) : (
            <p className="text-xs text-amber-700">The doctor has not added payout details yet. Ask them to add them in their panel.</p>
          )}
          <Field label="UTR / bank reference of your payment">
            <input className={inputClass} value={utr} onChange={(e) => setUtr(e.target.value.trim())} />
          </Field>
          <Field label="Note (optional)">
            <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </Modal>
      )}
    </AdminPageShell>
  );
}
