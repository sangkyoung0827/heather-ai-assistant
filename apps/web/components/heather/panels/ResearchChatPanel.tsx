"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FlaskConical, Loader2, MessageSquarePlus, Search, Send, Trash2 } from "lucide-react";
import { createConversation, createId, createMessage, generateConversationTitle, nowIso } from "@heather/core";
import type { ChatRequestPayload, Conversation, HeatherSettings, MemoryRecord, ProjectRecord } from "@heather/core";

type ResearchConversation = Conversation & { conversationType: "research" };
type ResearchResponse = { message: string; title?: string; evidence?: Array<{ type: "research_memory"; title: string }>; error?: string };
const STORAGE_KEY = "heather.ai.research-conversations.v1";

export function ResearchChatPanel({ memories, projects, settings }: { memories: MemoryRecord[]; projects: ProjectRecord[]; settings: HeatherSettings }) {
  const [conversations, setConversations] = useState<ResearchConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [isSending, setIsSending] = useState(false);
  const lockRef = useRef(false);
  const active = conversations.find((conversation) => conversation.id === activeId) || null;
  const researchMemories = useMemo(() => memories.filter((memory) => !memory.archived && (memory.type === "project_context" || memory.source.startsWith("research"))), [memories]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      const parsed = stored ? JSON.parse(stored) as ResearchConversation[] : [];
      setConversations(parsed.filter((conversation) => conversation.conversationType === "research"));
    } catch {
      setConversations([]);
    }
  }, []);

  useEffect(() => {
    if (conversations.length) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
    else window.localStorage.removeItem(STORAGE_KEY);
  }, [conversations]);

  const visible = conversations.filter((conversation) => `${conversation.title} ${conversation.messages.map((message) => message.content).join(" ")}`.toLowerCase().includes(search.trim().toLowerCase()));
  const update = (conversation: ResearchConversation) => setConversations((current) => [conversation, ...current.filter((item) => item.id !== conversation.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
  const createResearchConversation = () => ({ ...createConversation(), conversationType: "research" as const });

  async function send() {
    const message = draft.trim();
    if (!message || isSending || lockRef.current) return;
    lockRef.current = true;
    setIsSending(true);
    setDraft("");
    const base = active || createResearchConversation();
    const userMessage = createMessage("user", message);
    const optimistic: ResearchConversation = { ...base, title: base.messages.length ? base.title : generateConversationTitle(message), messages: [...base.messages, userMessage], updatedAt: nowIso() };
    setActiveId(optimistic.id);
    update(optimistic);
    try {
      const payload: ChatRequestPayload = { message, messageId: userMessage.id, conversation: optimistic, settings, memories: researchMemories, projects, teachings: [], automationRecipes: [] };
      const response = await fetch("/api/research/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json() as ResearchResponse;
      if (!response.ok || data.error) throw new Error(data.error || "Research chat request failed.");
      update({ ...optimistic, title: optimistic.messages.length <= 1 ? data.title || optimistic.title : optimistic.title, messages: [...optimistic.messages, createMessage("assistant", data.message)], updatedAt: nowIso() });
    } catch (error) {
      update({ ...optimistic, messages: [...optimistic.messages, createMessage("assistant", `연구 응답을 완성하지 못했습니다. ${error instanceof Error ? error.message : "알 수 없는 오류"}`)], updatedAt: nowIso() });
    } finally {
      lockRef.current = false;
      setIsSending(false);
    }
  }

  return <div className="chat-workspace research-chat-workspace">
    <aside className="chat-conversation-panel"><div className="chat-list-toolbar"><button type="button" className="chat-new-conversation" onClick={() => { const next = createResearchConversation(); update(next); setActiveId(next.id); }}><MessageSquarePlus className="h-4 w-4" /> 새 연구 대화</button><label className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="연구 대화 검색" className="h-10 w-full rounded-lg border border-line bg-white pl-9 pr-3 text-sm" /></label></div><div className="chat-list-section"><span>최근 연구 주제</span></div><div className="chat-conversation-list heather-scrollbar">{visible.length ? visible.map((conversation) => <button key={conversation.id} type="button" onClick={() => setActiveId(conversation.id)} className={`chat-conversation-row group ${activeId === conversation.id ? "border-heather-500 bg-white" : "border-line bg-white hover:border-heather-300"}`}><span className="block truncate text-sm font-semibold">{conversation.title}</span><span className="mt-1 block truncate text-xs text-slate-500">{conversation.messages.at(-1)?.content || "아직 메시지가 없습니다."}</span><span role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); setConversations((current) => current.filter((item) => item.id !== conversation.id)); if (activeId === conversation.id) setActiveId(null); }} className="mt-2 grid h-7 w-7 place-items-center rounded-md text-slate-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100" aria-label="연구 대화 삭제"><Trash2 className="h-3.5 w-3.5" /></span></button>) : <p className="chat-list-empty">저장된 연구 대화가 없습니다.</p>}</div></aside>
    <section className="chat-main-panel"><div className="chat-main-header"><div><h3>{active?.title || "새 연구 대화"}</h3><p>연구자료, 실험 기록과 생산 공정을 분석하는 전문 작업 공간입니다.</p></div><span className="chat-status-dot"><span />Researcher</span></div><div className="chat-message-area heather-scrollbar">{active?.messages.length ? active.messages.map((message) => <article key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}><div className={`chat-message max-w-[880px] ${message.role === "user" ? "border-heather-500 bg-heather-700 text-white" : "border-line bg-white text-ink"}`}><div className="whitespace-pre-wrap">{message.content}</div></div></article>) : <div className="chat-welcome"><div className="chat-welcome-icon"><FlaskConical className="h-6 w-6" /></div><h2>무엇을 연구할까요?</h2><p>연구자료 분석, 실험 비교, 가설 설정과 생산 공정 검토를 요청하세요.</p><div className="chat-suggestions">{["연구자료를 요약해줘", "실험 조건을 비교해줘", "연구 가설을 만들어줘", "다음 실험을 설계해줘", "생산 공정을 검토해줘"].map((prompt) => <button key={prompt} type="button" onClick={() => setDraft(prompt)}>{prompt}<span>›</span></button>)}</div></div>}{isSending && <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Heather Researcher가 분석하고 있습니다.</div>}</div><div className="chat-composer-wrap"><div className="chat-composer"><textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} placeholder="연구 분석 요청을 입력하세요." className="min-h-12 flex-1 resize-none rounded-lg border border-line bg-white px-3 py-3 text-sm leading-5" rows={1} /><button type="button" onClick={() => void send()} disabled={!draft.trim() || isSending} className="grid h-12 w-12 shrink-0 place-items-center rounded-lg border border-heather-700 bg-heather-700 text-white disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-300" aria-label="연구 요청 보내기">{isSending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}</button></div></div></section>
    <aside className="hidden min-w-0 border-l border-line bg-slate-50 p-4 xl:block"><h3 className="text-sm font-semibold">연결된 연구 컨텍스트</h3><section className="mt-4 rounded-lg border border-line bg-white p-3"><p className="text-xs font-semibold text-slate-500">RESEARCH MEMORY</p>{researchMemories.length ? <ul className="mt-2 space-y-2 text-sm">{researchMemories.slice(0, 5).map((memory) => <li key={memory.id} className="truncate">{memory.source || "Untitled research memory"}</li>)}</ul> : <p className="mt-2 text-sm leading-5 text-slate-500">연결된 연구 메모리가 없습니다.</p>}</section><section className="mt-3 rounded-lg border border-dashed border-line bg-white p-3 text-sm text-slate-500"><p className="font-semibold text-slate-700">연구자료 / RAG</p><p className="mt-1">준비 중입니다.</p></section><section className="mt-3 rounded-lg border border-dashed border-line bg-white p-3 text-sm text-slate-500"><p className="font-semibold text-slate-700">생산 공정 상태</p><p className="mt-1">연결된 측정값이 없습니다.</p></section></aside>
  </div>;
}
