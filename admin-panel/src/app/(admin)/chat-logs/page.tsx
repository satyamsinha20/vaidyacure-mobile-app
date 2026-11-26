"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Flag, RefreshCw, ShieldAlert } from "lucide-react";
import AdminPageShell from "@/components/admin/AdminPageShell";
import { Modal, Spinner, Toggle, errorMessage, ghostBtn } from "@/components/ai-doctor/ui";
import { Empty, StatusBadge, when } from "@/components/market/ui";
import { AccessState, useSuperAdmin, useToast } from "@/components/market/hooks";
import { marketService, AdminBooking, ChatLog } from "@/services/market.service";
import { cachedLoad } from "@/lib/cache";

const FLAG_LABELS: Record<string, string> = {
  phone: "Phone number",
  email: "Email",
  upi: "UPI id",
  account_number: "Account number",
  link: "Link",
  payment_words: "Payment outside app",
  abuse: "Abusive words",
};

export default function ChatLogsPage() {
  const access = useSuperAdmin();
  const { toast, notify, dismiss } = useToast();
  const [flaggedOnly, setFlaggedOnly] = useState(true);
  const [rows, setRows] = useState<AdminBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<ChatLog | null>(null);

  const load = useCallback(async (useCache = true) => {
    try {
      await cachedLoad(`market:chats:${flaggedOnly ? "flagged" : "all"}`, () => marketService.listChats(flaggedOnly), (value) => {
        setRows(value);
        setLoading(false);
      }, useCache);
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setLoading(false);
    }
  }, [flaggedOnly, notify]);

  useEffect(() => {
    if (access === "allowed") load();
  }, [access, load]);

  return (
    <AdminPageShell
      title="Chat Safety Log"
      subtitle="Real-doctor chats, for safety only. Patients and doctors are told chats are recorded; every opening is logged."
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
          <div className="flex items-center gap-3">
            <Toggle
              checked={flaggedOnly}
              onChange={(v) => {
                setLoading(true);
                setFlaggedOnly(v);
              }}
              label="Only flagged chats"
            />
            <p className="text-[11px] text-gray-500">Flags: contact details, payment outside the app, abusive words.</p>
          </div>
          {loading ? (
            <Spinner />
          ) : rows.length === 0 ? (
            <Empty text={flaggedOnly ? "No flagged chats." : "No chats yet."} />
          ) : (
            <div className="space-y-2">
              {rows.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={async () => {
                    try {
                      setOpen(await marketService.getChat(b.id));
                    } catch (error) {
                      notify(errorMessage(error), "error");
                    }
                  }}
                  className="w-full text-left p-3 rounded-2xl bg-white border border-gray-200 hover:border-emerald-300 flex flex-wrap items-center gap-3 cursor-pointer"
                >
                  {b.flagged ? <Flag className="w-4 h-4 text-rose-600" /> : <ShieldAlert className="w-4 h-4 text-gray-300" />}
                  <div className="flex-1 min-w-[200px]">
                    <p className="text-sm font-bold text-gray-900">
                      {b.doctorName} ↔ {b.patientName}
                    </p>
                    <p className="text-[11px] text-gray-500">
                      {when(b.slotStart)} · {b.messages} messages · {b.patientEmail}
                    </p>
                  </div>
                  <StatusBadge status={b.status} />
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {open && (
        <Modal title={`${open.booking.doctorName} ↔ ${open.booking.patientName}`} subtitle={when(open.booking.slotStart)} onClose={() => setOpen(null)} footer={<button type="button" className={ghostBtn} onClick={() => setOpen(null)}>Close</button>}>
          <div className="space-y-2">
            {open.messages.map((m) => (
              <div key={m.seq} className={`p-2 rounded-xl text-xs ${m.from === "doctor" ? "bg-sky-50 border border-sky-100" : "bg-gray-50 border border-gray-100"}`}>
                <p className="text-[10px] font-bold text-gray-500">
                  {m.from === "doctor" ? "Doctor" : "Patient"} · {when(m.at)}
                </p>
                <p className="text-gray-900 whitespace-pre-wrap break-words">{m.text}</p>
                {m.flags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {m.flags.map((f) => (
                      <span key={f} className="px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-bold">
                        {FLAG_LABELS[f] ?? f}
                      </span>
                    ))}
                    <span className="text-[10px] text-gray-500">Shown to the other side: “{m.shown}”</span>
                  </div>
                )}
              </div>
            ))}
            {open.messages.length === 0 && <p className="text-xs text-gray-500">No messages.</p>}
          </div>
        </Modal>
      )}
    </AdminPageShell>
  );
}
