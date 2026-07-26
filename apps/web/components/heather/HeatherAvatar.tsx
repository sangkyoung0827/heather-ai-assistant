"use client";

import { BrainCircuit, Circle, Sparkles } from "lucide-react";
import Image from "next/image";
import type { HeatherSettings } from "@heather/core";

export function HeatherAvatar({ settings, size = "medium", researcher = false }: { settings: HeatherSettings; size?: "small" | "medium" | "large"; researcher?: boolean }) {
  const Icon = settings.iconStyle === "orb" ? Circle : settings.iconStyle === "neural" ? BrainCircuit : Sparkles;
  const usesAvatar = settings.iconStyle === "avatar";
  return <span className={`heather-avatar heather-avatar-${size} ${usesAvatar ? "uses-avatar" : ""} ${researcher ? "is-researcher" : ""}`}><span className="heather-avatar-ring" />{usesAvatar ? <Image src="/images/heather-avatar-v1.png" alt="Heather" width={1254} height={1254} priority={size === "large"} /> : <Icon />}</span>;
}
