"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, FileText, Loader2, Search, Trash2, X } from "lucide-react";
import { createId, nowIso } from "@heather/core";
import type { HeatherLanguage, MemoryRecord } from "@heather/core";
import { DocumentIngestionPanel } from "./DocumentIngestionPanel";
import { getSupabaseBrowserClient } from "../../../lib/supabase-client";
import { PersonalMemoryScopeBar } from "./PersonalMemoryScopeBar";
import type { PersonalMemoryScope, PersonalMemoryScopeCounts } from "../../../lib/personal-memory-scope/server";

interface MemoryPanelProps {
  variant?: "personal" | "research";
  memories: MemoryRecord[];
  locale?: HeatherLanguage;
  onSaveMemory: (memory: MemoryRecord) => Promise<void>;
  onDeleteMemory: (id: string) => Promise<void>;
  auth?: { user: { email?: string | null } | null; ready: boolean; configured: boolean; signInWithGoogle: () => Promise<void>; signOut: () => Promise<void> };
}

const PAGE_SIZE = 30;
type PersonalScopeResponse = { counts: PersonalMemoryScopeCounts; records: MemoryRecord[]; searchCount: number };

export function MemoryPanel({ variant = "personal", memories, locale, onSaveMemory, onDeleteMemory, auth }: MemoryPanelProps) {
  const isResearch = variant === "research";
  const [resolvedLocale, setResolvedLocale] = useState<HeatherLanguage>(locale || "ko");
  const copy = isResearch ? (resolvedLocale === "en" ? EN_RESEARCH : KO_RESEARCH) : (resolvedLocale === "en" ? EN : KO);
  const [draftQuery, setDraftQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "editor">("list");
  const [scope, setScope] = useState<PersonalMemoryScope>("all");
  const [scopeData, setScopeData] = useState<PersonalScopeResponse | null>(null);
  const [scopeError, setScopeError] = useState("");

  useEffect(() => {
    if (locale) { setResolvedLocale(locale); return; }
    try {
      const raw = window.localStorage.getItem("heather.ai.settings");
      const settings = raw ? JSON.parse(raw) as { defaultLanguage?: HeatherLanguage } : null;
      setResolvedLocale(settings?.defaultLanguage === "en" ? "en" : "ko");
    } catch { setResolvedLocale("ko"); }
  }, [locale]);

  const localScopedMemories = useMemo(() => memories.filter((memory) => inScope(memory, variant) && !memory.archived), [memories, variant]);
  const scopedMemories = useMemo(() => !isResearch && scopeData ? scopeData.records : localScopedMemories, [isResearch, localScopedMemories, scopeData]);
  const filteredMemories = useMemo(() => {
    const query = appliedQuery.trim().toLocaleLowerCase();
    if (!query) return scopedMemories;
    return scopedMemories.filter((memory) => searchableMemory(memory).includes(query));
  }, [appliedQuery, scopedMemories]);
  const renderedMemories = filteredMemories.slice(0, visibleCount);
  const selected = scopedMemories.find((memory) => memory.id === selectedId) || null;

  useEffect(() => {
    const query = new URLSearchParams(window.location.search).get("q") || "";
    const initialScope = parsePersonalMemoryScope(new URLSearchParams(window.location.search).get("scope"));
    setDraftQuery(query); setAppliedQuery(query); setScope(initialScope);
  }, []);

  const loadPersonalScope = useCallback(async () => {
    if (isResearch || !auth?.user) return;
    try {
      const session = await getSupabaseBrowserClient()?.auth.getSession();
      const token = session?.data.session?.access_token;
      if (!token) return;
      setScopeError("");
      const params = new URLSearchParams({ scope });
      if (appliedQuery.trim()) params.set("q", appliedQuery.trim());
      const response = await fetch(`/api/memory/personal-scope?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const data = await response.json() as PersonalScopeResponse & { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not load personal memory scope.");
      setScopeData(data);
    } catch (reason) {
      setScopeData(null);
      setScopeError(reason instanceof Error ? reason.message : "Could not load personal memory scope.");
    }
  }, [appliedQuery, auth?.user, isResearch, scope]);

  useEffect(() => { void loadPersonalScope(); }, [loadPersonalScope]);

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [appliedQuery, scope]);

  useEffect(() => {
    if (!selected) return;
    setContent(selected.content);
  }, [selected]); // Intentionally preserve unsaved content while the list refreshes.

  function applySearch() {
    const next = draftQuery.trim();
    setAppliedQuery(next);
    const params = new URLSearchParams(window.location.search);
    params.set("scope", scope);
    if (next) params.set("q", next); else params.delete("q");
    window.history.replaceState(null, "", `${window.location.pathname}${params.size ? `?${params.toString()}` : ""}`);
  }

  function changeScope(nextScope: PersonalMemoryScope) {
    if (nextScope === scope) return;
    setScope(nextScope); setSelectedId(null); setContent("");
    const params = new URLSearchParams(window.location.search);
    params.set("scope", nextScope);
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }

  function startNewMemory() {
    setSelectedId(null); setContent(""); setError(""); setMobileView("editor");
  }

  function selectMemory(memory: MemoryRecord) {
    setSelectedId(memory.id); setContent(memory.content); setError(""); setMobileView("editor");
  }

  async function save() {
    const value = content.trim();
    if (!value || saving || isReadOnlySelected) return;
    setSaving(true); setError("");
    try {
      const timestamp = nowIso();
      const generated = buildMemoryMetadata(value, variant);
      const memory: MemoryRecord = selected
        ? { ...selected, ...generated, content: value, updated_at: timestamp }
        : { id: createId("memory"), content: value, created_at: timestamp, updated_at: timestamp, archived: false, confidence: .72, ...generated };
      await onSaveMemory(memory);
      setSelectedId(memory.id); setContent(memory.content);
      await loadPersonalScope();
    } catch {
      setError(copy.saveFailed);
    } finally { setSaving(false); }
  }

  async function remove() {
    if (!selected || saving || isReadOnlySelected) return;
    setSaving(true); setError("");
    try {
      await onDeleteMemory(selected.id);
      setSelectedId(null); setContent(""); setConfirmDelete(false); setMobileView("list");
      await loadPersonalScope();
    } catch {
      setError(copy.deleteFailed);
    } finally { setSaving(false); }
  }

  if (auth && !auth.ready) return <section className="memory-auth-gate"><div><p>로그인 상태를 확인하는 중입니다.</p></div></section>;
  if (auth && !auth.user) return <MemoryAuthGate copy={copy} auth={auth} />;

  const selectedIsDocument = Boolean(selected && isDocumentMemory(selected));
  const isReadOnlySelected = !isResearch && Boolean(selected && (selected.source !== "personal" || selectedIsDocument));
  const visibleTotal = !isResearch && scopeData ? scopeData.counts[scope] : scopedMemories.length;

  return <div className={`memory-workspace simple-memory-workspace ${mobileView === "editor" ? "is-mobile-editor" : "is-mobile-list"}`}>
    <aside className="memory-browser simple-memory-list">
      <header className="simple-memory-list-header"><div><h2>{copy.title}</h2><p>{countLabel(visibleTotal, resolvedLocale)}</p></div>{auth?.user ? <button type="button" className="memory-sign-out" onClick={() => void auth.signOut()}>{copy.signOut}</button> : null}</header>
      <form className="simple-memory-search" onSubmit={(event) => { event.preventDefault(); applySearch(); }}><Search /><input value={draftQuery} onChange={(event) => setDraftQuery(event.target.value)} placeholder={copy.search} aria-label={copy.search} /><button type="submit" className="sr-only">{copy.search}</button></form>
      {!isResearch ? <><PersonalMemoryScopeBar scope={scope} counts={scopeData?.counts || null} locale={resolvedLocale} onChange={changeScope} />{appliedQuery && scopeData ? <p className="personal-memory-search-result-count">{searchResultLabel(scopeData.searchCount, resolvedLocale)}</p> : null}{scopeError ? <p className="personal-memory-scope-error" role="status">{scopeError}</p> : null}</> : null}
      <div className="memory-list heather-scrollbar simple-memory-items">
        {renderedMemories.length ? renderedMemories.map((memory) => <button key={memory.id} type="button" onClick={() => selectMemory(memory)} className={`memory-row simple-memory-row ${selectedId === memory.id ? "is-selected" : ""}`}>{isDocumentMemory(memory) ? <DocumentMemoryRow memory={memory} locale={resolvedLocale} /> : isPersistentMemo(memory) ? <PersistentMemoRow memory={memory} locale={resolvedLocale} /> : <span className="simple-memory-content">{memory.content}</span>}<time>{formatDate(memory.updated_at, resolvedLocale)}</time></button>) : <MemoryEmpty query={Boolean(appliedQuery)} copy={copy} />}
        {renderedMemories.length < filteredMemories.length ? <button type="button" className="simple-memory-more" onClick={() => setVisibleCount((current) => current + PAGE_SIZE)}>{copy.loadMore}</button> : null}
      </div>
    </aside>
    <section className="memory-editor simple-memory-editor">
      {!isResearch ? <DocumentIngestionPanel scope="personal" locale={resolvedLocale} onRecordsChanged={loadPersonalScope} /> : null}
      <header className="simple-memory-editor-header"><button type="button" className="simple-memory-back" onClick={() => setMobileView("list")} aria-label={copy.back}><ArrowLeft /></button><div><h2>{selected ? copy.edit : copy.newMemory}</h2><p>{isReadOnlySelected ? (resolvedLocale === "en" ? "This source record is read-only." : "이 원본 기록은 읽기 전용입니다.") : copy.editorHint}</p></div><button type="button" className="simple-memory-new" onClick={startNewMemory} aria-label={copy.newMemory} title={copy.newMemory}>+</button></header>
      <label className="simple-memory-field"><span>{selectedIsDocument ? (resolvedLocale === "en" ? "File record" : "파일 기록") : copy.content}</span><textarea value={content} readOnly={isReadOnlySelected} maxLength={isResearch ? 20000 : 10000} onChange={(event) => setContent(event.target.value)} placeholder={copy.placeholder} /></label>
      <div className="simple-memory-editor-footer"><small>{content.length.toLocaleString()} / {(isResearch ? 20000 : 10000).toLocaleString()}</small><div>{selected && !isReadOnlySelected ? <button type="button" className="simple-memory-delete" disabled={saving} onClick={() => setConfirmDelete(true)}><Trash2 />{copy.delete}</button> : null}{!isReadOnlySelected ? <button type="button" className="simple-memory-save" disabled={!content.trim() || saving} onClick={() => void save()}>{saving ? <Loader2 className="animate-spin" /> : null}{saving ? copy.saving : copy.save}</button> : null}</div></div>
      {error ? <p className="simple-memory-error" role="alert">{error}</p> : null}
    </section>
    {confirmDelete && selected ? <DeleteDialog copy={copy} onCancel={() => setConfirmDelete(false)} onDelete={() => void remove()} loading={saving} /> : null}
  </div>;
}

function MemoryEmpty({ query, copy }: { query: boolean; copy: Copy }) { return <div className="simple-memory-empty"><strong>{query ? copy.noResults : copy.emptyTitle}</strong><p>{query ? "" : copy.emptyDescription}</p></div>; }
function DocumentMemoryRow({ memory, locale }: { memory: MemoryRecord; locale: HeatherLanguage }) {
  const title = memory.source.split(" · ").slice(1, -1).join(" · ") || memory.source.replace(/^(journal file|personal file) · /, "");
  const status = locale === "en" ? "Original file · ready for chat reading" : "원본 파일 · 개인 채팅에서 읽기 가능";
  return <span className="simple-memory-document"><FileText aria-hidden="true" /><span><strong>{title}</strong><small>{status}</small></span></span>;
}
function PersistentMemoRow({ memory, locale }: { memory: MemoryRecord; locale: HeatherLanguage }) {
  const [title, ...summary] = memory.content.split("\n");
  const entryCount = memory.source.match(/·\s*(\d+)\s+items/)?.[1] || "0";
  return <span className="simple-memory-document"><FileText aria-hidden="true" /><span><strong>{title}</strong><small>{summary.join(" ").slice(0, 160)}</small><small>{locale === "en" ? `${entryCount} entries` : `항목 ${entryCount}개`}</small></span></span>;
}
function MemoryAuthGate({ copy, auth }: { copy: Copy; auth: NonNullable<MemoryPanelProps["auth"]> }) { return <section className="memory-auth-gate"><div><h2>{copy.signInTitle}</h2><p>{auth.configured ? copy.signInDescription : copy.notConfigured}</p>{auth.configured ? <button type="button" onClick={() => void auth.signInWithGoogle()}>{copy.continueGoogle}</button> : null}</div></section>; }

function DeleteDialog({ copy, onCancel, onDelete, loading }: { copy: Copy; onCancel: () => void; onDelete: () => void; loading: boolean }) { return <div className="simple-memory-modal-backdrop" role="presentation"><section className="simple-memory-modal" role="dialog" aria-modal="true" aria-labelledby="memory-delete-title"><button type="button" className="simple-memory-modal-close" onClick={onCancel} aria-label={copy.cancel}><X /></button><h2 id="memory-delete-title">{copy.deleteTitle}</h2><p>{copy.deleteDescription}</p><footer><button type="button" className="simple-memory-delete" onClick={onCancel}>{copy.cancel}</button><button type="button" className="simple-memory-save is-danger" onClick={onDelete} disabled={loading}>{loading ? <Loader2 className="animate-spin" /> : null}{copy.delete}</button></footer></section></div>; }

function inScope(memory: MemoryRecord, variant: "personal" | "research") { return variant === "research" ? memory.type === "project_context" || memory.source.startsWith("research") : memory.type !== "project_context" && !memory.source.startsWith("research"); }
function isDocumentMemory(memory: MemoryRecord) { return /^(journal|direct)-document-/.test(memory.id); }
function isPersistentMemo(memory: MemoryRecord) { return memory.id.startsWith("persistent-memo-"); }
function searchableMemory(memory: MemoryRecord) { return `${memory.content} ${memory.source} ${memory.tags.join(" ")} ${memory.type}`.toLocaleLowerCase(); }
function formatDate(value: string, locale: HeatherLanguage) { return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ko-KR", { year: "numeric", month: "numeric", day: "numeric" }).format(new Date(value)); }
function countLabel(count: number, locale: HeatherLanguage) { return locale === "en" ? `${count} ${count === 1 ? "memory" : "memories"}` : `${count}개`; }
function searchResultLabel(count: number, locale: HeatherLanguage) { return locale === "en" ? `${count} search result${count === 1 ? "" : "s"}` : `검색 결과 ${count}건`; }
function parsePersonalMemoryScope(value: string | null): PersonalMemoryScope { return value === "journal" || value === "direct" || value === "project" ? value : "all"; }

function buildMemoryMetadata(content: string, variant: "personal" | "research"): Pick<MemoryRecord, "type" | "source" | "tags"> {
  const words = content.match(/[A-Za-z0-9가-힣]{2,}/g) || [];
  const tags = [...new Set(words.filter((word) => word.length >= 2).slice(0, 5))];
  if (variant === "research") return { type: "project_context", source: "research", tags };
  const type = /선호|좋아|싫어|말투|스타일/i.test(content) ? "writing_preference" : /결정|원칙|규칙/i.test(content) ? "decision_rule" : /반복|매주|매일|일정/i.test(content) ? "recurring_task" : "important_fact";
  return { type, source: "personal", tags };
}

const KO = { title: "개인 메모리", search: "개인 메모리 검색", content: "내용", placeholder: "Heather가 기억할 내용을 입력하세요.", save: "저장", saving: "저장 중...", delete: "삭제", cancel: "취소", edit: "개인 메모리", newMemory: "새 개인 메모리", editorHint: "자연어로 기억할 내용을 작성하세요.", emptyTitle: "아직 등록된 개인 메모리가 없습니다.", emptyDescription: "오른쪽 입력창에서 기억할 내용을 등록하세요.", noResults: "검색 결과가 없습니다.", loadMore: "더 보기", saveFailed: "저장하지 못했습니다. 내용을 유지한 채 다시 시도할 수 있습니다.", deleteFailed: "삭제하지 못했습니다. 다시 시도해주세요.", deleteTitle: "개인 메모리를 삭제할까요?", deleteDescription: "삭제한 메모리는 복구할 수 없습니다.", back: "메모리 목록으로", signInTitle: "메모리를 사용하려면 로그인하세요.", signInDescription: "개인 메모리는 Google 로그인 사용자별로 안전하게 분리됩니다.", continueGoogle: "Google로 계속하기", notConfigured: "메모리 인증이 아직 구성되지 않았습니다.", signOut: "로그아웃" };
const EN = { title: "Personal Memories", search: "Search personal memories", content: "Content", placeholder: "Enter something Heather should remember.", save: "Save", saving: "Saving...", delete: "Delete", cancel: "Cancel", edit: "Personal memory", newMemory: "New personal memory", editorHint: "Write naturally what Heather should remember.", emptyTitle: "No personal memories yet.", emptyDescription: "Add something to remember using the editor.", noResults: "No memories found.", loadMore: "Load more", saveFailed: "Could not save this memory. Your text is still here to retry.", deleteFailed: "Could not delete this memory. Please try again.", deleteTitle: "Delete this personal memory?", deleteDescription: "This action cannot be undone.", back: "Back to memories", signInTitle: "Sign in to use memory.", signInDescription: "Personal memories are safely separated for each Google account.", continueGoogle: "Continue with Google", notConfigured: "Memory authentication is not configured yet.", signOut: "Sign out" };
const KO_RESEARCH = { ...KO, title: "연구 메모리", search: "연구 메모리 검색", placeholder: "Heather가 기억할 연구 내용을 입력하세요.", edit: "연구 메모리", newMemory: "새 연구 메모리", editorHint: "연구 내용, 측정값, 결과를 자연어로 작성하세요.", emptyTitle: "아직 등록된 연구 메모리가 없습니다.", emptyDescription: "오른쪽 입력창에서 기억할 연구 내용을 등록하세요.", noResults: "검색 결과가 없습니다.", deleteTitle: "연구 메모리를 삭제할까요?", back: "연구 메모리 목록으로" };
const EN_RESEARCH = { ...EN, title: "Research Memories", search: "Search research memories", placeholder: "Enter research information Heather should remember.", edit: "Research memory", newMemory: "New research memory", editorHint: "Write research notes, measurements, and results naturally.", emptyTitle: "No research memories yet.", emptyDescription: "Add research information using the editor.", noResults: "No research memories found.", deleteTitle: "Delete this research memory?", back: "Back to research memories" };
type Copy = typeof KO;
