"use client";

import React, { useState } from "react";
import AdminPageShell from "@/components/admin/AdminPageShell";
import { Tabs } from "@/components/market/ui";
import { AccessState, useSuperAdmin, useToast } from "@/components/market/hooks";
import ApiKeysTab from "@/components/settings/ApiKeysTab";
import SmtpTab from "@/components/settings/SmtpTab";
import SearchTab from "@/components/settings/SearchTab";

type Tab = "keys" | "smtp" | "search";

/** Settings (navbar): API keys & providers, SMTP + email texts, and the app's search screen */
export default function SettingsPage() {
  const access = useSuperAdmin();
  const { toast, notify, dismiss } = useToast();
  const [tab, setTab] = useState<Tab>("keys");

  return (
    <AdminPageShell title="Settings" subtitle="API keys, email and search settings for VaidyaCure" toast={toast} onDismissToast={dismiss}>
      <AccessState access={access} />
      {access === "allowed" && (
        <>
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { key: "keys", label: "API Keys & Providers" },
              { key: "smtp", label: "SMTP" },
              { key: "search", label: "Search" },
            ]}
          />
          {tab === "keys" && <ApiKeysTab notify={notify} />}
          {tab === "smtp" && <SmtpTab notify={notify} />}
          {tab === "search" && <SearchTab notify={notify} />}
        </>
      )}
    </AdminPageShell>
  );
}
