"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Download, Pencil, Plus, Search, Trash2, Upload } from "lucide-react";
import { normalizeDirectCommandText } from "../../../lib/direct-command-matching";
import {
  createDirectCommandStore,
  readLegacyLocalStorageCommands,
  type DirectCommand,
  type DirectCommandInput
} from "../../../lib/direct-command-store";
import { notifyDirectCommandsChanged } from "../../../lib/direct-command-events";

const emptyInput: DirectCommandInput = {
  title: "",
  question: "",
  response: "",
  enabled: true,
  tags: [],
  notes: ""
};

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

  const load = useCallback(async () => {
    setCommands(await store.getAllDirectCommands());
  }, [store]);

  useEffect(() => {
    void load().catch((error: unknown) => {
      setNotice(error instanceof Error ? error.message : "직접명령을 불러오지 못했습니다.");
    });
    setLegacy(readLegacyLocalStorageCommands());
  }, [load]);

  const filtered = commands.filter((command) => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return true;
    return [command.title, command.question, command.response, command.notes, command.tags.join(" ")]
      .join(" ")
      .toLowerCase()
      .includes(keyword);
  });
  const enabledCount = commands.filter((command) => command.enabled).length;

  async function refreshAfterMutation() {
    await load();
    notifyDirectCommandsChanged();
  }

  async function saveCommand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = {
      ...draft,
      title: draft.title.trim(),
      question: draft.question.trim(),
      response: draft.response.trim()
    };
    if (!input.title || !input.question || !input.response) {
      setNotice("제목, 질문, 응답을 모두 입력하세요.");
      return;
    }

    if (editingId) await store.updateDirectCommand(editingId, input);
    else await store.createDirectCommand(input);
    setDraft(emptyInput);
    setEditingId(null);
    setNotice(editingId ? "직접명령을 수정했습니다." : "직접명령을 등록했습니다.");
    await refreshAfterMutation();
  }

  async function toggle(command: DirectCommand) {
    if (command.enabled) await store.disableDirectCommand(command.id);
    else await store.enableDirectCommand(command.id);
    await refreshAfterMutation();
  }

  async function remove(command: DirectCommand) {
    if (!window.confirm(`“${command.title}” 직접명령을 삭제할까요?`)) return;
    await store.deleteDirectCommand(command.id);
    if (editingId === command.id) {
      setEditingId(null);
      setDraft(emptyInput);
    }
    await refreshAfterMutation();
  }

  async function migrateLegacy() {
    const imported = await store.importDirectCommands(legacy, "skip_duplicates");
    setNotice(`${imported.length}개 기존 localStorage 직접명령을 가져왔습니다.`);
    setLegacy([]);
    await refreshAfterMutation();
  }

  async function exportJson() {
    setExportText(JSON.stringify(await store.exportDirectCommands(), null, 2));
  }

  async function importJson() {
    try {
      const parsed = JSON.parse(importText) as Array<Partial<DirectCommandInput>>;
      const inputs = parsed
        .filter((item) => item.title && item.question && item.response)
        .map((item) => ({
          title: String(item.title),
          question: String(item.question),
          response: String(item.response),
          enabled: item.enabled !== false,
          tags: Array.isArray(item.tags) ? item.tags : [],
          notes: typeof item.notes === "string" ? item.notes : ""
        }));
      const imported = await store.importDirectCommands(inputs, "skip_duplicates");
      setImportText("");
      setNotice(`${imported.length}개 직접명령을 가져왔습니다.`);
      await refreshAfterMutation();
    } catch {
      setNotice("올바른 JSON 배열 형식인지 확인하세요.");
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="rounded-lg border border-line bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-sm font-semibold text-heather-700">Direct Command Registration</p><h3 className="text-lg font-semibold">직접명령 관리</h3></div>
          <div className="flex gap-2 text-xs text-slate-600"><span className="rounded-md bg-slate-100 px-2 py-1">전체 {commands.length}</span><span className="rounded-md bg-heather-50 px-2 py-1 text-heather-700">활성 {enabledCount}</span></div>
        </div>
        {!store.isConfigured && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Supabase 환경변수가 없어서 브라우저 localStorage에 저장합니다.</p>}
        {legacy.length > 0 && <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-heather-50 p-3 text-sm"><span>기존 localStorage 직접명령 {legacy.length}개를 찾았습니다.</span><button type="button" onClick={() => void migrateLegacy()} className="rounded-md bg-heather-700 px-3 py-2 text-white">가져오기</button></div>}
        {notice && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{notice}</p>}
        <label className="mt-4 block text-sm font-medium">검색<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="제목, 질문, 응답 검색" className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2" /></label>
        <div className="mt-4 space-y-2">
          {filtered.length === 0 && <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">등록된 직접명령이 없습니다.</p>}
          {filtered.map((command) => <article key={command.id} className="rounded-lg border border-line bg-slate-50 p-3"><div className="flex items-start justify-between gap-3"><div><h4 className="font-semibold">{command.title}</h4><p className="mt-1 text-sm text-slate-600">{command.question}</p><p className="mt-2 text-sm">{command.response}</p><p className="mt-2 text-xs text-slate-500">사용 {command.usageCount}회 · {command.lastUsedAt ? new Date(command.lastUsedAt).toLocaleString() : "아직 실행하지 않음"}</p></div><span className={`rounded-md px-2 py-1 text-xs ${command.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>{command.enabled ? "활성" : "비활성"}</span></div><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => void toggle(command)} className="rounded-md border border-line px-2 py-1 text-xs">{command.enabled ? "비활성화" : "활성화"}</button><button type="button" onClick={() => { setEditingId(command.id); setDraft({ title: command.title, question: command.question, response: command.response, enabled: command.enabled, tags: command.tags, notes: command.notes }); }} className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs"><Pencil className="h-3 w-3" />수정</button><button type="button" onClick={() => void remove(command)} className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs text-red-700"><Trash2 className="h-3 w-3" />삭제</button></div></article>)}
        </div>
      </section>
      <aside className="space-y-4">
        <form onSubmit={saveCommand} className="rounded-lg border border-line bg-white p-4"><div className="flex items-center justify-between"><h3 className="font-semibold">{editingId ? "직접명령 수정" : "직접명령 추가"}</h3><Plus className="h-4 w-4 text-heather-700" /></div><label className="mt-3 block text-sm font-medium">제목<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className="mt-1 w-full rounded-lg border border-line px-3 py-2" /></label><label className="mt-3 block text-sm font-medium">질문<textarea value={draft.question} onChange={(event) => setDraft({ ...draft, question: event.target.value })} className="mt-1 min-h-20 w-full rounded-lg border border-line px-3 py-2" /></label><p className="mt-2 break-all text-xs text-slate-500">정규화: {normalizeDirectCommandText(draft.question) || "-"}</p><label className="mt-3 block text-sm font-medium">응답<textarea value={draft.response} onChange={(event) => setDraft({ ...draft, response: event.target.value })} className="mt-1 min-h-24 w-full rounded-lg border border-line px-3 py-2" /></label><label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.enabled !== false} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} />활성화</label><div className="mt-4 flex gap-2"><button className="rounded-md bg-heather-700 px-3 py-2 text-sm text-white">{editingId ? "수정 저장" : "직접명령 등록"}</button>{editingId && <button type="button" onClick={() => { setEditingId(null); setDraft(emptyInput); }} className="rounded-md border border-line px-3 py-2 text-sm">취소</button>}</div></form>
        <section className="rounded-lg border border-line bg-white p-4"><div className="flex items-center gap-2 font-semibold"><Upload className="h-4 w-4 text-heather-700" />JSON 가져오기</div><textarea value={importText} onChange={(event) => setImportText(event.target.value)} placeholder="JSON 배열 붙여넣기" className="mt-3 min-h-24 w-full rounded-lg border border-line px-3 py-2 text-xs" /><button type="button" disabled={!importText.trim()} onClick={() => void importJson()} className="mt-2 rounded-md border border-line px-3 py-2 text-sm disabled:opacity-50">가져오기</button><div className="mt-4 flex items-center gap-2 font-semibold"><Download className="h-4 w-4 text-heather-700" />JSON 내보내기</div><button type="button" onClick={() => void exportJson()} className="mt-2 rounded-md border border-line px-3 py-2 text-sm">내보내기</button>{exportText && <textarea readOnly value={exportText} className="mt-2 min-h-24 w-full rounded-lg border border-line px-3 py-2 text-xs" />}</section>
      </aside>
    </div>
  );
}
