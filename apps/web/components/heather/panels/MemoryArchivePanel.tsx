"use client";

import type { HeatherLanguage } from "@heather/core";

/**
 * Full-page host for the standalone memory-archive static module.
 * Intentionally isolated: this panel only points an iframe at the
 * pre-built bundle in /public/memory-archive. It does not import or
 * call Heather AI, memory, research, database, or API code.
 */
export function MemoryArchivePanel({ locale }: { locale: HeatherLanguage }) {
  const korean = locale !== "en";
  return (
    <div className="memory-archive-workspace dm-workspace">
      <iframe
        src="/memory-archive/index.html"
        title={korean ? "추억 저장소" : "Memory archive"}
        loading="eager"
        sandbox="allow-scripts allow-forms allow-modals allow-downloads allow-same-origin"
      />
    </div>
  );
}
