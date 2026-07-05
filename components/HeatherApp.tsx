"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { findDirectCommandMatch, formatMatchMetadata, normalizeDirectCommandText } from "../lib/direct-command-matching";
import { createDirectCommandStore, readLegacyLocalStorageCommands, type DirectCommand, type DirectCommandInput } from "../lib/direct-command-store";

type Message = { id: string; role: "user" | "assistant"; content: string; metadata?: string };
type ApiResponse = { message?: string; error?: string };

const emptyInput: DirectCommandInput = { title: "", question: "", response: "", enabled: true, tags: [], notes: "" };
const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export default function HeatherApp() {
  const store = useMemo(() => createDirectCommandStore(), []);
  const [commands, setCommands] = useState<DirectCommand[]>([]);
  const [draft, setDraft] = useState<DirectCommandInput>(emptyInput);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([{ id: "welcome", role: "assistant", content: "직접명령을 등록하면 저장된 답변을 그대로 반환합니다.", metadata: "api" }]);
  const [search, setSearch] = useState("");
  const [importText, setImportText] = useState("");
  const [exportText, setExportText] = useState("");
  const [notice, setNotice] = useState("");
  const [legacy, setLegacy] = useState<DirectCommandInput[]>([]);
  const [sending, setSending] = useState(false);

  async function load() {
    setCommands(await store.getAllDirectCommands());
  }

  useEffect(() => {
    void load().catch((error: unknown) => setNotice(error instanceof Error ? error.message : "직접명령을 불러오지 못했습니다."));
    setLegacy(readLegacyLocalStorageCommands());
  }, []);

  const enabled = commands.filter((command) => command.enabled).length;
  const disabled = commands.length - enabled;
  const filtered = commands.filter((command) => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return true;
    return [command.title, command.question, command.response, command.notes, command.tags.join(" ")].join(" ").toLowerCase().includes(keyword);
  });

  async function saveCommand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = { ...draft, title: draft.title.trim(), question: draft.question.trim() };
    if (!input.title || !input.question || !input.response) return;
    if (editingId) await store.updateDirectCommand(editingId, input);
    else await store.createDirectCommand(input);
    setDraft(emptyInput);
    setEditingId(null);
    await load();
  }

  async function sendChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = chatInput.trim();
    if (!text || sending) return;
    setChatInput("");
    setMessages((items) => [...items, { id: uid(), role: "user", content: text }]);
    const match = findDirectCommandMatch(text, commands);
    if (match) {
      const metadata = formatMatchMetadata(match).replace("direct_command · normalized", "direct_command_normalized").replace("direct_command · similarity", "direct_command_similarity");
      setMessages((items) => [...items, { id: uid(), role: "assistant", content: match.command.response, metadata }]);
      await store.incrementDirectCommandUsage(match.command.id);
      await load();
      return;
    }
    setSending(true);
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text }) });
      const data = (await response.json()) as ApiResponse;
      setMessages((items) => [...items, { id: uid(), role: "assistant", content: data.message || data.error || "등록된 직접명령이 없어 API 응답으로 처리해야 합니다.", metadata: "api" }]);
    } catch {
      setMessages((items) => [...items, { id: uid(), role: "assistant", content: "등록된 직접명령이 없어 API 응답으로 처리해야 합니다.", metadata: "api" }]);
    } finally {
      setSending(false);
    }
  }

  async function toggle(command: DirectCommand) {
    if (command.enabled) await store.disableDirectCommand(command.id);
    else await store.enableDirectCommand(command.id);
    await load();
  }

  async function remove(id: string) {
    await store.deleteDirectCommand(id);
    await load();
  }

  function edit(command: DirectCommand) {
    setEditingId(command.id);
    setDraft({ title: command.title, question: command.question, response: command.response, enabled: command.enabled, tags: command.tags, notes: command.notes });
  }

  async function migrate() {
    const rows = await store.importDirectCommands(legacy, "skip_duplicates");
    setNotice(`직접명령 이전이 완료되었습니다. ${rows.length}개 이전됨.`);
    setLegacy([]);
    await load();
  }

  async function exportJson() {
    setExportText(JSON.stringify(await store.exportDirectCommands(), null, 2));
  }

  async function importJson() {
    const parsed = JSON.parse(importText) as Array<Partial<DirectCommand>>;
    const inputs = parsed.filter((item) => item.title && item.question && item.response).map((item) => ({ title: String(item.title), question: String(item.question), response: String(item.response), enabled: item.enabled !== false, tags: Array.isArray(item.tags) ? item.tags : [], notes: typeof item.notes === "string" ? item.notes : "" }));
    const rows = await store.importDirectCommands(inputs, "skip_duplicates");
    setNotice(`${rows.length}개 직접명령을 가져왔습니다.`);
    setImportText("");
    await load();
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top,#123047_0,#020617_42%,#020617_100%)] text-slate-100">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <Header configured={store.isConfigured} total={commands.length} enabled={enabled} sending={sending} />
        {notice && <p className="rounded-2xl bg-cyan-300/10 px-4 py-3 text-sm text-cyan-100 ring-1 ring-cyan-300/20">{notice}</p>}
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(360px,0.85fr)]">
          <ChatPanel messages={messages} value={chatInput} sending={sending} onChange={setChatInput} onSubmit={sendChat} />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-1">
            <MemoryPanel />
            <DirectCommandsPanel configured={store.isConfigured} commands={filtered} total={commands.length} enabled={enabled} disabled={disabled} draft={draft} editingId={editingId} search={search} legacyCount={legacy.length} importText={importText} exportText={exportText} setDraft={setDraft} setSearch={setSearch} setImportText={setImportText} saveCommand={saveCommand} edit={edit} remove={remove} toggle={toggle} cancel={() => { setDraft(emptyInput); setEditingId(null); }} migrate={migrate} exportJson={exportJson} importJson={importJson} />
          </div>
        </section>
      </div>
    </main>
  );
}

function Header({ configured, total, enabled, sending }: { configured: boolean; total: number; enabled: number; sending: boolean }) {
  return (
    <header className="rounded-3xl bg-white/[0.06] px-4 py-4 shadow-2xl shadow-black/20 ring-1 ring-white/10 backdrop-blur md:px-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-200/80">Heather Control</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white md:text-3xl">헤더 통합 대시보드</h1>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs sm:flex sm:flex-wrap sm:justify-end">
          <Status label="Voice" value="standby" />
          <Status label="Mode" value={sending ? "responding" : "direct/API"} />
          <Status label="Store" value={configured ? "Supabase" : "local"} />
          <Status label="Commands" value={`${enabled}/${total}`} />
        </div>
      </div>
    </header>
  );
}

function Status({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-slate-950/60 px-3 py-2 ring-1 ring-white/10"><p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1 font-semibold text-cyan-100">{value}</p></div>;
}

function ChatPanel({ messages, value, sending, onChange, onSubmit }: { messages: Message[]; value: string; sending: boolean; onChange: (value: string) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <section className="flex min-h-[72vh] flex-col rounded-3xl bg-slate-900/80 p-4 shadow-2xl shadow-black/25 ring-1 ring-white/10 backdrop-blur md:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div><p className="text-sm font-semibold text-cyan-200">Main Chat</p><h2 className="text-xl font-bold text-white">대화 제어 패널</h2></div>
        <span className="rounded-full bg-cyan-300/10 px-3 py-1 text-xs text-cyan-100 ring-1 ring-cyan-300/20">metadata subtle</span>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto rounded-2xl bg-slate-950/70 p-3 ring-1 ring-white/5 md:p-4">
        {messages.map((message) => <article key={message.id} className={`max-w-[92%] rounded-2xl px-4 py-3 ${message.role === "user" ? "ml-auto bg-cyan-300/12 ring-1 ring-cyan-300/20" : "bg-white/[0.06] ring-1 ring-white/10"}`}><p className="whitespace-pre-wrap text-sm leading-6 text-slate-50">{message.content}</p>{message.role === "assistant" && message.metadata && <p className="mt-2 text-[11px] text-slate-500">{message.metadata}</p>}</article>)}
      </div>
      <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3 md:flex-row">
        <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder="헤더에게 요청하거나 직접명령을 입력하세요." className="min-h-24 flex-1 resize-none rounded-2xl border border-white/10 bg-slate-950/80 p-4 text-sm text-white outline-none transition focus:border-cyan-300/60" />
        <button disabled={sending || !value.trim()} className="rounded-2xl bg-cyan-300 px-6 py-3 text-sm font-bold text-slate-950 transition disabled:opacity-50 md:w-28">보내기</button>
      </form>
    </section>
  );
}

function MemoryPanel() {
  return (
    <section className="rounded-3xl bg-white/[0.055] p-4 ring-1 ring-white/10 backdrop-blur">
      <div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-cyan-200">Memory</p><h2 className="text-lg font-bold text-white">메모리 요약</h2></div><span className="rounded-full bg-slate-950/70 px-3 py-1 text-xs text-slate-400">next phase</span></div>
      <div className="mt-4 rounded-2xl bg-slate-950/60 p-4 text-sm leading-6 text-slate-300 ring-1 ring-white/5">메모리는 다음 단계에서 구현됩니다. 현재 화면에서는 핵심 기억과 작업 상태가 이 영역에 요약됩니다.</div>
    </section>
  );
}

function DirectCommandsPanel(props: { configured: boolean; commands: DirectCommand[]; total: number; enabled: number; disabled: number; draft: DirectCommandInput; editingId: string | null; search: string; legacyCount: number; importText: string; exportText: string; setDraft: (draft: DirectCommandInput) => void; setSearch: (value: string) => void; setImportText: (value: string) => void; saveCommand: (event: FormEvent<HTMLFormElement>) => void; edit: (command: DirectCommand) => void; remove: (id: string) => void; toggle: (command: DirectCommand) => void; cancel: () => void; migrate: () => void; exportJson: () => void; importJson: () => void }) {
  const d = props.draft;
  return (
    <section className="rounded-3xl bg-white/[0.055] p-4 ring-1 ring-white/10 backdrop-blur">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-sm font-semibold text-cyan-200">Direct Commands</p><h2 className="text-lg font-bold text-white">직접명령 관리</h2></div><div className="flex gap-2 text-xs"><Badge value={`전체 ${props.total}`} /><Badge value={`활성 ${props.enabled}`} /><Badge value={`비활성 ${props.disabled}`} /></div></div>
      {!props.configured && <p className="mt-3 rounded-2xl bg-yellow-300/10 p-3 text-sm text-yellow-100 ring-1 ring-yellow-300/20">Supabase 환경변수가 설정되지 않았습니다. .env.local 또는 Vercel 환경변수를 확인하세요.</p>}
      {props.configured && props.legacyCount > 0 && <div className="mt-3 rounded-2xl bg-cyan-300/10 p-3 text-sm text-cyan-100 ring-1 ring-cyan-300/20"><p>브라우저에 저장된 직접명령을 Supabase로 옮길 수 있습니다.</p><button type="button" onClick={props.migrate} className="mt-2 rounded-xl bg-cyan-300 px-3 py-2 text-xs font-bold text-slate-950">Supabase로 이전</button></div>}
      <input value={props.search} onChange={(event) => props.setSearch(event.target.value)} placeholder="직접명령 검색" className="mt-4 w-full rounded-2xl border border-white/10 bg-slate-950/70 p-3 text-sm text-white outline-none focus:border-cyan-300/60" />
      <form onSubmit={props.saveCommand} className="mt-4 rounded-2xl bg-slate-950/55 p-3 ring-1 ring-white/5">
        <div className="grid gap-2 sm:grid-cols-2"><input value={d.title} onChange={(event) => props.setDraft({ ...d, title: event.target.value })} placeholder="title" className="rounded-xl border border-white/10 bg-slate-900 p-2 text-sm outline-none" /><label className="flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm text-slate-300"><input type="checkbox" checked={d.enabled !== false} onChange={(event) => props.setDraft({ ...d, enabled: event.target.checked })} />enabled</label></div>
        <textarea value={d.question} onChange={(event) => props.setDraft({ ...d, question: event.target.value })} placeholder="question" className="mt-2 min-h-16 w-full resize-none rounded-xl border border-white/10 bg-slate-900 p-2 text-sm outline-none" />
        <p className="mt-2 break-all text-[11px] text-slate-500">normalized: {normalizeDirectCommandText(d.question) || "-"}</p>
        <textarea value={d.response} onChange={(event) => props.setDraft({ ...d, response: event.target.value })} placeholder="response" className="mt-2 min-h-16 w-full resize-none rounded-xl border border-white/10 bg-slate-900 p-2 text-sm outline-none" />
        <div className="mt-3 flex flex-wrap gap-2"><button className="rounded-xl bg-cyan-300 px-4 py-2 text-xs font-bold text-slate-950">{props.editingId ? "수정" : "추가"}</button>{props.editingId && <button type="button" onClick={props.cancel} className="rounded-xl bg-white/10 px-4 py-2 text-xs text-white">취소</button>}</div>
      </form>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row"><button type="button" onClick={props.exportJson} className="rounded-xl bg-white/10 px-3 py-2 text-xs text-white">Export JSON</button><button type="button" onClick={props.importJson} disabled={!props.importText.trim()} className="rounded-xl bg-white/10 px-3 py-2 text-xs text-white disabled:opacity-50">Import JSON</button></div>
      <textarea value={props.importText} onChange={(event) => props.setImportText(event.target.value)} placeholder="Import JSON 붙여넣기" className="mt-2 min-h-20 w-full rounded-xl border border-white/10 bg-slate-950/60 p-2 text-xs text-slate-300 outline-none" />
      {props.exportText && <textarea readOnly value={props.exportText} className="mt-2 min-h-20 w-full rounded-xl border border-white/10 bg-slate-950/60 p-2 text-xs text-slate-300 outline-none" />}
      <div className="mt-4 max-h-[360px] space-y-2 overflow-y-auto pr-1">{props.commands.length === 0 && <p className="rounded-2xl bg-slate-950/50 p-3 text-sm text-slate-400">등록된 직접명령이 없습니다.</p>}{props.commands.map((command) => <article key={command.id} className="rounded-2xl bg-slate-950/55 p-3 ring-1 ring-white/5"><div className="flex items-start justify-between gap-2"><h3 className="text-sm font-semibold text-white">{command.title}</h3><span className="text-[11px] text-slate-500">{command.enabled ? "enabled" : "disabled"}</span></div><p className="mt-2 line-clamp-2 text-xs text-slate-300">{command.question}</p><p className="mt-1 text-[11px] text-slate-500">usage {command.usageCount} · {command.lastUsedAt ? new Date(command.lastUsedAt).toLocaleString() : "-"}</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => props.toggle(command)} className="rounded-lg bg-white/10 px-2 py-1 text-[11px] text-white">{command.enabled ? "비활성화" : "활성화"}</button><button type="button" onClick={() => props.edit(command)} className="rounded-lg bg-white/10 px-2 py-1 text-[11px] text-white">수정</button><button type="button" onClick={() => props.remove(command.id)} className="rounded-lg bg-red-500/10 px-2 py-1 text-[11px] text-red-200">삭제</button></div></article>)}</div>
    </section>
  );
}

function Badge({ value }: { value: string }) {
  return <span className="rounded-full bg-slate-950/70 px-2.5 py-1 text-slate-300 ring-1 ring-white/10">{value}</span>;
}
