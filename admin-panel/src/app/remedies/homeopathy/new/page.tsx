"use client";

import React from "react";
import RemedyAddView from "@/components/remedies/RemedyAddView";
import { REMEDY_CONFIGS } from "@/components/remedies/remedyCategoryConfigs";

export default function AddHomeopathyPage() {
  return <RemedyAddView config={REMEDY_CONFIGS.homeopathy} />;
}
