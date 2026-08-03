"use client";

import { useCallback, useEffect, useRef } from "react";
import type { HeatherLanguage } from "@heather/core";

const ENTRY_EDITOR_STYLE_ID = "heather-entry-editor-v2";

/**
 * Full-height host for the standalone memory archive.
 *
 * Heather's global icon rail remains outside the iframe and available on every
 * archive view. Timeline, gallery, quest, editor, data, and photo behavior stay
 * isolated inside the archive document.
 */
export function MemoryArchivePanel({ locale }: { locale: HeatherLanguage }) {
  const korean = locale !== "en";
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const applyEntryEditorLayout = useCallback(() => {
    const document = iframeRef.current?.contentDocument;
    if (!document) return;

    if (!document.getElementById(ENTRY_EDITOR_STYLE_ID)) {
      const style = document.createElement("style");
      style.id = ENTRY_EDITOR_STYLE_ID;
      style.textContent = `
        #entryModalOverlay.heather-entry-editor-overlay {
          align-items: stretch !important;
          justify-content: stretch !important;
          padding: clamp(14px, 2vw, 28px) !important;
          overflow: hidden !important;
        }

        #entryModalOverlay .modal-box.heather-entry-editor-panel {
          display: grid !important;
          grid-template-columns: minmax(360px, 42%) minmax(500px, 1fr) !important;
          grid-template-rows: auto 52px 52px minmax(320px, 1fr) 52px 52px 52px auto !important;
          gap: 14px 30px !important;
          width: min(1540px, 100%) !important;
          height: 100% !important;
          max-width: none !important;
          max-height: none !important;
          margin: auto !important;
          padding: clamp(22px, 2vw, 34px) !important;
          overflow: hidden !important;
          border-radius: 22px !important;
          box-sizing: border-box !important;
        }

        #entryModalOverlay .heather-entry-editor-panel > h3 {
          grid-column: 1 / -1 !important;
          grid-row: 1 !important;
          margin: 0 !important;
          font-size: clamp(20px, 1.65vw, 28px) !important;
          line-height: 1.2 !important;
        }

        #entryModalOverlay .heather-entry-editor-panel > .field {
          min-width: 0 !important;
          margin: 0 !important;
        }

        #entryModalOverlay .heather-entry-editor-panel .field label {
          margin-bottom: 8px !important;
          font-size: 14px !important;
          line-height: 1.2 !important;
        }

        #entryModalOverlay .heather-entry-photo-field {
          grid-column: 1 !important;
          grid-row: 2 / 9 !important;
          display: flex !important;
          min-height: 0 !important;
          flex-direction: column !important;
          align-self: stretch !important;
        }

        #entryModalOverlay #photoUploadArea {
          display: flex !important;
          width: 100% !important;
          min-height: 0 !important;
          height: 100% !important;
          flex: 1 1 auto !important;
          align-items: center !important;
          justify-content: center !important;
          padding: 24px !important;
          box-sizing: border-box !important;
        }

        #entryModalOverlay #photoUploadArea svg {
          width: min(180px, 38%) !important;
          height: auto !important;
          max-height: 34% !important;
          flex: 0 0 auto !important;
        }

        #entryModalOverlay #photoUploadArea img {
          width: 100% !important;
          height: 100% !important;
          object-fit: contain !important;
          background: rgba(4, 9, 15, .42) !important;
        }

        #entryModalOverlay .heather-entry-date-field { grid-column: 2 !important; grid-row: 2 !important; }
        #entryModalOverlay .heather-entry-title-field { grid-column: 2 !important; grid-row: 3 !important; }
        #entryModalOverlay .heather-entry-diary-field {
          grid-column: 2 !important;
          grid-row: 4 !important;
          display: flex !important;
          min-height: 0 !important;
          flex-direction: column !important;
        }
        #entryModalOverlay .heather-entry-location-field { grid-column: 2 !important; grid-row: 5 !important; }
        #entryModalOverlay .heather-entry-people-field { grid-column: 2 !important; grid-row: 6 !important; }
        #entryModalOverlay .heather-entry-emotions-field { grid-column: 2 !important; grid-row: 7 !important; }

        #entryModalOverlay .heather-entry-editor-panel input:not([type="file"]) {
          width: 100% !important;
          height: 48px !important;
          padding: 0 15px !important;
          font-size: 15px !important;
          line-height: 48px !important;
          box-sizing: border-box !important;
        }

        #entryModalOverlay #fDiary {
          width: 100% !important;
          min-height: 320px !important;
          height: 100% !important;
          flex: 1 1 auto !important;
          padding: 18px 20px !important;
          font-size: 17px !important;
          line-height: 1.85 !important;
          letter-spacing: -.01em !important;
          resize: none !important;
          box-sizing: border-box !important;
        }

        #entryModalOverlay .modal-actions.heather-entry-actions {
          grid-column: 2 !important;
          grid-row: 8 !important;
          align-self: end !important;
          margin: 0 !important;
          padding-top: 2px !important;
        }

        #entryModalOverlay .modal-actions.heather-entry-actions button {
          min-width: 96px !important;
          min-height: 44px !important;
          font-size: 14px !important;
        }

        @media (max-width: 980px) {
          #entryModalOverlay.heather-entry-editor-overlay {
            padding: 0 !important;
          }

          #entryModalOverlay .modal-box.heather-entry-editor-panel {
            display: block !important;
            width: 100% !important;
            height: 100% !important;
            max-width: none !important;
            max-height: none !important;
            padding: 22px !important;
            overflow-y: auto !important;
            border-radius: 0 !important;
          }

          #entryModalOverlay .heather-entry-editor-panel > h3,
          #entryModalOverlay .heather-entry-editor-panel > .field,
          #entryModalOverlay .modal-actions.heather-entry-actions {
            width: 100% !important;
            margin-bottom: 16px !important;
          }

          #entryModalOverlay #photoUploadArea {
            min-height: 330px !important;
            height: 330px !important;
          }

          #entryModalOverlay #fDiary {
            min-height: 360px !important;
            height: 360px !important;
            resize: vertical !important;
          }
        }
      `;
      document.head.appendChild(style);
    }

    const overlay = document.getElementById("entryModalOverlay");
    const panel = overlay?.querySelector<HTMLElement>(".modal-box");
    if (!overlay || !panel) return;

    overlay.classList.add("heather-entry-editor-overlay");
    panel.classList.add("heather-entry-editor-panel");

    const assignField = (controlId: string, className: string) => {
      const control = document.getElementById(controlId);
      const field = control?.closest<HTMLElement>(".field");
      if (field) field.classList.add(className);
    };

    assignField("photoUploadArea", "heather-entry-photo-field");
    assignField("fDate", "heather-entry-date-field");
    assignField("fTitle", "heather-entry-title-field");
    assignField("fDiary", "heather-entry-diary-field");
    assignField("fLocation", "heather-entry-location-field");
    assignField("fPeople", "heather-entry-people-field");
    assignField("fEmotions", "heather-entry-emotions-field");
    panel.querySelector<HTMLElement>(".modal-actions")?.classList.add("heather-entry-actions");
  }, []);

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
        ref={iframeRef}
        src="/api/memory-archive"
        title={korean ? "추억 저장소" : "Memory archive"}
        loading="eager"
        onLoad={applyEntryEditorLayout}
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
