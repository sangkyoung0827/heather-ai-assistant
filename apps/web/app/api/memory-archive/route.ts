import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { injectMemoryArchiveQuest } from "../../../lib/memory-archive-quest";

export const runtime = "nodejs";
export const dynamic = "force-static";
export const revalidate = false;

const ARCHIVE_PARTS = [
  "archive.part1.txt",
  "archive.part2.txt",
  "archive.part3.txt",
  "archive.part4.txt",
  "archive.part5.txt",
  "archive.part6.txt"
] as const;

const MEMORY_EDITOR_LAYOUT_STYLE = String.raw`<style id="heather-memory-editor-layout">
.ma-editor-overlay {
  align-items: stretch !important;
  justify-content: stretch !important;
  padding: clamp(12px, 2vw, 28px) !important;
  overflow: hidden !important;
}

.ma-editor-panel {
  width: min(1600px, 100%) !important;
  height: 100% !important;
  max-width: none !important;
  max-height: none !important;
  margin: auto !important;
  overflow: hidden !important;
  border-radius: 22px !important;
  display: flex !important;
  flex-direction: column !important;
}

.ma-editor-grid {
  display: grid !important;
  grid-template-columns: minmax(340px, 40%) minmax(0, 1fr) !important;
  grid-auto-flow: row !important;
  align-content: start !important;
  align-items: start !important;
  gap: 16px 30px !important;
  width: 100% !important;
  min-width: 0 !important;
  min-height: 0 !important;
  flex: 1 1 auto !important;
  overflow: auto !important;
  padding-right: 6px !important;
  box-sizing: border-box !important;
}

.ma-editor-grid > .ma-photo-column {
  grid-column: 1 !important;
  grid-row: 1 / span 50 !important;
  min-width: 0 !important;
  height: 100% !important;
  min-height: 0 !important;
  align-self: stretch !important;
  display: flex !important;
  flex-direction: column !important;
}

.ma-editor-grid > .ma-right-column {
  grid-column: 2 !important;
  min-width: 0 !important;
  width: 100% !important;
  margin: 0 !important;
}

.ma-photo-dropzone {
  width: 100% !important;
  min-height: clamp(430px, 63vh, 760px) !important;
  height: 100% !important;
  flex: 1 1 auto !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  box-sizing: border-box !important;
}

.ma-photo-dropzone img {
  width: 100% !important;
  height: 100% !important;
  max-height: 72vh !important;
  object-fit: contain !important;
}

.ma-editor-grid input:not([type="file"]),
.ma-editor-grid textarea,
.ma-editor-grid select {
  width: 100% !important;
  max-width: none !important;
  box-sizing: border-box !important;
}

.ma-editor-grid textarea {
  min-height: clamp(300px, 46vh, 620px) !important;
  resize: vertical !important;
}

@media (max-width: 900px) {
  .ma-editor-overlay {
    padding: 0 !important;
  }

  .ma-editor-panel {
    width: 100% !important;
    height: 100% !important;
    border-radius: 0 !important;
  }

  .ma-editor-grid {
    display: block !important;
    overflow-y: auto !important;
    padding-right: 0 !important;
  }

  .ma-editor-grid > .ma-photo-column,
  .ma-editor-grid > .ma-right-column {
    width: 100% !important;
    height: auto !important;
    margin-bottom: 16px !important;
  }

  .ma-photo-dropzone {
    min-height: 320px !important;
    height: auto !important;
  }

  .ma-editor-grid textarea {
    min-height: 300px !important;
  }
}
</style>`;

const MEMORY_EDITOR_LAYOUT_SCRIPT = String.raw`<script id="heather-memory-editor-layout-script">
(function () {
  var scheduled = false;

  function commonAncestor(elements) {
    var candidate = elements[0];
    while (candidate && !elements.every(function (element) { return candidate.contains(element); })) {
      candidate = candidate.parentElement;
    }
    return candidate;
  }

  function directChildFor(element, root) {
    var node = element;
    while (node && node.parentElement && node.parentElement !== root) node = node.parentElement;
    return node && node.parentElement === root ? node : null;
  }

  function findEditorTitle() {
    var candidates = document.querySelectorAll("h1,h2,h3,h4,strong,span");
    for (var index = 0; index < candidates.length; index += 1) {
      var text = (candidates[index].textContent || "").replace(/\\s+/g, " ").trim();
      if (text === "새 추억 기록하기" || text === "추억 수정하기" || text === "추억 기록 수정") return candidates[index];
    }
    return null;
  }

  function findOverlay(panel) {
    var node = panel.parentElement;
    while (node && node !== document.body) {
      var style = window.getComputedStyle(node);
      var rect = node.getBoundingClientRect();
      if (style.position === "fixed" && rect.width >= window.innerWidth * 0.8 && rect.height >= window.innerHeight * 0.8) return node;
      node = node.parentElement;
    }
    return panel.parentElement;
  }

  function applyEditorLayout() {
    scheduled = false;
    var fileInput = document.querySelector('input[type="file"]');
    var dateInput = document.querySelector('input[type="date"]');
    var textarea = document.querySelector("textarea");
    if (!fileInput || !dateInput || !textarea) return;

    var titleInput = document.querySelector('input[type="text"]');
    var controls = [fileInput, dateInput, textarea];
    if (titleInput) controls.push(titleInput);

    var gridRoot = commonAncestor(controls);
    if (!gridRoot || gridRoot === document.body || gridRoot.dataset.heatherEditorLayout === "true") return;

    gridRoot.dataset.heatherEditorLayout = "true";
    gridRoot.classList.add("ma-editor-grid");

    var photoGroup = directChildFor(fileInput, gridRoot);
    if (photoGroup) photoGroup.classList.add("ma-photo-column");

    Array.prototype.forEach.call(gridRoot.children, function (child) {
      if (child !== photoGroup) child.classList.add("ma-right-column");
    });

    var dropzone = fileInput.closest("label,button,[role='button']");
    if (!dropzone && photoGroup) {
      var clickable = photoGroup.querySelector("label,button,[role='button']");
      dropzone = clickable || photoGroup;
    }
    if (dropzone) dropzone.classList.add("ma-photo-dropzone");

    var editorTitle = findEditorTitle();
    var panel = editorTitle ? commonAncestor([gridRoot, editorTitle]) : gridRoot.parentElement;
    if (panel && panel !== document.body) {
      panel.classList.add("ma-editor-panel");
      var overlay = findOverlay(panel);
      if (overlay && overlay !== document.body) overlay.classList.add("ma-editor-overlay");
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(applyEditorLayout);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", schedule, { once: true });
  else schedule();

  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("resize", schedule);
})();
</script>`;

async function loadArchiveHtml(): Promise<string> {
  const possibleDirectories = [
    join(process.cwd(), "public", "memory-archive"),
    join(process.cwd(), "apps", "web", "public", "memory-archive")
  ];

  let lastError: unknown;
  for (const directory of possibleDirectories) {
    try {
      const encoded = (await Promise.all(
        ARCHIVE_PARTS.map((part) => readFile(join(directory, part), "utf8"))
      )).join("").replace(/\s+/g, "");
      return gunzipSync(Buffer.from(encoded, "base64")).toString("utf8");
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Memory archive bundle was not found.");
}

function injectMemoryEditorLayout(html: string) {
  let next = html;
  const headEnd = next.lastIndexOf("</head>");
  next = headEnd >= 0
    ? `${next.slice(0, headEnd)}${MEMORY_EDITOR_LAYOUT_STYLE}${next.slice(headEnd)}`
    : `${MEMORY_EDITOR_LAYOUT_STYLE}${next}`;

  const bodyEnd = next.lastIndexOf("</body>");
  return bodyEnd >= 0
    ? `${next.slice(0, bodyEnd)}${MEMORY_EDITOR_LAYOUT_SCRIPT}${next.slice(bodyEnd)}`
    : `${next}${MEMORY_EDITOR_LAYOUT_SCRIPT}`;
}

export async function GET() {
  try {
    const html = injectMemoryArchiveQuest(injectMemoryEditorLayout(await loadArchiveHtml()));
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=0, must-revalidate",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown archive error";
    return new Response(
      `<!doctype html><html lang="ko"><meta charset="utf-8"><title>추억 저장소 오류</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#03070c;color:#dce7f4;font-family:system-ui"><main style="max-width:560px;padding:32px;text-align:center"><h1 style="font-size:20px">추억 저장소를 열지 못했습니다.</h1><p style="color:#8291a7">${escapeHtml(message)}</p></main></body></html>`,
      { status: 500, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
    );
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character] || character);
}
