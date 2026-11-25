"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, RotateCcw, Save, Send } from "lucide-react";
import { Field, Spinner, Toggle, dangerBtn, errorMessage, ghostBtn, inputClass, primaryBtn } from "@/components/ai-doctor/ui";
import { Card, CopyButton, when } from "@/components/market/ui";
import { settingsService, EmailTemplateItem, RenderedEmail, SmtpConfig } from "@/services/settings.service";

type Notify = (message: string, kind?: "success" | "error") => void;

/** Settings > SMTP: the email account, reminder URL and the text of every email */
export default function SmtpTab({ notify }: { notify: Notify }) {
  return (
    <div className="space-y-3">
      <SmtpCard notify={notify} />
      <TemplatesCard notify={notify} />
    </div>
  );
}

function SmtpCard({ notify }: { notify: Notify }) {
  const [cfg, setCfg] = useState<SmtpConfig | null>(null);
  const [password, setPassword] = useState("");
  const [testTo, setTestTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [cronUrl, setCronUrl] = useState<string | null>(null);

  const load = useCallback(() => {
    settingsService
      .getSmtp()
      .then(setCfg)
      .catch((e) => notify(errorMessage(e), "error"));
  }, [notify]);
  useEffect(load, [load]);

  if (!cfg) return <Spinner />;

  const save = async (removePassword = false) => {
    setBusy(true);
    try {
      await settingsService.saveSmtp({
        enabled: cfg.enabled,
        host: cfg.host,
        port: cfg.port,
        secure: cfg.secure,
        user: cfg.user,
        fromName: cfg.fromName,
        fromEmail: cfg.fromEmail,
        ...(password ? { password } : {}),
        ...(removePassword ? { removePassword: true } : {}),
      });
      setPassword("");
      notify("Email settings saved.");
      load();
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card
        title="Email account (SMTP)"
        subtitle="Used for login codes, bookings, refunds and payouts. Gmail: turn on 2-Step Verification, create an App Password at myaccount.google.com/apppasswords and paste it here."
        actions={
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${cfg.ready ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
            {cfg.ready ? "Ready" : "Not set up"}
          </span>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Gmail / SMTP username">
            <input className={inputClass} value={cfg.user} onChange={(e) => setCfg({ ...cfg, user: e.target.value.trim() })} placeholder="yourname@gmail.com" />
          </Field>
          <Field label={cfg.hasPassword ? `App password (saved ${cfg.passHint})` : "App password"} hint="Stored encrypted. Never shown again.">
            <input
              type="password"
              autoComplete="off"
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={cfg.hasPassword ? "Paste a new one to replace" : "16-character app password"}
            />
          </Field>
          <Field label="Sender name">
            <input className={inputClass} value={cfg.fromName} onChange={(e) => setCfg({ ...cfg, fromName: e.target.value })} />
          </Field>
          <Field label="Sender email (optional)" hint="Empty = the username">
            <input className={inputClass} value={cfg.fromEmail} onChange={(e) => setCfg({ ...cfg, fromEmail: e.target.value.trim() })} />
          </Field>
          <Field label="SMTP server">
            <input className={inputClass} value={cfg.host} onChange={(e) => setCfg({ ...cfg, host: e.target.value.trim() })} />
          </Field>
          <div className="grid grid-cols-2 gap-2 items-end">
            <Field label="Port">
              <input type="number" className={inputClass} value={cfg.port} onChange={(e) => setCfg({ ...cfg, port: Number(e.target.value) })} />
            </Field>
            <div className="pb-1.5">
              <Toggle checked={cfg.secure} onChange={(v) => setCfg({ ...cfg, secure: v })} label="SSL" />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Toggle checked={cfg.enabled} onChange={(v) => setCfg({ ...cfg, enabled: v })} label={cfg.enabled ? "Sending on" : "Sending off"} />
          <button type="button" className={primaryBtn} onClick={() => save()} disabled={busy}>
            {busy ? <Spinner /> : <Save className="w-3.5 h-3.5" />} Save
          </button>
          {cfg.hasPassword && (
            <button type="button" className={dangerBtn} onClick={() => window.confirm("Remove the saved password? Emails will stop.") && save(true)}>
              Remove password
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100">
          <input className={`${inputClass} max-w-xs`} value={testTo} onChange={(e) => setTestTo(e.target.value.trim())} placeholder="Send a test email to…" />
          <button
            type="button"
            className={ghostBtn}
            disabled={!testTo || busy}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await settingsService.testSmtp(testTo);
                notify(r.message, r.ok ? "success" : "error");
              } catch (error) {
                notify(errorMessage(error), "error");
              } finally {
                setBusy(false);
              }
            }}
          >
            <Send className="w-3.5 h-3.5" /> Send test
          </button>
        </div>
      </Card>

      <Card
        title="Reminder emails on time (cron)"
        subtitle="The 15-minute reminder and the 'consultation time now' email need a ping every minute. No-shows and refunds work without it."
        actions={
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${cfg.cronConfigured ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-50 text-gray-600 border-gray-200"}`}>
            {cfg.cronConfigured ? "Key created" : "Not set up"}
          </span>
        }
      >
        <ol className="text-[11px] text-gray-600 list-decimal pl-4 space-y-0.5">
          <li>Create a free account at cron-job.org.</li>
          <li>Create the secret URL below and add it there as a job that runs every 1 minute.</li>
        </ol>
        {cronUrl ? (
          <div className="flex items-center gap-2 p-2 rounded-xl bg-gray-50 border border-gray-200">
            <p className="text-[11px] font-mono break-all flex-1">{cronUrl}</p>
            <CopyButton text={cronUrl} />
          </div>
        ) : (
          <button
            type="button"
            className={ghostBtn}
            onClick={async () => {
              if (cfg.cronConfigured && !window.confirm("Create a new URL? The old one will stop working.")) return;
              try {
                const { key } = await settingsService.createCronKey();
                const api = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000/api").replace(/\/+$/, "");
                setCronUrl(`${api}/cron/tick?key=${key}`);
                setCfg({ ...cfg, cronConfigured: true });
              } catch (error) {
                notify(errorMessage(error), "error");
              }
            }}
          >
            <RefreshCw className="w-3.5 h-3.5" /> {cfg.cronConfigured ? "Create a new secret URL" : "Create secret URL"}
          </button>
        )}
        <p className="text-[10.5px] text-gray-500">The URL is shown once. Keep it private.</p>
      </Card>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* EMAIL TEXTS                                                                */
/* -------------------------------------------------------------------------- */
function TemplatesCard({ notify }: { notify: Notify }) {
  const [items, setItems] = useState<EmailTemplateItem[] | null>(null);
  const [selected, setSelected] = useState<string>("otp");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [preview, setPreview] = useState<RenderedEmail | null>(null);
  const [busy, setBusy] = useState(false);
  const initialized = useRef(false);

  const load = useCallback(async () => {
    try {
      const list = await settingsService.listTemplates();
      setItems(list);
      // First load: show the login-code email
      if (!initialized.current) {
        initialized.current = true;
        const first = list.find((t) => t.key === "otp") ?? list[0];
        if (first) {
          setSelected(first.key);
          setSubject(first.custom?.subject ?? first.defaults.subject);
          setBody(first.custom?.body ?? first.defaults.body);
        }
      }
    } catch (e) {
      notify(errorMessage(e), "error");
    }
  }, [notify]);
  useEffect(() => {
    load();
  }, [load]);

  const current = items?.find((t) => t.key === selected) ?? null;

  const open = (item: EmailTemplateItem) => {
    setSelected(item.key);
    setSubject(item.custom?.subject ?? item.defaults.subject);
    setBody(item.custom?.body ?? item.defaults.body);
    setPreview(null);
  };

  const run = async (action: () => Promise<unknown>, message: string) => {
    setBusy(true);
    try {
      await action();
      notify(message);
      await load();
    } catch (e) {
      notify(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Email texts" subtitle="Change what each email says. {{placeholders}} are filled in automatically. Medical details are never put in emails.">
      {!items ? (
        <Spinner />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-3">
          <div className="space-y-1 max-h-[480px] overflow-y-auto">
            {items.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => open(t)}
                className={`w-full text-left px-3 py-2 rounded-xl text-xs border cursor-pointer ${
                  t.key === selected ? "bg-emerald-50 border-emerald-300 text-emerald-900 font-bold" : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {t.name}
                {t.custom && <span className="ml-1 text-[10px] text-amber-700">(edited)</span>}
              </button>
            ))}
          </div>
          {current && (
            <div className="space-y-2">
              <p className="text-[11px] text-gray-500">{current.description}</p>
              <div className="flex flex-wrap gap-1">
                {current.placeholders.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    title={p.description}
                    onClick={() => setBody((b) => `${b}{{${p.name}}}`)}
                    className={`px-2 py-0.5 rounded-full text-[10.5px] font-mono border cursor-pointer ${
                      current.required.includes(p.name) ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-gray-50 border-gray-200 text-gray-700"
                    }`}
                  >
                    {`{{${p.name}}}`}
                  </button>
                ))}
                <span className="text-[10px] text-gray-400 self-center">Click to add · yellow = must stay</span>
              </div>
              <Field label="Subject">
                <input className={inputClass} maxLength={150} value={subject} onChange={(e) => setSubject(e.target.value)} />
              </Field>
              <Field label="Text" hint="Leave an empty line between paragraphs.">
                <textarea className={`${inputClass} h-48 py-2 font-mono`} maxLength={3000} value={body} onChange={(e) => setBody(e.target.value)} />
              </Field>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={primaryBtn} disabled={busy} onClick={() => run(() => settingsService.saveTemplate(current.key, subject, body), "Email text saved.")}>
                  {busy ? <Spinner /> : <Save className="w-3.5 h-3.5" />} Save
                </button>
                <button
                  type="button"
                  className={ghostBtn}
                  disabled={busy}
                  onClick={async () => {
                    try {
                      setPreview(await settingsService.previewTemplate(current.key, subject, body));
                    } catch (e) {
                      notify(errorMessage(e), "error");
                    }
                  }}
                >
                  Preview
                </button>
                {current.custom && (
                  <button
                    type="button"
                    className={ghostBtn}
                    disabled={busy}
                    onClick={() =>
                      window.confirm("Go back to the default text?") &&
                      run(async () => {
                        await settingsService.resetTemplate(current.key);
                        setSubject(current.defaults.subject);
                        setBody(current.defaults.body);
                      }, "Back to the default text.")
                    }
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Default text
                  </button>
                )}
              </div>
              {current.custom && current.updatedAt && (
                <p className="text-[10.5px] text-gray-400">
                  Edited {when(current.updatedAt)} by {current.updatedByEmail}
                </p>
              )}
              {preview && (
                <div className="rounded-xl border border-gray-200 overflow-hidden">
                  <p className="px-3 py-2 text-xs bg-gray-50 border-b border-gray-200">
                    <b>Subject:</b> {preview.subject}
                  </p>
                  {/* The server escapes everything in this HTML; it is shown in a sandboxed frame anyway */}
                  <iframe title="Email preview" sandbox="" srcDoc={preview.html} className="w-full h-64 bg-white" />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
