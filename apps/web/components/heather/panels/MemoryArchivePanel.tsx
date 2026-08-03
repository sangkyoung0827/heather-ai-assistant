"use client";

import { useEffect } from "react";
import type { HeatherLanguage } from "@heather/core";

/**
 * Full-height host for the standalone memory archive.
 *
 * Heather's global icon rail remains outside the iframe and available on every
 * archive view. Timeline, gallery, quest, editor, data, and photo behavior stay
 * isolated inside the archive document.
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
          --memory-archive-rail-width: 76px;
          overflow: hidden !important;
          background: #03070c !important;
        }

        body.memory-archive-page-open .heather-hud,
        body.memory-archive-page-open .heather-app-shell {
          width: 100vw !important;
          max-width: none !important;
          min-height: 100vh !important;
          margin: 0 !important;
        }

        body.memory-archive-page-open .heather-app-shell {
          grid-template-columns: var(--memory-archive-rail-width) minmax(0, 1fr) !important;
        }

        body.memory-archive-page-open .heather-icon-rail {
          position: fixed !important;
          inset: 0 auto 0 0 !important;
          z-index: 2147483100 !important;
          display: flex !important;
          width: var(--memory-archive-rail-width) !important;
          height: 100vh !important;
          height: 100dvh !important;
          background: rgba(14, 15, 20, .98) !important;
          box-shadow: 10px 0 30px rgba(0, 0, 0, .2);
        }

        body.memory-archive-page-open .heather-main-column {
          min-width: 0 !important;
          padding: 0 !important;
        }

        .memory-archive-workspace {
          position: fixed !important;
          inset: 0 0 0 var(--memory-archive-rail-width) !important;
          z-index: 2147483000 !important;
          display: block !important;
          width: auto !important;
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

        @media (max-width: 720px) {
          html.memory-archive-page-open,
          body.memory-archive-page-open {
            --memory-archive-rail-width: 62px;
          }

          body.memory-archive-page-open .heather-icon-rail {
            padding-top: 14px !important;
            padding-bottom: 14px !important;
          }

          body.memory-archive-page-open .rail-brand,
          body.memory-archive-page-open .rail-actions button,
          body.memory-archive-page-open .rail-bottom button {
            width: 40px !important;
            height: 40px !important;
          }
        }
      `}</style>
    </div>
  );
}
