"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { findDirectCommandMatch, formatMatchMetadata, normalizeDirectCommandText } from "../lib/direct-command-matching";
import { createDirectCommandStore, readLegacyLocalStorageCommands, type DirectCommand, type DirectCommandInput } from "../lib/direct-command-store";

type View = "dashboard" | "chat" | "memory" | "directCommands";
type Message = { id: string; role: "user" | "assistant"; content: string; metadata?: string };
type ApiResponse = { message?: string; error?: string };

const menu: { id: View; label: string }[] = [
  { id: "dashboard", label: "대시보드" },
  { id: "chat", label: "채팅" },
  { id: "memory", label: "메모리" },
  { id: "directCommands", label: "직접명령등록" }
];

const emptyInput: DirectCommandInput = { title: "", question: "", response: "", enabled: true, tags: [], notes: "" };
const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export default function HeatherApp() {
  const store = useMemo(() => createDirectCommandStore(), []);
  const [view, setView] = useState<View>("dashboard");
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
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-4 p-4 md:flex-row">
        <aside className="rounded-3xl border border-slate-800 bg-slate-900 p-4 md:w-64">
          <div className="mb-6 rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-4"><p className="text-sm text-cyan-200">Heather 1.0</p><h1 className="text-2xl font-bold">헤더</h1></div>
          <nav className="space-y-2">{menu.map((item) => <button key={item.id} type="button" onClick={() => setView(item.id)} className={`w-full rounded-2xl px-4 py-3 text-left text-sm font-semibold ${view === item.id ? "bg-cyan-300 text-slate-950" : "bg-slate-950 text-slate-300"}`}>{item.label}</button>)}</nav>
        </aside>
        <section className="flex-1 rounded-3xl border border-slate-800 bg-slate-900 p-4 md:p-6">
          {notice && <p className="mb-4 rounded-2xl bg-cyan-300/10 p-3 text-sm text-cyan-100">{notice}</p>}
          {view === "dashboard" && <Dashboard total={commands.length} enabled={enabled} disabled={disabled} configured={store.isConfigured} />}
          {view === "chat" && <Chat messages={messages} value={chatInput} sending={sending} onChange={setChatInput} onSubmit={sendChat} />}
          {view === "memory" && <Memory />}
          {view === "directCommands" && <DirectCommands configured={store.isConfigured} commands={filtered} total={commands.length} enabled={enabled} disabled={disabled} draft={draft} editingId={editingId} search={search} legacyCount={legacy.length} importText={importText} exportText={exportText} setDraft={setDraft} setSearch={setSearch} setImportText={setImportText} saveCommand={saveCommand} edit={edit} remove={remove} toggle={toggle} cancel={() => { setDraft(emptyInput); setEditingId(null); }} migrate={migrate} exportJson={exportJson} importJson={importJson} />}
        </section>
      </div>
    </main>
  );
}

function Dashboard({ total, enabled, disabled, configured }: { total: number; enabled: number; disabled: number; configured: boolean }) {
  return <div><p className="text-sm text-cyan-200">대시보드</p><h2 className="mt-2 text-3xl font-bold">Heather 1.0</h2><div className="mt-6 grid gap-3 md:grid-cols-2"><Card label="저장소" value={configured ? "Supabase" : "local fallback"} /><Card label="등록된 직접명령" value={`${total}개`} /><Card label="활성" value={`${enabled}개`} /><Card label="비활성" value={`${disabled}개`} /></div></div>;
}

function Card({ label, value }: { label: string; value: string }) {
  return <article className="rounded-2xl border border-slate-800 bg-slate-950 p-4"><p className="text-sm text-slate-400">{label}</p><p className="mt-2 text-xl font-semibold">{value}</p></article>;
}

function Chat({ messages, value, sending, onChange, onSubmit }: { messages: Message[]; value: string; sending: boolean; onChange: (value: string) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <div><p className="text-sm text-cyan-200">채팅</p><h2 className="mt-2 text-3xl font-bold">Heather Chat</h2><div className="mt-6 h-[460px] space-y-3 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950 p-4">{messages.map((message) => <article key={message.id} className={`max-w-[90%] rounded-2xl border px-4 py-3 ${message.role === "user" ? "ml-auto border-cyan-300/30 bg-cyan-300/10" : "border-slate-700 bg-slate-900"}`}><p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>{message.role === "assistant" && message.metadata && <p className="mt-2 text-xs text-slate-500">{message.metadata}</p>}</article>)}</div><form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3 md:flex-row"><textarea value={value} onChange={(event) => onChange(event.target.value)} className="min-h-24 flex-1 rounded-2xl border border-slate-700 bg-slate-950 p-3 text-sm" /><button disabled={sending || !value.trim()} className="rounded-2xl bg-cyan-300 px-6 py-3 text-sm font-bold text-slate-950 disabled:opacity-50">보내기</button></form></div>;
}

function Memory() {
  return <div><p className="text-sm text-cyan-200">메모리</p><h2 className="mt-2 text-3xl font-bold">Memory</h2><div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950 p-5 text-slate-300">메모리는 다음 단계에서 구현됩니다.</div></div>;
}

function DirectCommands(props: { configured: boolean; commands: DirectCommand[]; total: number; enabled: number; disabled: number; draft: DirectCommandInput; editingId: string | null; search: string; legacyCount: number; importText: string; exportText: string; setDraft: (draft: DirectCommandInput) => void; setSearch: (value: string) => void; setImportText: (value: string) => void; saveCommand: (event: FormEvent<HTMLFormElement>) => void; edit: (command: DirectCommand) => void; remove: (id: string) => void; toggle: (command: DirectCommand) => void; cancel: () => void; migrate: () => void; exportJson: () => void; importJson: () => void }) {
  const d = props.draft;
  return <div><p className="text-sm text-cyan-200">직접명령등록</p><h2 className="mt-2 text-3xl font-bold">Direct Commands</h2>{!props.configured && <p className="mt-3 rounded-2xl bg-yellow-300/10 p-3 text-sm text-yellow-100">Supabase 환경변수가 설정되지 않았습니다. .env.local 또는 Vercel 환경변수를 확인하세요.</p>}{props.configured && props.legacyCount > 0 && <div className="mt-3 rounded-2xl bg-cyan-300/10 p-4"><p>브라우저에 저장된 직접명령을 Supabase로 옮길 수 있습니다.</p><button onClick={props.migrate} className="mt-3 rounded-xl bg-cyan-300 px-4 py-2 font-bold text-slate-950">Supabase로 이전</button></div>}<div className="mt-4 grid gap-3 md:grid-cols-3"><Card label="전체" value={`${props.total}개`} /><Card label="활성" value={`${props.enabled}개`} /><Card label="비활성" value={`${props.disabled}개`} /></div><input value={props.search} onChange={(event) => props.setSearch(event.target.value)} placeholder="직접명령 검색" className="mt-4 w-full rounded-2xl border border-slate-700 bg-slate-950 p-3" /><p className="mt-3 rounded-2xl bg-cyan-300/10 p-3 text-sm text-cyan-100">띄어쓰기, 간단한 문장부호, 호출어 차이는 자동으로 보정됩니다.</p><form onSubmit={props.saveCommand} className="mt-6 rounded-2xl border border-slate-800 bg-slate-950 p-4"><Field label="title"><input value={d.title} onChange={(event) => props.setDraft({ ...d, title: event.target.value })} className="w-full rounded-xl border border-slate-700 bg-slate-900 p-2" /></Field><Field label="question"><textarea value={d.question} onChange={(event) => props.setDraft({ ...d, question: event.target.value })} className="min-h-20 w-full rounded-xl border border-slate-700 bg-slate-900 p-2" /></Field><p className="mt-2 break-all rounded-xl bg-slate-900 p-3 text-xs text-slate-500">normalized preview: {normalizeDirectCommandText(d.question) || "-"}</p><Field label="response"><textarea value={d.response} onChange={(event) => props.setDraft({ ...d, response: event.target.value })} className="min-h-20 w-full rounded-xl border border-slate-700 bg-slate-900 p-2" /></Field><label className="mt-3 flex gap-2 text-sm"><input type="checkbox" checked={d.enabled !== false} onChange={(event) => props.setDraft({ ...d, enabled: event.target.checked })} />enabled</label><div className="mt-4 flex gap-2"><button className="rounded-xl bg-cyan-300 px-4 py-2 font-bold text-slate-950">{props.editingId ? "수정" : "추가"}</button>{props.editingId && <button type="button" onClick={props.cancel} className="rounded-xl bg-slate-800 px-4 py-2">취소</button>}</div></form><div className="mt-6 grid gap-3 md:grid-cols-2"><div><button onClick={props.exportJson} className="rounded-xl bg-slate-800 px-4 py-2">Export JSON</button>{props.exportText && <textarea readOnly value={props.exportText} className="mt-2 min-h-32 w-full rounded-xl bg-slate-950 p-3 text-xs" />}</div><div><textarea value={props.importText} onChange={(event) => props.setImportText(event.target.value)} placeholder="Import JSON" className="min-h-32 w-full rounded-xl bg-slate-950 p-3 text-xs" /><button onClick={props.importJson} disabled={!props.importText.trim()} className="mt-2 rounded-xl bg-slate-800 px-4 py-2 disabled:opacity-50">Import JSON</button></div></div><div className="mt-6 space-y-3">{props.commands.map((command) => <article key={command.id} className="rounded-2xl border border-slate-800 bg-slate-950 p-4"><h3 className="font-semibold">{command.title} <span className="text-xs text-slate-500">{command.enabled ? "enabled" : "disabled"}</span></h3><p className="mt-2 text-sm">{command.question}</p><p className="mt-1 break-all text-xs text-slate-500">normalized: {command.normalizedQuestion}</p><p className="mt-2 text-sm">{command.response}</p><p className="mt-2 text-xs text-slate-500">usage: {command.usageCount} · last used: {command.lastUsedAt ? new Date(command.lastUsedAt).toLocaleString() : "-"}</p><div className="mt-3 flex gap-2"><button onClick={() => props.toggle(command)} className="rounded-xl bg-slate-800 px-3 py-2 text-xs">{command.enabled ? "비활성화" : "활성화"}</button><button onClick={() => props.edit(command)} className="rounded-xl bg-slate-800 px-3 py-2 text-xs">수정</button><button onClick={() => props.remove(command.id)} className="rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-200">삭제</button></div></article>)}</div></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="mt-3 block text-sm"><span className="mb-1 block text-xs text-slate-500">{label}</span>{children}</label>;
}
