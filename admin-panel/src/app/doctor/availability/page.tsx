"use client";

import React, { useState } from "react";
import DoctorShell from "@/components/doctor/DoctorShell";
import { Spinner, errorMessage, primaryBtn } from "@/components/ai-doctor/ui";
import { Card, WeeklyHoursEditor, Availability } from "@/components/market/ui";
import { useToast } from "@/components/market/hooks";
import { doctorPanelService } from "@/services/doctorPanel.service";

export default function AvailabilityPage() {
  const { toast, notify, dismiss } = useToast();
  const [value, setValue] = useState<Availability | null>(null);
  const [minutes, setMinutes] = useState(15);
  const [saving, setSaving] = useState(false);

  return (
    <DoctorShell
      title="Working hours"
      subtitle="Patients can book you only in these hours. Changes do not affect consultations already booked."
      toast={toast}
      onDismissToast={dismiss}
      onMe={(me) => {
        setValue(me.availability);
        setMinutes(me.consultMinutes);
      }}
    >
      {!value ? (
        <Spinner />
      ) : (
        <Card title="Weekly hours (India time)" subtitle={`Each consultation is ${minutes} minutes plus a short gap; slots are made automatically.`}>
          <WeeklyHoursEditor value={value} onChange={setValue} />
          <button
            type="button"
            className={primaryBtn}
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                const res = await doctorPanelService.updateAvailability(value);
                if (res.data) setValue(res.data);
                notify(res.message || "Saved.");
              } catch (e) {
                notify(errorMessage(e), "error");
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving && <Spinner />} Save hours
          </button>
        </Card>
      )}
    </DoctorShell>
  );
}
