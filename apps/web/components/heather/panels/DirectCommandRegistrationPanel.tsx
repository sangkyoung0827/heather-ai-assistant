"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Download, Pencil, Plus, Search, Trash2, Upload } from "lucide-react";
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
  const [storageState, setStorageState] = useState<"Connected" | "Local fallback" | "Unavailable">("Unavailable");

  const load = useCallback(async (query = search) => setCommands(await store.getAllDirectCommands(query)), [search, store]);
  useEffect(() => { void load("").catch(showError); setLegacy(readLegacyLocalStorageCommands()); void fetch("/api/system/storage-status").then((response) => response.json()).then((status: { provider?: string; connected?: boolean }) => setStorageState(status.provider === "supabase" && status.connected ? "Connected" : status.provider === "local" ? "Local fallback" : "Unavailable")).catch(() => setStorageState("Unavailable")); }, [load]);

  async function refresh() { await load(); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = { ...draft, title: draft.title.trim(), canonicalTrigger: draft.canonicalTrigger.trim(), response: draft.response.trim(), triggers: cleanList(draft.triggers), tags: cleanList(draft.tags) };
    if (!input.title || !input.canonicalTrigger || !input.response) return setNotice("명령 이름, 트리거, 응답을 모두 입력하세요.");
    try { if (editingId) await store.updateDirectCommand(editingId, input); else await store.createDirectCommand(input); setDraft(emptyInput); setEditingId(null); setNotice(editingId ? "직접명령을 수정했습니다." : "직접명령을 등록했습니다."); await refresh(); } catch (error) { showError(error); }
  }
  async function toggle(command: DirectCommand) { try { await store.updateDirectCommand(command.id, { enabled: !command.enabled }); await refresh(); } catch (error) { showError(error); } }
  async function remove(command: DirectCommand) { if (window.confirm(`“${command.title}” 직접명령을 삭제할까요?`)) try { await store.deleteDirectCommand(command.id); await refresh(); } catch (error) { showError(error); } }
  async function searchCommands(value: string) { setSearch(value); try { setCommands(await store.getAllDirectCommands(value)); } catch (error) { showError(error); } }
  async function importCommands(items: DirectCommandInput[]) { try { const summary = await store.importDirectCommands(items); setNotice(formatImportSummary(summary)); await refresh(); } catch (error) { showError(error); } }
  function showError(error: unknown) { setNotice(error instanceof Error ? error.message : "직접명령 요청을 완료하지 못했습니다."); }

  return <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
    <section className="rounded-lg border border-line bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold text-heather-700">Direct Command Registration</p><h3 className="text-lg font-semibold">직접명령 관리</h3></div><span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">{storageState}</span></div>
      {legacy.length > 0 && <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-heather-50 p-3 text-sm"><span>기존 브라우저 저장 명령을 서버로 가져올 수 있습니다.</span><button type="button" onClick={() => { void importCommands(legacy); setLegacy([]); }} className="rounded-md bg-heather-700 px-3 py-2 text-white">가져오기</button></div>}
      {notice && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{notice}</p>}
      <label className="mt-4 block text-sm font-medium">검색<input value={search} onChange={(event) => void searchCommands(event.target.value)} placeholder="명령 이름, 트리거, 태그 검색" className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2" /></label>
      <div className="mt-4 space-y-2">{commands.length === 0 && <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">등록된 직접명령이 없습니다.</p>}{commands.map((command) => <article key={command.id} className="rounded-lg border border-line bg-slate-50 p-3"><div className="flex items-start justify-between gap-3"><div><h4 className="font-semibold">{command.title}{command.createdBy === "auto" && <span className="ml-2 text-xs text-heather-700">자동 생성</span>}</h4><p className="mt-1 text-sm text-slate-600">{[command.canonicalTrigger, ...command.triggers].join(" · ")}</p><p className="mt-2 text-sm">{command.response}</p>{command.tags.length > 0 && <p className="mt-2 text-xs text-slate-500">{command.tags.map((tag) => `#${tag}`).join(" ")}</p>}</div><span className={`rounded-md px-2 py-1 text-xs ${command.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>{command.enabled ? "활성" : "비활성"}</span></div><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => void toggle(command)} className="rounded-md border border-line px-2 py-1 text-xs">{command.enabled ? "비활성화" : "활성화"}</button><button type="button" onClick={() => { setEditingId(command.id); setDraft({ title: command.title, canonicalTrigger: command.canonicalTrigger, triggers: command.triggers, response: command.response, enabled: command.enabled, tags: command.tags }); }} className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs"><Pencil className="h-3 w-3" />수정</button><button type="button" onClick={() => void remove(command)} className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs text-red-700"><Trash2 className="h-3 w-3" />삭제</button></div></article>)}</div>
    </section>
    <aside className="space-y-4"><form onSubmit={save} className="rounded-lg border border-line bg-white p-4"><div className="flex items-center justify-between"><h3 className="font-semibold">{editingId ? "직접명령 수정" : "직접명령 추가"}</h3><Plus className="h-4 w-4 text-heather-700" /></div><Field label="명령 이름" value={draft.title} onChange={(title) => setDraft({ ...draft, title })} /><Field label="기본 트리거" textarea value={draft.canonicalTrigger} onChange={(canonicalTrigger) => setDraft({ ...draft, canonicalTrigger })} /><Field label="추가 트리거" hint="쉼표로 구분" value={(draft.triggers || []).join(", ")} onChange={(value) => setDraft({ ...draft, triggers: value.split(",") })} /><Field label="응답" textarea value={draft.response} onChange={(response) => setDraft({ ...draft, response })} /><Field label="태그" hint="쉼표로 구분" value={(draft.tags || []).join(", ")} onChange={(value) => setDraft({ ...draft, tags: value.split(",") })} /><label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.enabled !== false} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} />활성화</label><div className="mt-4 flex gap-2"><button className="rounded-md bg-heather-700 px-3 py-2 text-sm text-white">{editingId ? "수정 저장" : "직접명령 등록"}</button>{editingId && <button type="button" onClick={() => { setEditingId(null); setDraft(emptyInput); }} className="rounded-md border border-line px-3 py-2 text-sm">취소</button>}</div></form>
      <section className="rounded-lg border border-line bg-white p-4"><div className="flex items-center gap-2 font-semibold"><Upload className="h-4 w-4 text-heather-700" />JSON 가져오기</div><textarea value={importText} onChange={(event) => setImportText(event.target.value)} placeholder="JSON 배열 붙여넣기" className="mt-3 min-h-24 w-full rounded-lg border border-line px-3 py-2 text-xs" /><button type="button" disabled={!importText.trim()} onClick={() => { try { const parsed = JSON.parse(importText) as DirectCommandInput[]; void importCommands(parsed); setImportText(""); } catch { setNotice("올바른 JSON 배열 형식인지 확인하세요."); } }} className="mt-2 rounded-md border border-line px-3 py-2 text-sm disabled:opacity-50">가져오기</button><div className="mt-4 flex items-center gap-2 font-semibold"><Download className="h-4 w-4 text-heather-700" />JSON 내보내기</div><button type="button" onClick={() => void store.exportDirectCommands().then((commands) => setExportText(JSON.stringify(commands, null, 2))).catch(showError)} className="mt-2 rounded-md border border-line px-3 py-2 text-sm">내보내기</button>{exportText && <textarea readOnly value={exportText} className="mt-2 min-h-24 w-full rounded-lg border border-line px-3 py-2 text-xs" />}</section>
    </aside>
  </div>;
}

function Field({ label, hint, textarea, value, onChange }: { label: string; hint?: string; textarea?: boolean; value: string; onChange: (value: string) => void }) { const Component = textarea ? "textarea" : "input"; return <label className="mt-3 block text-sm font-medium">{label}{hint && <span className="ml-2 text-xs text-slate-500">{hint}</span>}<Component value={value} onChange={(event) => onChange(event.target.value)} className={`mt-1 w-full rounded-lg border border-line px-3 py-2 ${textarea ? "min-h-20" : ""}`} /></label>; }
function cleanList(values: string[] | undefined) { return [...new Set((values || []).map((value) => value.trim()).filter(Boolean))]; }
function formatImportSummary(summary: ImportSummary) { return `가져오기 완료: 생성 ${summary.created} · 트리거 병합 ${summary.merged} · 건너뜀 ${summary.skipped} · 실패 ${summary.failed}`; }
