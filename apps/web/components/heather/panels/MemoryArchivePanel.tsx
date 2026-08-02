"use client";

import type { HeatherLanguage } from "@heather/core";

/**
 * Full-page host for the standalone memory-archive bundle.
 * The archive HTML is generated into /api/memory-archive during the
 * Next.js build so Vercel does not need to publish the raw public files.
 */
export function MemoryArchivePanel({ locale }: { locale: HeatherLanguage }) {
  const korean = locale !== "en";
  return (
    <div className="memory-archive-workspace dm-workspace">
      <iframe
        src="/api/memory-archive"
        title={korean ? "추억 저장소" : "Memory archive"}
        loading="eager"
        sandbox="allow-scripts allow-forms allow-modals allow-downloads allow-same-origin"
      />
    </div>
  );
}
