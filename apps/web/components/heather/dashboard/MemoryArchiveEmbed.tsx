"use client";

import type { HeatherLanguage } from "@heather/core";

export function MemoryArchiveEmbed({ locale }: { locale: HeatherLanguage }) {
  const korean = locale !== "en";

  return (
    <section className="dashboard-panel dashboard-memory-archive" aria-label={korean ? "추억 저장소" : "Memory archive"}>
      <header className="memory-archive-header">
        <div>
          <h3>{korean ? "추억 저장소" : "Memory archive"}</h3>
          <p>{korean ? "사진과 일기로 나의 역사를 기록하는 공간" : "A personal history built from photos and journals"}</p>
        </div>
        <a href="/memory-archive">
          {korean ? "전체 화면" : "Open full screen"}
        </a>
      </header>
      <div className="memory-archive-frame-shell">
        <iframe
          src="/api/memory-archive"
          title={korean ? "추억 저장소" : "Memory archive"}
          loading="eager"
          sandbox="allow-scripts allow-forms allow-modals allow-downloads allow-same-origin"
        />
      </div>
      <style jsx global>{`
        .dashboard-columns > section.dashboard-panel:nth-of-type(1) {
          display: none;
        }
        .dashboard-columns > section.dashboard-panel:nth-of-type(2) {
          grid-column: 2;
          grid-row: 1;
        }
        .dashboard-columns > section.dashboard-memory-archive {
          grid-column: 1;
          grid-row: 1;
          min-height: 500px;
          overflow: hidden;
          padding: 0;
          background: #050a11;
        }
        .memory-archive-header {
          position: relative;
          z-index: 2;
          display: flex;
          min-height: 66px;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          border-bottom: 1px solid var(--os-line);
          padding: 14px 16px;
          background: rgba(8, 13, 22, 0.98);
        }
        .memory-archive-header > div {
          min-width: 0;
        }
        .memory-archive-header h3 {
          margin: 0;
          color: var(--os-text);
          font-size: 14px;
        }
        .memory-archive-header p {
          overflow: hidden;
          margin: 5px 0 0;
          color: var(--os-muted);
          font-size: 10.5px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .memory-archive-header a {
          flex: 0 0 auto;
          border: 1px solid var(--os-accent-border);
          border-radius: 8px;
          background: var(--os-accent-soft);
          color: var(--os-text);
          padding: 7px 9px;
          font-size: 10.5px;
          font-weight: 700;
          text-decoration: none;
        }
        .memory-archive-header a:hover {
          color: var(--os-accent);
        }
        .memory-archive-frame-shell {
          height: 434px;
          overflow: hidden;
          background: #03070c;
        }
        .memory-archive-frame-shell iframe {
          display: block;
          width: 100%;
          height: 100%;
          border: 0;
          background: #03070c;
        }
        @media (max-width: 960px) {
          .dashboard-columns > section.dashboard-panel:nth-of-type(2),
          .dashboard-columns > section.dashboard-memory-archive {
            grid-column: 1 / -1;
            grid-row: auto;
          }
          .dashboard-columns > section.dashboard-memory-archive {
            min-height: 620px;
          }
          .memory-archive-frame-shell {
            height: 554px;
          }
        }
      `}</style>
    </section>
  );
}
