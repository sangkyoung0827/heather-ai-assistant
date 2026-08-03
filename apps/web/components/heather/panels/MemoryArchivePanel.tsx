"use client";

import { useEffect } from "react";
import type { HeatherLanguage } from "@heather/core";

/**
 * Full-screen host for the standalone memory-archive bundle.
 *
 * The archive remains isolated inside its iframe. This component only gives
 * the standalone page the complete browser viewport; it does not import or
 * modify archive data, timeline, gallery, quest, modal, or photo logic.
 */
export function MemoryArchivePanel({ locale }: { locale: HeatherLanguage }) {
  const korean = locale !== "en";

  useEffect(() => {
    document.documentElement.classList.add("memory-archive-page-open");
    document.body.classList.add("memory-archive-page-open");
    return () => {
      document.documentElement.classList.remove("memory-archive-page-open");
      document.body.classList.remove("memory-archive-page-open");
    };
  }, []);

  return (
    <div className="memory-archive-workspace">
      <iframe
        src="/api/memory-archive"
        title={korean ? "추억 저장소" : "Memory archive"}
        loading="eager"
        sandbox="allow-scripts allow-forms allow-modals allow-downloads allow-same-origin"
      />
      <style jsx global>{`
        html.memory-archive-page-open,
        body.memory-archive-page-open {
          overflow: hidden !important;
          background: #03070c !important;
        }

        .memory-archive-workspace {
          position: fixed !important;
          inset: 0 !important;
          z-index: 2147483000 !important;
          display: block !important;
          width: 100vw !important;
          height: 100vh !important;
          height: 100dvh !important;
          min-width: 0 !important;
          min-height: 0 !important;
          overflow: hidden !important;
          border: 0 !important;
          border-radius: 0 !important;
          background: #03070c !important;
          box-shadow: none !important;
        }

        .memory-archive-workspace iframe {
          display: block !important;
          width: 100% !important;
          height: 100% !important;
          min-width: 0 !important;
          min-height: 0 !important;
          border: 0 !important;
          background: #03070c !important;
        }
      `}</style>
    </div>
  );
}
