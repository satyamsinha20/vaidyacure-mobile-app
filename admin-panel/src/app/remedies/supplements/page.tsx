"use client";

import React from "react";
import RemedyCategoryView from "@/components/remedies/RemedyCategoryView";
import { REMEDY_CONFIGS } from "@/components/remedies/remedyCategoryConfigs";

export default function SupplementsPage() {
  return <RemedyCategoryView config={REMEDY_CONFIGS.supplements} />;
}
