"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Download, Filter, Pencil, Plus, Search, Trash2, Upload, X } from "lucide-react";
import type { HeatherLanguage } from "@heather/core";
import { createDirectCommandStore, readLegacyLocalStorageCommands, type DirectCommand, type DirectCommandInput, type ImportSummary } from "../../../lib/direct-command-store";

const emptyInput: DirectCommandInput = { title: "", canonicalTrigger: "", triggers: [], response: "", enabled: true, tags: [] };
const PAGE_SIZE = 30;

export function DirectCommandRegistrationPanel({ locale = "ko" }: { locale?: HeatherLanguage }) {
  const store = useMemo(() => createDirectCommandStore(), []);
  const requestId = useRef(0);
  const [commands, setCommands] = useState<DirectCommand[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [draft, setDraft] = useState<DirectCommandInput>(emptyInput);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftQuery, setDraftQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [importText, setImportText] = useState("");
  const [exportText, setExportText] = useState("");
  const [legacy, setLegacy] = useState<DirectCommandInput[]>([]);
  const [notice, setNotice] = useState("");
  const copy = locale === "en" ? EN : KO;

  const loadFirstPage = useCallback(async (query: string) => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const page = await store.getDirectCommandPage({ q: query, limit: PAGE_SIZE });
      if (id !== requestId.current) return;
      setCommands(page.commands);
      setNextCursor(page.nextCursor);
    } catch (error) { showError(error, setNotice); }
    finally { if (id === requestId.current) setLoading(false); }
  }, [store]);

  useEffect(() => {
    setLegacy(readLegacyLocalStorageCommands());
    const query = new URLSearchParams(window.location.search).get("q") || "";
    setDraftQuery(query);
    setAppliedQuery(query);
  }, []);
  useEffect(() => { void loadFirstPage(appliedQuery); }, [appliedQuery, loadFirstPage]);
  useEffect(() => {
    const onPopState = () => {
      const query = new URLSearchParams(window.location.search).get("q") || "";
      setDraftQuery(query);
      setAppliedQuery(query);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function updateQueryInUrl(query: string) {
    const url = new URL(window.location.href);
    if (query) url.searchParams.set("q", query); else url.searchParams.delete("q");
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }
  function applySearch() {
    const query = draftQuery.trim();
    updateQueryInUrl(query);
    setAppliedQuery(query);
  }
  function clearSearch() { setDraftQuery(""); updateQueryInUrl(""); setAppliedQuery(""); }
  async function refresh() { await loadFirstPage(appliedQuery); }
  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    const id = requestId.current;
    setLoadingMore(true);
    try {
      const page = await store.getDirectCommandPage({ q: appliedQuery, cursor: nextCursor, limit: PAGE_SIZE });
      if (id !== requestId.current) return;
      setCommands((current) => [...current, ...page.commands]);
      setNextCursor(page.nextCursor);
    } catch (error) { showError(error, setNotice); }
    finally { if (id === requestId.current) setLoadingMore(false); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = { ...draft, title: draft.title.trim(), canonicalTrigger: draft.canonicalTrigger.trim(), response: draft.response.trim(), triggers: cleanList(draft.triggers), tags: cleanList(draft.tags) };
    if (!input.title || !input.canonicalTrigger || !input.response) return setNotice(copy.required);
    try {
      if (editingId) await store.updateDirectCommand(editingId, input); else await store.createDirectCommand(input);
      setDraft(emptyInput); setEditingId(null); setNotice(editingId ? copy.updated : copy.created); await refresh();
    } catch (error) { showError(error, setNotice); }
  }
  async function toggle(command: DirectCommand) { try { await store.updateDirectCommand(command.id, { enabled: !command.enabled }); await refresh(); } catch (error) { showError(error, setNotice); } }
  async function remove(command: DirectCommand) { if (window.confirm(copy.deleteConfirm(command.title))) try { await store.deleteDirectCommand(command.id); if (editingId === command.id) { setEditingId(null); setDraft(emptyInput); } await refresh(); } catch (error) { showError(error, setNotice); } }
  async function importCommands(items: DirectCommandInput[]) { try { const summary = await store.importDirectCommands(items); setNotice(formatImportSummary(summary, locale)); await refresh(); } catch (error) { showError(error, setNotice); } }
  function edit(command: DirectCommand) { setEditingId(command.id); setDraft({ title: command.title, canonicalTrigger: command.canonicalTrigger, triggers: command.triggers, response: command.response, enabled: command.enabled, tags: command.tags }); }

  return <><nav className="direct-page-tabs" aria-label={copy.menu}><a href="/direct-commands" className="is-active">{copy.commands}</a><a href="/direct-commands/bulk-import">{copy.bulk}</a></nav><div className="direct-workspace">
    <section className="direct-library">
      <form className="direct-toolbar" onSubmit={(event) => { event.preventDefault(); applySearch(); }}>
        <label className="direct-search"><Search className="h-4 w-4" /><input value={draftQuery} onChange={(event) => { const value = event.target.value; setDraftQuery(value); if (!value) clearSearch(); }} placeholder={copy.searchPlaceholder} />{draftQuery && <button type="button" className="direct-search-clear" onClick={clearSearch} aria-label={copy.clearSearch}><X className="h-3.5 w-3.5" /></button>}</label>
        <button type="submit" className="workspace-secondary-button">{copy.search}</button><button type="button" className="workspace-icon-button" title={copy.filter} aria-label={copy.filter}><Filter className="h-4 w-4" /></button>
        <button type="button" className="workspace-secondary-button" onClick={() => void store.exportDirectCommands().then((items) => setExportText(JSON.stringify(items, null, 2))).catch((error) => showError(error, setNotice))}><Download className="h-4 w-4" /> {copy.export}</button>
      </form>
      {(notice || legacy.length > 0) && <div className="workspace-notice">{notice || copy.legacy}{legacy.length > 0 && <button type="button" onClick={() => { void importCommands(legacy); setLegacy([]); }}>{copy.import}</button>}</div>}
      <div className="direct-list-heading"><span>{appliedQuery ? `${copy.searchResults}: ${appliedQuery}` : copy.savedCommands}</span><span>{commands.length}</span></div>
      <div className="direct-command-list heather-scrollbar">{loading ? <div className="workspace-empty"><strong>{copy.loading}</strong></div> : commands.length === 0 ? <div className="workspace-empty"><strong>{appliedQuery ? copy.noResults : copy.emptyTitle}</strong><p>{appliedQuery ? copy.noResultsDetail : copy.emptyDetail}</p></div> : commands.map((command) => <article key={command.id} className={`direct-command-row ${editingId === command.id ? "is-selected" : ""}`}><button type="button" className="direct-command-select" onClick={() => edit(command)}><span className="direct-command-title">{command.title}{command.createdBy === "auto" && <em className="auto-command-badge">{copy.auto}</em>}</span><span className="direct-command-trigger">{command.canonicalTrigger}</span></button><div className="direct-command-actions"><button type="button" onClick={() => void toggle(command)} className={`command-state ${command.enabled ? "is-enabled" : ""}`}>{command.enabled ? copy.enabled : copy.disabled}</button><button type="button" onClick={() => edit(command)} className="workspace-icon-button" title={copy.edit} aria-label={copy.edit}><Pencil className="h-4 w-4" /></button><button type="button" onClick={() => void remove(command)} className="workspace-icon-button is-danger" title={copy.delete} aria-label={copy.delete}><Trash2 className="h-4 w-4" /></button></div></article>)}</div>
      {nextCursor && <button type="button" className="workspace-secondary-button direct-load-more" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? copy.loading : copy.loadMore}</button>}
      {exportText && <details className="transfer-details"><summary>{copy.exportedJson}</summary><textarea readOnly value={exportText} /></details>}
    </section>
    <aside className="direct-editor"><form onSubmit={save}><div className="editor-heading"><div><p>{editingId ? copy.editing : copy.newCommand}</p><h2>{editingId ? copy.editCommand : copy.commandRegistration}</h2></div><Plus className="h-5 w-5" /></div><Field label={copy.title} value={draft.title} onChange={(title) => setDraft({ ...draft, title })} placeholder={copy.titlePlaceholder} /><Field label={copy.trigger} value={draft.canonicalTrigger} onChange={(canonicalTrigger) => setDraft({ ...draft, canonicalTrigger })} placeholder={copy.triggerPlaceholder} /><Field label={copy.additionalTriggers} hint={copy.commaSeparated} value={(draft.triggers || []).join(", ")} onChange={(value) => setDraft({ ...draft, triggers: value.split(",") })} placeholder={copy.additionalPlaceholder} />{(draft.triggers || []).filter(Boolean).length > 0 && <div className="trigger-chips">{cleanList(draft.triggers).map((trigger) => <span key={trigger}>{trigger}</span>)}</div>}<Field label={copy.response} textarea value={draft.response} onChange={(response) => setDraft({ ...draft, response })} placeholder={copy.responsePlaceholder} /><Field label={copy.tags} hint={copy.commaSeparated} value={(draft.tags || []).join(", ")} onChange={(value) => setDraft({ ...draft, tags: value.split(",") })} placeholder={copy.tagsPlaceholder} /><label className="toggle-row"><input type="checkbox" checked={draft.enabled !== false} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} /><span />{copy.enable}</label><div className="editor-footer"><button className="workspace-primary-button">{copy.save}</button>{editingId && <button type="button" onClick={() => { setEditingId(null); setDraft(emptyInput); }} className="workspace-secondary-button">{copy.cancel}</button>}</div></form><details className="transfer-details"><summary><Upload className="h-4 w-4" /> {copy.jsonImport}</summary><textarea value={importText} onChange={(event) => setImportText(event.target.value)} placeholder={copy.jsonPlaceholder} /><button type="button" className="workspace-secondary-button" disabled={!importText.trim()} onClick={() => { try { const parsed = JSON.parse(importText) as DirectCommandInput[]; void importCommands(parsed); setImportText(""); } catch { setNotice(copy.invalidJson); } }}>{copy.import}</button></details></aside>
  </div></>;
}

function Field({ label, hint, textarea, value, onChange, placeholder }: { label: string; hint?: string; textarea?: boolean; value: string; onChange: (value: string) => void; placeholder?: string }) { const Component = textarea ? "textarea" : "input"; return <label className="workspace-field"><span>{label}{hint && <small>{hint}</small>}</span><Component value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label>; }
function cleanList(values: string[] | undefined) { return [...new Set((values || []).map((value) => value.trim()).filter(Boolean))]; }
function showError(error: unknown, setNotice: (value: string) => void) { setNotice(error instanceof Error ? error.message : "Direct command request failed."); }
function formatImportSummary(summary: ImportSummary, locale: HeatherLanguage) { return locale === "en" ? `Import complete: ${summary.created} created, ${summary.merged} merged, ${summary.skipped} skipped, ${summary.failed} failed.` : `가져오기 완료: 생성 ${summary.created} · 트리거 병합 ${summary.merged} · 건너뜀 ${summary.skipped} · 실패 ${summary.failed}`; }

const KO = { menu: "직접명령 메뉴", commands: "직접명령 등록", bulk: "대량 등록", searchPlaceholder: "명령 이름, 트리거, 태그 또는 응답 검색", clearSearch: "검색 초기화", search: "검색", filter: "필터", export: "내보내기", legacy: "기존 브라우저에 저장된 명령을 가져올 수 있습니다.", import: "가져오기", savedCommands: "등록된 직접명령", searchResults: "검색 결과", loading: "명령을 불러오는 중입니다.", noResults: "검색 결과가 없습니다.", noResultsDetail: "다른 명령 이름, 트리거 또는 태그로 검색해보세요.", emptyTitle: "아직 등록된 직접명령이 없습니다.", emptyDetail: "반복해서 사용하는 질문과 응답을 등록해보세요.", auto: "자동 생성", enabled: "활성", disabled: "비활성", edit: "수정", delete: "삭제", deleteConfirm: (title: string) => `“${title}” 직접명령을 삭제할까요?`, loadMore: "더 불러오기", exportedJson: "내보낸 JSON 보기", editing: "편집 중", newCommand: "새 직접명령", editCommand: "직접명령 수정", commandRegistration: "직접명령 등록", title: "명령 이름", titlePlaceholder: "예: 오늘의 업무 브리핑", trigger: "기본 트리거", triggerPlaceholder: "예: 오늘 해야 할 일을 알려줘", additionalTriggers: "추가 트리거", commaSeparated: "쉼표로 구분", additionalPlaceholder: "예: 오늘 일정 정리해줘", response: "응답", responsePlaceholder: "Heather가 답변할 내용을 입력하세요.", tags: "태그", tagsPlaceholder: "업무, 일정", enable: "활성화", save: "저장", cancel: "취소", jsonImport: "JSON 가져오기", jsonPlaceholder: "JSON 배열을 붙여넣으세요.", invalidJson: "올바른 JSON 배열 형식인지 확인하세요.", required: "명령 이름, 트리거, 응답을 모두 입력하세요.", updated: "직접명령을 수정했습니다.", created: "직접명령을 등록했습니다." } as const;
const EN = { menu: "Direct command menu", commands: "Commands", bulk: "Bulk Import", searchPlaceholder: "Search title, trigger, tag, or response", clearSearch: "Clear search", search: "Search", filter: "Filter", export: "Export", legacy: "Commands stored in this browser can be imported.", import: "Import", savedCommands: "Saved commands", searchResults: "Search results", loading: "Loading commands...", noResults: "No commands found.", noResultsDetail: "Try another title, trigger, or tag.", emptyTitle: "No direct commands yet.", emptyDetail: "Register a question and response you use repeatedly.", auto: "Auto", enabled: "Enabled", disabled: "Disabled", edit: "Edit", delete: "Delete", deleteConfirm: (title: string) => `Delete “${title}”?`, loadMore: "Load more", exportedJson: "View exported JSON", editing: "Editing", newCommand: "New command", editCommand: "Edit command", commandRegistration: "Command registration", title: "Command name", titlePlaceholder: "Example: Daily work briefing", trigger: "Canonical trigger", triggerPlaceholder: "Example: Tell me what I need to do today", additionalTriggers: "Additional triggers", commaSeparated: "Comma separated", additionalPlaceholder: "Example: Summarize today’s schedule", response: "Response", responsePlaceholder: "Enter Heather’s fixed response.", tags: "Tags", tagsPlaceholder: "work, schedule", enable: "Enabled", save: "Save", cancel: "Cancel", jsonImport: "Import JSON", jsonPlaceholder: "Paste a JSON array.", invalidJson: "Check that this is a valid JSON array.", required: "Enter a command name, trigger, and response.", updated: "Direct command updated.", created: "Direct command created." } as const;
