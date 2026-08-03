export const MEMORY_ARCHIVE_MENU_STYLE = String.raw`<style id="heather-memory-archive-menu-style">
body.heather-clean-archive-menu {
  display: flex !important;
  width: 100% !important;
  height: 100vh !important;
  height: 100dvh !important;
  min-height: 0 !important;
  flex-direction: column !important;
  overflow: hidden !important;
}

body.heather-clean-archive-menu > .app {
  width: 100% !important;
  height: auto !important;
  min-height: 0 !important;
  flex: 1 1 auto !important;
}

body.heather-clean-archive-menu .sidebar {
  display: none !important;
}

body.heather-clean-archive-menu .main {
  width: 100% !important;
  min-width: 0 !important;
  flex: 1 1 auto !important;
}

#heatherArchiveYearStripWrap {
  position: relative;
  z-index: 20;
  flex: 0 0 auto;
  border-bottom: 1px solid rgba(115, 145, 177, .18);
  background:
    radial-gradient(circle at 20% 0%, rgba(232, 196, 104, .07), transparent 45%),
    #0e1220;
}

#heatherArchiveYearStrip {
  display: flex;
  max-height: 118px;
  align-content: flex-start;
  flex-wrap: wrap;
  gap: 8px 10px;
  overflow-y: auto;
  padding: 14px 24px;
  scrollbar-width: thin;
}

.heather-archive-year-chip {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  gap: 7px;
  border: 1px solid rgba(115, 145, 177, .22);
  border-radius: 999px;
  background: #161c33;
  color: #8892ab;
  padding: 7px 14px;
  font-family: "Noto Sans KR", sans-serif;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
  transition: color .15s ease, border-color .15s ease, background .15s ease, box-shadow .15s ease;
}

.heather-archive-year-chip:hover {
  border-color: #a98a4a;
  color: #eef0f7;
}

.heather-archive-year-chip.is-active {
  border-color: #e8c468;
  background: linear-gradient(160deg, #e8c468, #a98a4a);
  color: #12100a;
  box-shadow: 0 0 14px rgba(232, 196, 104, .25);
}

.heather-archive-year-count {
  font-size: 10.5px;
  font-weight: 600;
  opacity: .72;
}

body.heather-clean-archive-menu .month-chips {
  max-height: 96px !important;
  flex-wrap: wrap !important;
  overflow-x: visible !important;
  overflow-y: auto !important;
  padding-bottom: 0 !important;
}

@media (max-width: 680px) {
  #heatherArchiveYearStrip {
    max-height: 96px;
    gap: 7px;
    padding: 10px 14px;
  }

  .heather-archive-year-chip {
    min-height: 31px;
    padding: 6px 11px;
    font-size: 12px;
  }
}
</style>`;

export const MEMORY_ARCHIVE_MENU_SCRIPT = String.raw`<script id="heather-memory-archive-menu-script">
(function () {
  var START_YEAR = 2018;
  var END_YEAR = 2040;
  var DEMO_ID_PREFIX = "demo-";
  var KNOWN_DEMO_IDS = ["demo-campus", "demo-cherry", "demo-jeju", "demo-coffee", "demo-friends", "demo-night"];
  var mounted = false;
  var scheduled = false;
  var lastSignature = "";
  var cleanupRunning = false;

  function archiveEntries() {
    try { return Array.isArray(entries) ? entries : []; }
    catch (error) { return []; }
  }

  function archiveSelectedYear() {
    try { return selectedYear ? String(selectedYear) : ""; }
    catch (error) { return ""; }
  }

  function chooseInitialYear(list) {
    var current = String(new Date().getFullYear());
    var yearsWithEntries = list
      .map(function (entry) { return String(entry.date || "").slice(0, 4); })
      .filter(function (year, index, values) { return /^\\d{4}$/.test(year) && values.indexOf(year) === index; })
      .sort();
    if (yearsWithEntries.length) return yearsWithEntries[yearsWithEntries.length - 1];
    return Number(current) >= START_YEAR && Number(current) <= END_YEAR ? current : String(END_YEAR);
  }

  function selectYear(year) {
    try {
      selectedYear = String(year);
      selectedMonth = "all";
      selectedEntryId = null;
      if (typeof renderContent === "function") renderContent();
    } catch (error) {
      return;
    }
    lastSignature = "";
    schedule();
  }

  async function deleteStoredValue(key) {
    try {
      if (window.storage && typeof window.storage.delete === "function") {
        await window.storage.delete(key, false);
        return;
      }
    } catch (error) {}
    try { window.localStorage.removeItem(key); } catch (error) {}
  }

  async function saveCleanEntries(list) {
    try {
      entries = list;
      if (typeof saveEntries === "function") {
        await saveEntries();
        return;
      }
    } catch (error) {}
    try {
      var serialized = JSON.stringify(list);
      if (window.storage && typeof window.storage.set === "function") await window.storage.set("memory-entries", serialized, false);
      else window.localStorage.setItem("memory-entries", serialized);
    } catch (error) {}
  }

  async function cleanupDemoContent() {
    if (cleanupRunning) return;
    cleanupRunning = true;
    try {
      var list = archiveEntries();
      var removedIds = [];
      var clean = list.filter(function (entry) {
        var id = String(entry && entry.id || "");
        var demo = id.indexOf(DEMO_ID_PREFIX) === 0;
        if (demo) removedIds.push(id);
        return !demo;
      });

      var photoIds = KNOWN_DEMO_IDS.concat(removedIds).filter(function (id, index, values) {
        return values.indexOf(id) === index;
      });
      await Promise.all(photoIds.map(function (id) { return deleteStoredValue("memory-photo:" + id); }));

      try {
        photoIds.forEach(function (id) {
          if (entryPhotoCache && Object.prototype.hasOwnProperty.call(entryPhotoCache, id)) delete entryPhotoCache[id];
        });
      } catch (error) {}

      if (clean.length !== list.length) {
        await saveCleanEntries(clean);
        try {
          if (selectedEntryId && String(selectedEntryId).indexOf(DEMO_ID_PREFIX) === 0) selectedEntryId = null;
        } catch (error) {}
        lastSignature = "";
        if (typeof renderContent === "function") renderContent();
      }
    } finally {
      cleanupRunning = false;
      schedule();
    }
  }

  function ensureStrip() {
    var existing = document.getElementById("heatherArchiveYearStripWrap");
    if (existing) return existing;
    var app = document.querySelector("body > .app") || document.querySelector(".app");
    if (!app) return null;

    document.body.classList.add("heather-clean-archive-menu");
    var wrap = document.createElement("div");
    wrap.id = "heatherArchiveYearStripWrap";
    wrap.setAttribute("aria-label", "추억 연도 선택");
    wrap.innerHTML = '<div id="heatherArchiveYearStrip"></div>';
    app.parentElement.insertBefore(wrap, app);
    mounted = true;
    return wrap;
  }

  function renderStrip() {
    scheduled = false;
    var wrap = ensureStrip();
    if (!wrap) return;
    var strip = document.getElementById("heatherArchiveYearStrip");
    if (!strip) return;

    var list = archiveEntries();
    var active = archiveSelectedYear() || chooseInitialYear(list);
    var counts = {};
    list.forEach(function (entry) {
      var year = String(entry.date || "").slice(0, 4);
      if (/^\\d{4}$/.test(year)) counts[year] = (counts[year] || 0) + 1;
    });

    var signature = active + "|" + JSON.stringify(counts);
    if (signature === lastSignature && strip.children.length) return;
    lastSignature = signature;
    strip.innerHTML = "";

    for (var year = START_YEAR; year <= END_YEAR; year += 1) {
      var value = String(year);
      var button = document.createElement("button");
      button.type = "button";
      button.className = "heather-archive-year-chip" + (value === active ? " is-active" : "");
      button.setAttribute("aria-pressed", value === active ? "true" : "false");
      button.innerHTML = '<span>' + value + '</span>' + (counts[value] ? '<span class="heather-archive-year-count">' + counts[value] + '</span>' : "");
      button.addEventListener("click", (function (selected) {
        return function () { selectYear(selected); };
      })(value));
      strip.appendChild(button);
    }

    var activeButton = strip.querySelector(".is-active");
    if (activeButton) activeButton.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(renderStrip);
  }

  function patchRenderer(name) {
    try {
      var original = window[name];
      if (typeof original !== "function" || original.__heatherMenuPatched) return;
      var wrapped = function () {
        var result = original.apply(this, arguments);
        schedule();
        return result;
      };
      wrapped.__heatherMenuPatched = true;
      window[name] = wrapped;
    } catch (error) {}
  }

  function start() {
    ensureStrip();
    patchRenderer("renderYearList");
    patchRenderer("renderContent");
    schedule();
    void cleanupDemoContent();
    window.setTimeout(function () { void cleanupDemoContent(); }, 180);
    window.setTimeout(function () { void cleanupDemoContent(); }, 700);
    window.setTimeout(function () { void cleanupDemoContent(); }, 1600);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();

  new MutationObserver(function () {
    if (!mounted || !document.getElementById("heatherArchiveYearStripWrap")) ensureStrip();
    schedule();
  }).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("resize", schedule);
})();
</script>`;

export function injectMemoryArchiveMenu(html: string) {
  let next = html;
  const headEnd = next.lastIndexOf("</head>");
  next = headEnd >= 0
    ? `${next.slice(0, headEnd)}${MEMORY_ARCHIVE_MENU_STYLE}${next.slice(headEnd)}`
    : `${MEMORY_ARCHIVE_MENU_STYLE}${next}`;

  const bodyEnd = next.lastIndexOf("</body>");
  return bodyEnd >= 0
    ? `${next.slice(0, bodyEnd)}${MEMORY_ARCHIVE_MENU_SCRIPT}${next.slice(bodyEnd)}`
    : `${next}${MEMORY_ARCHIVE_MENU_SCRIPT}`;
}