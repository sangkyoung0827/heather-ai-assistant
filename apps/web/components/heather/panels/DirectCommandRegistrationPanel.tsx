"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Download, Filter, Pencil, Plus, Search, Trash2, Upload } from "lucide-react";
import { createDirectCommandStore, readLegacyLocalStorageCommands, type DirectCommand, type DirectCommandInput, type ImportSummary } from "../../../lib/direct-command-store";

const emptyInput: DirectCommandInput = { title: "", canonicalTrigger: "", triggers: [], response: "", enabled: true, tags: [] };

export function DirectCommandRegistrationPanel() {
  const store = useMemo(() => createDirectCommandStore(), []);
  const [commands, setCommands] = useState<DirectCommand[]>([]);
  const [draft, setDraft] = useState<DirectCommandInput>(emptyInput);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [importText, setImportText] = useState("");
  const [exportText, setExportText] = useState("");
  const [legacy, setLegacy] = useState<DirectCommandInput[]>([]);
  const [notice, setNotice] = useState("");

  const load = useCallback(async (query = search) => setCommands(await store.getAllDirectCommands(query)), [search, store]);
  useEffect(() => { void load("").catch(showError); setLegacy(readLegacyLocalStorageCommands()); }, [load]);

  async function refresh() { await load(); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = { ...draft, title: draft.title.trim(), canonicalTrigger: draft.canonicalTrigger.trim(), response: draft.response.trim(), triggers: cleanList(draft.triggers), tags: cleanList(draft.tags) };
    if (!input.title || !input.canonicalTrigger || !input.response) return setNotice("명령 이름, 트리거, 응답을 모두 입력하세요.");
    try {
      if (editingId) await store.updateDirectCommand(editingId, input); else await store.createDirectCommand(input);
      setDraft(emptyInput); setEditingId(null); setNotice(editingId ? "직접명령을 수정했습니다." : "직접명령을 등록했습니다."); await refresh();
    } catch (error) { showError(error); }
  }
  async function toggle(command: DirectCommand) { try { await store.updateDirectCommand(command.id, { enabled: !command.enabled }); await refresh(); } catch (error) { showError(error); } }
  async function remove(command: DirectCommand) { if (window.confirm(`“${command.title}” 직접명령을 삭제할까요?`)) try { await store.deleteDirectCommand(command.id); if (editingId === command.id) { setEditingId(null); setDraft(emptyInput); } await refresh(); } catch (error) { showError(error); } }
  async function searchCommands(value: string) { setSearch(value); try { setCommands(await store.getAllDirectCommands(value)); } catch (error) { showError(error); } }
  async function importCommands(items: DirectCommandInput[]) { try { const summary = await store.importDirectCommands(items); setNotice(formatImportSummary(summary)); await refresh(); } catch (error) { showError(error); } }
  function edit(command: DirectCommand) { setEditingId(command.id); setDraft({ title: command.title, canonicalTrigger: command.canonicalTrigger, triggers: command.triggers, response: command.response, enabled: command.enabled, tags: command.tags }); }
  function showError(error: unknown) { setNotice(error instanceof Error ? error.message : "직접명령 요청을 완료하지 못했습니다."); }

  return <><nav className="direct-page-tabs" aria-label="직접명령 메뉴"><a href="/direct-commands" className="is-active">등록된 명령</a><a href="/direct-commands/new">직접명령 추가</a><a href="/direct-commands/bulk-import">대량 등록</a></nav><div className="direct-workspace">
    <section className="direct-library">
      <div className="direct-toolbar">
        <label className="direct-search"><Search className="h-4 w-4" /><input value={search} onChange={(event) => void searchCommands(event.target.value)} placeholder="명령 이름 또는 트리거 검색" /></label>
        <button type="button" className="workspace-icon-button" title="필터" aria-label="필터"><Filter className="h-4 w-4" /></button>
        <button type="button" className="workspace-secondary-button" onClick={() => void store.exportDirectCommands().then((items) => setExportText(JSON.stringify(items, null, 2))).catch(showError)}><Download className="h-4 w-4" /> 내보내기</button>
      </div>
      {(notice || legacy.length > 0) && <div className="workspace-notice">{notice || "기존 브라우저에 저장된 명령을 가져올 수 있습니다."}{legacy.length > 0 && <button type="button" onClick={() => { void importCommands(legacy); setLegacy([]); }}>가져오기</button>}</div>}
      <div className="direct-list-heading"><span>등록된 직접명령</span><span>{commands.length}</span></div>
      <div className="direct-command-list heather-scrollbar">
        {commands.length === 0 ? <div className="workspace-empty"><strong>아직 등록된 직접명령이 없습니다.</strong><p>반복해서 사용하는 질문과 응답을 등록해보세요.</p></div> : commands.map((command) => <article key={command.id} className={`direct-command-row ${editingId === command.id ? "is-selected" : ""}`}>
          <button type="button" className="direct-command-select" onClick={() => edit(command)}><span className="direct-command-title">{command.title}{command.createdBy === "auto" && <em className="auto-command-badge">자동 생성</em>}</span><span className="direct-command-trigger">{command.canonicalTrigger}</span></button>
          <div className="direct-command-actions"><button type="button" onClick={() => void toggle(command)} className={`command-state ${command.enabled ? "is-enabled" : ""}`}>{command.enabled ? "활성" : "비활성"}</button><button type="button" onClick={() => edit(command)} className="workspace-icon-button" title="수정" aria-label="수정"><Pencil className="h-4 w-4" /></button><button type="button" onClick={() => void remove(command)} className="workspace-icon-button is-danger" title="삭제" aria-label="삭제"><Trash2 className="h-4 w-4" /></button></div>
        </article>)}
      </div>
      {exportText && <details className="transfer-details"><summary>내보낸 JSON 보기</summary><textarea readOnly value={exportText} /></details>}
    </section>
    <aside className="direct-editor">
      <form onSubmit={save}>
        <div className="editor-heading"><div><p>{editingId ? "편집 중" : "새 직접명령"}</p><h2>{editingId ? "직접명령 수정" : "직접명령 등록"}</h2></div><Plus className="h-5 w-5" /></div>
        <Field label="명령 이름" value={draft.title} onChange={(title) => setDraft({ ...draft, title })} placeholder="예: 오늘의 업무 브리핑" />
        <Field label="기본 트리거" value={draft.canonicalTrigger} onChange={(canonicalTrigger) => setDraft({ ...draft, canonicalTrigger })} placeholder="예: 오늘 해야 할 일을 알려줘" />
        <Field label="추가 트리거" hint="쉼표로 구분" value={(draft.triggers || []).join(", ")} onChange={(value) => setDraft({ ...draft, triggers: value.split(",") })} placeholder="예: 오늘 일정 정리해줘" />
        {(draft.triggers || []).filter(Boolean).length > 0 && <div className="trigger-chips">{cleanList(draft.triggers).map((trigger) => <span key={trigger}>{trigger}</span>)}</div>}
        <Field label="응답" textarea value={draft.response} onChange={(response) => setDraft({ ...draft, response })} placeholder="Heather가 답변할 내용을 입력하세요." />
        <Field label="태그" hint="쉼표로 구분" value={(draft.tags || []).join(", ")} onChange={(value) => setDraft({ ...draft, tags: value.split(",") })} placeholder="업무, 일정" />
        <label className="toggle-row"><input type="checkbox" checked={draft.enabled !== false} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} /><span />활성화</label>
        <div className="editor-footer"><button className="workspace-primary-button">저장</button>{editingId && <button type="button" onClick={() => { setEditingId(null); setDraft(emptyInput); }} className="workspace-secondary-button">취소</button>}</div>
      </form>
      <details className="transfer-details"><summary><Upload className="h-4 w-4" /> JSON 가져오기</summary><textarea value={importText} onChange={(event) => setImportText(event.target.value)} placeholder="JSON 배열을 붙여넣으세요." /><button type="button" className="workspace-secondary-button" disabled={!importText.trim()} onClick={() => { try { const parsed = JSON.parse(importText) as DirectCommandInput[]; void importCommands(parsed); setImportText(""); } catch { setNotice("올바른 JSON 배열 형식인지 확인하세요."); } }}>가져오기</button></details>
    </aside>
  </div></>;
}

function Field({ label, hint, textarea, value, onChange, placeholder }: { label: string; hint?: string; textarea?: boolean; value: string; onChange: (value: string) => void; placeholder?: string }) { const Component = textarea ? "textarea" : "input"; return <label className="workspace-field"><span>{label}{hint && <small>{hint}</small>}</span><Component value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label>; }
function cleanList(values: string[] | undefined) { return [...new Set((values || []).map((value) => value.trim()).filter(Boolean))]; }
function formatImportSummary(summary: ImportSummary) { return `가져오기 완료: 생성 ${summary.created} · 트리거 병합 ${summary.merged} · 건너뜀 ${summary.skipped} · 실패 ${summary.failed}`; }
