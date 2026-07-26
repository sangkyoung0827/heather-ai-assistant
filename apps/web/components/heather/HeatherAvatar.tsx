"use client";

import Image from "next/image";
import type { HeatherAvatarVariant, HeatherSettings } from "@heather/core";

export const HEATHER_AVATARS: Array<{ id: HeatherAvatarVariant; src: string }> = [
  { id: "face-01", src: "/heather/avatars/heather-face-01.png" },
  { id: "face-02", src: "/heather/avatars/heather-face-02.png" },
  { id: "face-03", src: "/heather/avatars/heather-face-03.png" },
  { id: "face-04", src: "/heather/avatars/heather-face-04.png" }
];

export function getHeatherAvatar(variant: HeatherAvatarVariant) {
  return HEATHER_AVATARS.find((avatar) => avatar.id === variant) ?? HEATHER_AVATARS[0];
}

export function HeatherAvatar({ settings, size = "medium", researcher = false }: { settings: HeatherSettings; size?: "small" | "medium" | "large"; researcher?: boolean }) {
  const avatar = getHeatherAvatar(settings.avatarVariant);
  return <span className={`heather-avatar heather-avatar-${size} uses-avatar ${researcher ? "is-researcher" : ""}`}><span className="heather-avatar-ring" /><Image src={avatar.src} alt="Heather" width={1024} height={1024} priority={size === "large"} /></span>;
}
