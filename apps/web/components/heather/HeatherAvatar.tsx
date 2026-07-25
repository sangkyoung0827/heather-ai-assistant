"use client";

import { BrainCircuit, Circle, Sparkles } from "lucide-react";
import type { HeatherSettings } from "@heather/core";

export function HeatherAvatar({ settings, size = "medium", researcher = false }: { settings: HeatherSettings; size?: "small" | "medium" | "large"; researcher?: boolean }) {
  const Icon = settings.iconStyle === "orb" ? Circle : settings.iconStyle === "neural" ? BrainCircuit : Sparkles;
  return <span className={`heather-avatar heather-avatar-${size} ${researcher ? "is-researcher" : ""}`}><span className="heather-avatar-ring" /><Icon /></span>;
}
