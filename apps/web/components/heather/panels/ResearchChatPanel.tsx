"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MessageSquarePlus, Search, Send, Trash2 } from "lucide-react";
import { createMessage } from "@heather/core";
import type { ChatRequestPayload, HeatherSettings, MemoryRecord, ProjectRecord } from "@heather/core";
import { HeatherAvatar } from "../HeatherAvatar";
import { useConversationStore } from "../../../lib/conversations/use-conversation-store";

type ResearchResponse = { message?: string; title?: string; conversationId?: string; error?: string };

export function ResearchChatPanel({ memories, projects, settings }: { memories: MemoryRecord[]; projects: ProjectRecord[]; settings: HeatherSettings }) {
  const { conversations, activeConversation, activeConversationId, loading, selectConversation, setNewConversation, refreshAfterSend, archiveConversation, applyOptimistic, searchConversations, loadMore, loadOlderMessages } = useConversationStore("research");
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [isSending, setIsSending] = useState(false);
  const lockRef = useRef(false);
  const researchMemories = useMemo(() => memories.filter((memory) => !memory.archived && (memory.type === "project_context" || memory.source.startsWith("research"))), [memories]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void searchConversations(search); }, 180);
    return () => window.clearTimeout(timer);
  }, [search, searchConversations]);

  async function send() {
    const message = draft.trim();
    if (!message || isSending || lockRef.current) return;
    lockRef.current = true;
    setIsSending(true);
    setDraft("");
    const userMessage = createMessage("user", message);
    applyOptimistic(userMessage);
    const payload: ChatRequestPayload = { message, messageId: userMessage.id, clientMessageId: userMessage.id, conversationId: activeConversation?.id?.startsWith("pending-") ? undefined : activeConversation?.id, conversation: activeConversation || undefined, settings, memories: researchMemories, projects, teachings: [], automationRecipes: [] };
    try {
      const response = await fetch("/api/research/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json() as ResearchResponse;
      if (!response.ok || !data.message || !data.conversationId) throw new Error(data.error || "Research chat request failed.");
      applyOptimistic(createMessage("assistant", data.message));
      await refreshAfterSend(data.conversationId);
    } catch (error) {
      applyOptimistic({ ...createMessage("assistant", `연구 응답을 완성하지 못했습니다. ${error instanceof Error ? error.message : "잠시 후 다시 시도해주세요."}`), status: "failed" });
    } finally {
      lockRef.current = false;
      setIsSending(false);
    }
  }

  return <div className="chat-workspace research-chat-workspace">
    <aside className="chat-conversation-panel">
      <div className="chat-list-toolbar">
        <button type="button" className="chat-new-conversation" onClick={() => { void setNewConversation(); setDraft(""); }}><MessageSquarePlus className="h-4 w-4" /> 새 연구 대화</button>
        <label className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="연구 대화 검색" className="h-10 w-full rounded-lg border border-line bg-white pl-9 pr-3 text-sm" /></label>
      </div>
      <div className="chat-list-section"><span>최근 연구 주제</span></div>
      <div className="chat-conversation-list heather-scrollbar">
        {conversations.length ? conversations.map((conversation) => <button key={conversation.id} type="button" onClick={() => void selectConversation(conversation.id)} className={`chat-conversation-row group ${activeConversationId === conversation.id ? "border-heather-500 bg-white" : "border-line bg-white hover:border-heather-300"}`}><span className="block truncate text-sm font-semibold">{conversation.title}</span><span className="mt-1 block truncate text-xs text-slate-500">{conversation.preview || "아직 메시지가 없습니다."}</span><span role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); void archiveConversation(conversation.id); }} className="mt-2 grid h-7 w-7 place-items-center rounded-md text-slate-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100" aria-label="연구 대화 보관"><Trash2 className="h-3.5 w-3.5" /></span></button>) : <p className="chat-list-empty">{loading ? "연구 대화를 불러오는 중입니다." : "저장된 연구 대화가 없습니다."}</p>}
        <button type="button" className="chat-load-more" onClick={() => void loadMore()}>더 보기</button>
      </div>
    </aside>
    <section className="chat-main-panel">
      <div className="chat-main-header"><div><h3>{activeConversation?.title || "새 연구 대화"}</h3><p>연구자료, 실험 기록과 생산 공정을 분석하는 전문 작업 공간입니다.</p></div><span className="chat-status-dot"><span />Researcher</span></div>
      <div className="chat-message-area heather-scrollbar">
        {activeConversation?.messages.length ? <><button type="button" className="chat-load-more" onClick={() => void loadOlderMessages()}>이전 메시지 불러오기</button>{activeConversation.messages.map((message) => <article key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}><div className={`chat-message max-w-[880px] ${message.role === "user" ? "border-heather-500 bg-heather-700 text-white" : "border-line bg-white text-ink"}`}><div className="whitespace-pre-wrap">{message.content}</div>{message.status === "failed" ? <button type="button" className="chat-retry" onClick={() => setDraft(message.content)}>다시 시도</button> : null}</div></article>)}</> : <div className="chat-welcome"><div className="chat-welcome-icon"><HeatherAvatar settings={settings} size="medium" researcher /></div><h2>무엇을 연구할까요?</h2><p>사람·조직 구조 분석, 실험 결과 해석, 가설 설정, 연구 메모 정리와 생산 공정 검토를 요청하세요.</p><div className="chat-suggestions">{["사람·조직 구조를 분석해줘", "실험 조건을 비교해줘", "연구 가설을 설정해줘", "연구 메모를 정리해줘", "생산 공정을 검토해줘"].map((prompt) => <button key={prompt} type="button" onClick={() => setDraft(prompt)}>{prompt}<span>›</span></button>)}</div></div>}
        {isSending && <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Heather Researcher가 분석하고 있습니다.</div>}
      </div>
      <div className="chat-composer-wrap"><div className="chat-composer"><textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} placeholder="연구자료, 실험 결과 또는 생산 공정에 대해 질문하세요." className="min-h-12 flex-1 resize-none rounded-lg border border-line bg-white px-3 py-3 text-sm leading-5" rows={1} /><button type="button" onClick={() => void send()} disabled={!draft.trim() || isSending} className="grid h-12 w-12 shrink-0 place-items-center rounded-lg border border-heather-700 bg-heather-700 text-white disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-300" aria-label="연구 요청 보내기">{isSending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}</button></div></div>
    </section>
  </div>;
}
