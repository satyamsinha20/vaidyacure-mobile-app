"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Plus, Send, Square, Trash2 } from "lucide-react";
import DoctorShell from "@/components/doctor/DoctorShell";
import { Field, Spinner, dangerBtn, errorMessage, ghostBtn, inputClass, primaryBtn } from "@/components/ai-doctor/ui";
import { Card, StatusBadge, clock, minutesLeft, when } from "@/components/market/ui";
import { useToast } from "@/components/market/hooks";
import { doctorPanelService, ChatState, DoctorBooking, DoctorMe, DoctorReport, LiveMessage, ThreadItem } from "@/services/doctorPanel.service";

const POLL_MS = 2500;
const LIVE = ["confirmed", "in_progress"];
const emptyReport = (): DoctorReport => ({ diagnosis: "", advice: "", medicines: [], tests: [], followUpAdvice: "" });

export default function ConsultationPage() {
  const { id } = useParams<{ id: string }>();
  const { toast, notify, dismiss } = useToast();
  const [me, setMe] = useState<DoctorMe | null>(null);
  const [booking, setBooking] = useState<DoctorBooking | null>(null);
  const [thread, setThread] = useState<ThreadItem[]>([]);
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [state, setState] = useState<ChatState | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [report, setReport] = useState<DoctorReport>(emptyReport());
  const [testsText, setTestsText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const lastSeq = useRef(0);
  const bottom = useRef<HTMLDivElement>(null);

  const loadDetail = useCallback(async () => {
    try {
      const data = await doctorPanelService.booking(id);
      setBooking(data.booking);
      setThread(data.thread.filter((t) => t.id !== id));
    } catch (e) {
      notify(errorMessage(e), "error");
    }
  }, [id, notify]);

  const poll = useCallback(async () => {
    try {
      const data = await doctorPanelService.messages(id, lastSeq.current);
      if (data.messages.length) {
        lastSeq.current = data.messages[data.messages.length - 1].seq;
        setMessages((m) => [...m, ...data.messages.filter((x) => !m.some((y) => y.seq === x.seq))]);
      }
      setState(data.state);
    } catch {
      /* the next poll retries */
    }
  }, [id]);

  useEffect(() => {
    const first = setTimeout(() => {
      loadDetail();
      poll();
    }, 0);
    return () => clearTimeout(first);
  }, [loadDetail, poll]);

  // Poll while the consultation can still change, tick the clocks every second
  useEffect(() => {
    if (state && !LIVE.includes(state.status)) return;
    const timer = setInterval(poll, POLL_MS);
    return () => clearInterval(timer);
  }, [state, poll]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages.length]);
  // When the status changes (e.g. chat ended), refresh the booking details
  const lastStatus = useRef<string | null>(null);
  useEffect(() => {
    if (state && state.status !== lastStatus.current) {
      if (lastStatus.current !== null) loadDetail();
      lastStatus.current = state.status;
    }
  }, [state, loadDetail]);

  const send = async () => {
    const value = text.trim();
    if (!value) return;
    setSending(true);
    try {
      const data = await doctorPanelService.sendMessage(id, value);
      setText("");
      lastSeq.current = Math.max(lastSeq.current, data.message.seq);
      setMessages((m) => (m.some((x) => x.seq === data.message.seq) ? m : [...m, data.message]));
      setState(data.state);
    } catch (e) {
      notify(errorMessage(e), "error");
    } finally {
      setSending(false);
    }
  };

  const endChat = async () => {
    if (!window.confirm("End the chat now? You can then write the report.")) return;
    try {
      await doctorPanelService.endChat(id);
      await poll();
    } catch (e) {
      notify(errorMessage(e), "error");
    }
  };

  const submitReport = async () => {
    setSubmitting(true);
    try {
      await doctorPanelService.sendReport(id, {
        ...report,
        medicines: report.medicines.filter((m) => m.name.trim()),
        tests: testsText.split("\n").map((t) => t.trim()).filter(Boolean),
      });
      notify("Report sent to the patient.");
      await Promise.all([loadDetail(), poll()]);
    } catch (e) {
      notify(errorMessage(e), "error");
    } finally {
      setSubmitting(false);
    }
  };

  const status = state?.status ?? booking?.status ?? "";
  const slotStart = state ? new Date(state.slotStart).getTime() : 0;
  const joinBy = slotStart + (me?.rules.doctorJoinMinutes ?? 5) * 60_000;
  const canType = (status === "confirmed" && now >= slotStart && now < joinBy) || (status === "in_progress" && state?.chatEndsAt && new Date(state.chatEndsAt).getTime() > now);
  const canReport = !booking?.report && Boolean(state?.patientRepliedAt) && (status === "chat_ended" || status === "in_progress");

  const banner = (() => {
    if (!state) return null;
    if (status === "confirmed" && now < slotStart) return { tone: "sky", text: `Starts at ${when(state.slotStart)}. You can send the first message at that time.` };
    if (status === "confirmed")
      return { tone: "amber", text: `It's time: send your first message now. Start within ${clock(minutesLeft(new Date(joinBy).toISOString(), now))} or the patient gets a full refund.` };
    if (status === "in_progress" && !state.patientRepliedAt)
      return { tone: "amber", text: `Waiting for the patient to reply: ${clock(minutesLeft(state.replyBy, now))} left. If they do not reply, the no-show rule applies.` };
    if (status === "in_progress") return { tone: "green", text: `Consultation running: ${clock(minutesLeft(state.chatEndsAt, now))} left.` };
    if (status === "chat_ended") return { tone: "violet", text: "The chat has ended. Please send the report; your fee counts after the report." };
    if (status === "completed") return { tone: "green", text: "Report sent. This consultation is complete." };
    if (status === "doctor_no_show") return { tone: "rose", text: "The chat was not started in time, so the patient was refunded." };
    if (status === "patient_no_show") return { tone: "orange", text: "The patient did not reply in time. Your share of the kept amount is in your earnings." };
    return { tone: "gray", text: `This consultation is ${status.replace(/_/g, " ")}.` };
  })();

  const tones: Record<string, string> = {
    sky: "bg-sky-50 border-sky-200 text-sky-900",
    amber: "bg-amber-50 border-amber-200 text-amber-900",
    green: "bg-emerald-50 border-emerald-200 text-emerald-900",
    violet: "bg-violet-50 border-violet-200 text-violet-900",
    rose: "bg-rose-50 border-rose-200 text-rose-900",
    orange: "bg-orange-50 border-orange-200 text-orange-900",
    gray: "bg-gray-50 border-gray-200 text-gray-700",
  };

  return (
    <DoctorShell
      title={booking ? `${booking.patient.name}` : "Consultation"}
      subtitle={booking ? `${when(booking.slotStart)} · ${booking.consultMinutes} minutes${booking.isFollowUp ? " · free follow-up" : ""}` : undefined}
      toast={toast}
      onDismissToast={dismiss}
      onMe={setMe}
      actions={
        <Link href="/doctor/consultations" className={ghostBtn}>
          <ArrowLeft className="w-3.5 h-3.5" /> All consultations
        </Link>
      }
    >
      {!booking ? (
        <Spinner />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-3">
          <div className="space-y-3">
            {banner && <div className={`p-3 rounded-2xl border text-xs font-semibold ${tones[banner.tone]}`}>{banner.text}</div>}
            <section className="rounded-2xl bg-white border border-gray-200 flex flex-col h-[60vh]">
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {messages.length === 0 && <p className="text-xs text-gray-400 text-center mt-8">No messages yet.</p>}
                {messages.map((m) => (
                  <div key={m.seq} className={`flex ${m.from === "doctor" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${m.from === "doctor" ? "bg-[#0B4A5C] text-white rounded-br-md" : "bg-gray-100 text-gray-900 rounded-bl-md"}`}>
                      {m.text}
                      <p className={`text-[10px] mt-0.5 ${m.from === "doctor" ? "text-cyan-100/70" : "text-gray-400"}`}>{when(m.at)}</p>
                    </div>
                  </div>
                ))}
                <div ref={bottom} />
              </div>
              <div className="border-t border-gray-100 p-2 flex items-end gap-2">
                <textarea
                  className={`${inputClass} h-auto min-h-[40px] max-h-32 py-2 resize-none`}
                  rows={2}
                  maxLength={1000}
                  disabled={!canType || sending}
                  placeholder={canType ? "Type your message… (Enter to send, Shift+Enter for a new line)" : "Chat is not open"}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                />
                <button type="button" className={primaryBtn} disabled={!canType || sending || !text.trim()} onClick={send}>
                  {sending ? <Spinner /> : <Send className="w-3.5 h-3.5" />}
                </button>
              </div>
            </section>
            <p className="text-[10.5px] text-gray-500">
              Chats are recorded for patient safety. Phone numbers, emails, UPI ids and account numbers are hidden automatically. Never ask for payment outside VaidyaCure.
            </p>
            {status === "in_progress" && state?.patientRepliedAt && (
              <button type="button" className={dangerBtn} onClick={endChat}>
                <Square className="w-3.5 h-3.5" /> End chat now
              </button>
            )}

            {booking.report && (
              <Card title="Report sent" subtitle={when(booking.report.sentAt)}>
                <ReportView report={booking.report} />
              </Card>
            )}
            {canReport && (
              <Card title="Write the report" subtitle="Only this patient will see it in the app. Include doses and how long to take medicines.">
                <Field label="Diagnosis / assessment">
                  <textarea className={`${inputClass} h-20 py-2`} maxLength={1500} value={report.diagnosis} onChange={(e) => setReport({ ...report, diagnosis: e.target.value })} />
                </Field>
                <Field label="Advice">
                  <textarea className={`${inputClass} h-24 py-2`} maxLength={3000} value={report.advice} onChange={(e) => setReport({ ...report, advice: e.target.value })} />
                </Field>
                <div className="space-y-2">
                  <p className="text-[11px] font-bold text-gray-700">Medicines</p>
                  {report.medicines.map((m, i) => (
                    <div key={i} className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 items-center">
                      {(["name", "dose", "frequency", "duration", "notes"] as const).map((k) => (
                        <input
                          key={k}
                          className={inputClass}
                          placeholder={k === "name" ? "Medicine" : k[0].toUpperCase() + k.slice(1)}
                          value={m[k]}
                          onChange={(e) => setReport({ ...report, medicines: report.medicines.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)) })}
                        />
                      ))}
                      <button type="button" className="text-gray-400 hover:text-rose-600 cursor-pointer justify-self-start" onClick={() => setReport({ ...report, medicines: report.medicines.filter((_, j) => j !== i) })}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className={ghostBtn}
                    onClick={() => setReport({ ...report, medicines: [...report.medicines, { name: "", dose: "", frequency: "", duration: "", notes: "" }] })}
                  >
                    <Plus className="w-3.5 h-3.5" /> Add medicine
                  </button>
                </div>
                <Field label="Tests (one per line)">
                  <textarea className={`${inputClass} h-16 py-2`} value={testsText} onChange={(e) => setTestsText(e.target.value)} />
                </Field>
                <Field label="Follow-up advice">
                  <input className={inputClass} maxLength={500} value={report.followUpAdvice} onChange={(e) => setReport({ ...report, followUpAdvice: e.target.value })} />
                </Field>
                <button type="button" className={primaryBtn} disabled={submitting || report.diagnosis.trim().length < 3} onClick={submitReport}>
                  {submitting && <Spinner />} Send report to patient
                </button>
              </Card>
            )}
          </div>

          <div className="space-y-3">
            <Card title="Patient">
              <p className="text-sm font-bold">{booking.patient.name}</p>
              <p className="text-[11px] text-gray-600">
                {booking.patient.age} years · {booking.patient.gender} · {booking.patient.heightCm} cm · {booking.patient.weightKg} kg
                {booking.patient.pregnancy && !["not_applicable", "no"].includes(booking.patient.pregnancy) ? ` · ${booking.patient.pregnancy.replace("_", " ")}` : ""}
              </p>
              <p className="text-xs text-gray-800 p-2 rounded-xl bg-gray-50 border border-gray-100">{booking.patient.problem}</p>
              <StatusBadge status={status} />
            </Card>
            {thread.length > 0 && (
              <Card title="Earlier consultations" subtitle="Same patient, same follow-up chain">
                {thread.map((t) => (
                  <details key={t.id} className="p-2 rounded-xl border border-gray-100">
                    <summary className="text-xs font-bold cursor-pointer">
                      {when(t.slotStart)} {t.isFollowUp ? "· follow-up" : ""}
                    </summary>
                    <p className="text-[11px] text-gray-600 mt-1">{t.problem}</p>
                    {t.report && (
                      <div className="mt-1">
                        <ReportView report={t.report} />
                      </div>
                    )}
                    <div className="mt-1 space-y-1 max-h-48 overflow-y-auto">
                      {t.messages.map((m) => (
                        <p key={m.seq} className="text-[11px]">
                          <b>{m.from === "doctor" ? "You" : "Patient"}:</b> {m.text}
                        </p>
                      ))}
                    </div>
                  </details>
                ))}
              </Card>
            )}
          </div>
        </div>
      )}
    </DoctorShell>
  );
}

function ReportView({ report }: { report: DoctorReport }) {
  return (
    <div className="space-y-1.5 text-xs text-gray-800">
      <p>
        <b>Diagnosis:</b> {report.diagnosis}
      </p>
      {report.advice && (
        <p className="whitespace-pre-wrap">
          <b>Advice:</b> {report.advice}
        </p>
      )}
      {report.medicines.length > 0 && (
        <ul className="list-disc pl-4">
          {report.medicines.map((m, i) => (
            <li key={i}>
              {m.name} {[m.dose, m.frequency, m.duration].filter(Boolean).join(" · ")} {m.notes && `(${m.notes})`}
            </li>
          ))}
        </ul>
      )}
      {report.tests.length > 0 && (
        <p>
          <b>Tests:</b> {report.tests.join(", ")}
        </p>
      )}
      {report.followUpAdvice && (
        <p>
          <b>Follow-up:</b> {report.followUpAdvice}
        </p>
      )}
    </div>
  );
}
