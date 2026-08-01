"use client";
/* eslint-disable @next/next/no-img-element -- local previews and short-lived signed attachment URLs are runtime-only. */

import { useEffect, useMemo, useRef, useState } from "react";
import { FlaskConical, ImagePlus, MessageSquarePlus, Mic, MicOff, Paperclip, Search, Send, Smile, Trash2, X } from "lucide-react";
import { createMessage } from "@heather/core";
import type { ChatExecutionMode, ChatRequestPayload, HeatherSettings, MemoryRecord, MessageAttachment, ProjectRecord } from "@heather/core";
import { HeatherAvatar } from "../HeatherAvatar";
import { useConversationStore } from "../../../lib/conversations/use-conversation-store";
import { getSupabaseBrowserClient } from "../../../lib/supabase-client";
import { cleanResearchDisplayText } from "../../../lib/research/response";
import { readChatProgressStream, type ChatProgressEvent, type ChatStreamEvent } from "../../../lib/chat/progress-events";
import { ThinkingStatusPanel } from "../chat/ThinkingStatusPanel";
import { DEFAULT_CHAT_EXECUTION_MODE, isExecutionModeSelectorEnabledInBrowser } from "../../../lib/chat/execution-mode";
import { ExecutionBadge, ExecutionModeSelector } from "../chat/ExecutionModeSelector";

type ResearchResponse = { message?: string; title?: string; conversationId?: string; error?: string; provider?: string; model?: string };
type UploadResponse = { conversationId?: string; attachments?: MessageAttachment[]; error?: string };
type StreamDone = { conversationId?: string; title?: string; provider?: string; model?: string; execution?: { requested_execution_mode: ChatExecutionMode; actual_execution_mode: ChatExecutionMode; chat_type: "general" | "research"; local_engine_used: boolean; external_llm_used: boolean; error_code?: string; search_used?: boolean }; durationMs?: number };
type DraftAttachment = { id: string; file: File; previewUrl: string };
const EMOJIS = ["🧪", "🔬", "📊", "🧬", "⚗️", "💡", "✅", "📌"];
type SpeechRecognitionResultLike = { transcript: string };
type SpeechRecognitionEventLike = { results: ArrayLike<ArrayLike<SpeechRecognitionResultLike>> };
type SpeechRecognitionLike = { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void; onresult: ((event: SpeechRecognitionEventLike) => void) | null; onerror: (() => void) | null; onend: (() => void) | null };
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;
type WindowWithSpeechRecognition = Window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };

export function ResearchChatPanel({ memories, projects, settings }: { memories: MemoryRecord[]; projects: ProjectRecord[]; settings: HeatherSettings }) {
  const { conversations, activeConversation, activeConversationId, loading, selectConversation, setNewConversation, refreshAfterSend, archiveConversation, setExecutionMode, applyOptimistic, searchConversations, loadMore, loadOlderMessages } = useConversationStore("research");
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [attachments, setAttachments] = useState<DraftAttachment[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [progressEvents, setProgressEvents] = useState<ChatProgressEvent[]>([]);
  const [newConversationExecutionMode, setNewConversationExecutionMode] = useState<ChatExecutionMode>(DEFAULT_CHAT_EXECUTION_MODE);
  const lockRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const messageAreaRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceBaseDraftRef = useRef("");
  const locale = settings.defaultLanguage;
  const copy = locale === "en" ? EN : KO;
  const researchMemories = useMemo(() => memories.filter((memory) => !memory.archived && (memory.type === "project_context" || memory.source.startsWith("research"))), [memories]);

  useEffect(() => { const timer = window.setTimeout(() => { void searchConversations(search); }, 180); return () => window.clearTimeout(timer); }, [search, searchConversations]);
  useEffect(() => { const area = textareaRef.current; if (!area) return; area.style.height = "0px"; area.style.height = `${Math.min(area.scrollHeight, 128)}px`; }, [draft]);
  useEffect(() => {
    const area = messageAreaRef.current;
    if (!area) return;
    const frame = window.requestAnimationFrame(() => {
      area.scrollTo({ top: area.scrollHeight, behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeConversation?.id, activeConversation?.messages.length, isSending, progressEvents.length]);
  useEffect(() => () => attachments.forEach((attachment) => URL.revokeObjectURL(attachment.previewUrl)), [attachments]);
  useEffect(() => () => abortRef.current?.abort(), []);

  function addFiles(files: FileList | File[]) {
    const next = Array.from(files).filter((file) => ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type) && file.size <= 10 * 1024 * 1024).slice(0, 10 - attachments.length);
    setAttachments((current) => [...current, ...next.map((file) => ({ id: `${Date.now()}-${file.name}-${Math.random()}`, file, previewUrl: URL.createObjectURL(file) }))]);
  }

  function removeAttachment(id: string) { setAttachments((current) => { const found = current.find((attachment) => attachment.id === id); if (found) URL.revokeObjectURL(found.previewUrl); return current.filter((attachment) => attachment.id !== id); }); }
  function insertEmoji(emoji: string) { const input = textareaRef.current; const start = input?.selectionStart ?? draft.length; const end = input?.selectionEnd ?? draft.length; setDraft(`${draft.slice(0, start)}${emoji}${draft.slice(end)}`); setShowEmoji(false); requestAnimationFrame(() => { input?.focus(); input?.setSelectionRange(start + emoji.length, start + emoji.length); }); }
  function toggleListening() {
    if (isListening) { recognitionRef.current?.stop(); return; }
    const SpeechRecognition = (window as WindowWithSpeechRecognition).SpeechRecognition || (window as WindowWithSpeechRecognition).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    voiceBaseDraftRef.current = draft.trim();
    recognition.lang = locale === "ko" ? "ko-KR" : "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = (event) => { const result = event.results[event.results.length - 1]?.[0]?.transcript; if (result) setDraft(`${voiceBaseDraftRef.current}${voiceBaseDraftRef.current ? " " : ""}${result}`); };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => { recognitionRef.current = null; setIsListening(false); };
    recognitionRef.current = recognition;
    setIsListening(true);
    recognition.start();
  }

  async function send() {
    const message = draft.trim();
    if ((!message && !attachments.length) || isSending || lockRef.current) return;
    lockRef.current = true; setIsSending(true); setDraft(""); setShowEmoji(false); setProgressEvents([]);
    const controller = new AbortController();
    abortRef.current = controller;
    const userMessage = createMessage("user", message, "text", { attachments: attachments.map((attachment) => ({ id: attachment.id, type: "image", storagePath: "", mimeType: attachment.file.type, sizeBytes: attachment.file.size, status: "ready", url: attachment.previewUrl })) });
    const files = attachments.map((attachment) => attachment.file);
    setAttachments([]); applyOptimistic(userMessage);
    try {
      let conversationId = activeConversation?.id?.startsWith("pending-") ? undefined : activeConversation?.id;
      let messageAlreadyPersisted = false;
      if (files.length) {
        const form = new FormData(); form.set("message", message); form.set("clientMessageId", userMessage.id); form.set("type", "research"); form.set("executionMode", activeConversation?.executionMode || newConversationExecutionMode); if (conversationId) form.set("conversationId", conversationId); files.forEach((file) => form.append("files", file));
        const upload = await fetch("/api/conversations/media", { method: "POST", body: form });
        const uploaded = await upload.json() as UploadResponse;
        if (!upload.ok || !uploaded.conversationId) throw new Error(uploaded.error || copy.uploadFailed);
        conversationId = uploaded.conversationId; messageAlreadyPersisted = true;
      }
      const executionMode = activeConversation?.executionMode || newConversationExecutionMode;
      const payload: ChatRequestPayload = { message, messageId: userMessage.id, clientMessageId: userMessage.id, conversationId, conversation: activeConversation || undefined, messageAlreadyPersisted, settings, memories: researchMemories, projects, teachings: [], automationRecipes: [], executionMode };
      const session = await getSupabaseBrowserClient()?.auth.getSession();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session?.data.session?.access_token) headers.Authorization = `Bearer ${session.data.session.access_token}`;
      const response = await fetch("/api/research/chat", { method: "POST", headers: { ...headers, Accept: "text/event-stream" }, body: JSON.stringify(payload), signal: controller.signal });
      if (!response.ok) {
        const data = await response.json() as ResearchResponse;
        throw new Error(data.error || copy.sendFailed);
      }
      let responseMessage = "";
      let done: StreamDone = {};
      let streamError: string | undefined;
      await readChatProgressStream(response, (event: ChatStreamEvent) => {
        if (event.type === "progress") setProgressEvents((current) => [...current, event.data].slice(-40));
        if (event.type === "content_delta") responseMessage += event.data.text;
        if (event.type === "done") done = { conversationId: event.data.conversation_id, title: event.data.title, provider: event.data.provider, model: event.data.model, execution: event.data.execution, durationMs: event.data.duration_ms };
        if (event.type === "error") streamError = event.data.user_message;
      });
      if (streamError || !responseMessage || !done.conversationId) throw new Error(streamError || copy.sendFailed);
      applyOptimistic(createMessage("assistant", responseMessage, "text", { provider: done.provider, model: done.model, execution: done.execution ? { requestedExecutionMode: done.execution.requested_execution_mode, actualExecutionMode: done.execution.actual_execution_mode, chatType: done.execution.chat_type, localEngineUsed: done.execution.local_engine_used, externalLlmUsed: done.execution.external_llm_used, errorCode: done.execution.error_code, searchUsed: done.execution.search_used, durationMs: done.durationMs } : undefined }));
      await refreshAfterSend(done.conversationId);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setProgressEvents((current) => [...current, createClientProgressEvent("cancelled", "cancelled", 100)]);
      } else {
        applyOptimistic({ ...createMessage("assistant", `${copy.failed} ${error instanceof Error ? error.message : copy.retry}`), status: "failed" });
      }
    } finally { abortRef.current = null; lockRef.current = false; setIsSending(false); }
  }

  async function changeExecutionMode(executionMode: ChatExecutionMode) {
    if (isSending) return;
    setNewConversationExecutionMode(executionMode);
    if (activeConversation?.id && !activeConversation.id.startsWith("pending-")) await setExecutionMode(activeConversation.id, executionMode);
  }

  return <div className="research-chat-shell" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); addFiles(event.dataTransfer.files); }}>
    <aside className="research-conversation-panel">
      <header className="research-list-header"><div><p>{copy.conversations}</p><h2>{copy.researchChat}</h2></div><button type="button" onClick={() => { void setNewConversation(); setDraft(""); }} aria-label={copy.newConversation} title={copy.newConversation}><MessageSquarePlus /></button></header>
      <label className="research-search"><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={copy.search} /></label>
      <div className="research-conversation-list heather-scrollbar">{conversations.length ? conversations.map((conversation) => <button key={conversation.id} type="button" onClick={() => void selectConversation(conversation.id)} className={`research-conversation-row ${activeConversationId === conversation.id ? "is-active" : ""}`}><span className="research-conversation-mark"><FlaskConical /></span><span><strong>{conversation.title}</strong><small>{conversation.preview || copy.noMessages}</small><time>{formatDate(conversation.updatedAt, locale)}</time></span><i role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); void archiveConversation(conversation.id); }} onKeyDown={(event) => { if (event.key === "Enter") { event.stopPropagation(); void archiveConversation(conversation.id); } }} aria-label={copy.archive}><Trash2 /></i></button>) : <p className="research-list-empty">{loading ? copy.loading : copy.emptyConversations}</p>}{conversations.length ? <button type="button" className="research-load-more" onClick={() => void loadMore()}>{copy.loadMore}</button> : null}</div>
    </aside>
    <section className="research-chat-main">
      <header className="research-chat-header"><div><span className="research-header-badge"><FlaskConical />{copy.researcher}</span><h2>{activeConversation?.title || copy.newResearch}</h2></div><HeatherAvatar settings={settings} size="medium" researcher /></header>
      <div ref={messageAreaRef} className="research-message-area heather-scrollbar">{activeConversation?.messages.length ? <><button type="button" className="research-load-more" onClick={() => void loadOlderMessages()}>{copy.loadOlder}</button><div className="research-thread">{activeConversation.messages.map((message) => <ResearchMessage key={message.id} message={message} settings={settings} onRetry={() => setDraft(message.content)} />)}</div></> : <ResearchWelcome settings={settings} copy={copy} onPrompt={setDraft} />}{progressEvents.length ? <ThinkingStatusPanel events={progressEvents} isRunning={isSending} locale={locale} mode="research" onCancel={() => abortRef.current?.abort()} /> : null}</div>
      <footer className="research-composer-wrap">{attachments.length ? <div className="research-attachment-strip">{attachments.map((attachment) => <div key={attachment.id}><img src={attachment.previewUrl} alt="" /><button type="button" onClick={() => removeAttachment(attachment.id)} aria-label={copy.removePhoto}><X /></button></div>)}</div> : null}{isExecutionModeSelectorEnabledInBrowser() ? <ExecutionModeSelector value={activeConversation?.executionMode || newConversationExecutionMode} chatType="research" locale={locale} disabled={isSending} onChange={(mode) => void changeExecutionMode(mode)} /> : null}<div className="research-composer"><span className="research-emoji-wrap"><button type="button" onClick={() => setShowEmoji((open) => !open)} aria-label={copy.emoji} title={copy.emoji}><Smile /></button>{showEmoji ? <span className="research-emoji-picker">{EMOJIS.map((emoji) => <button key={emoji} type="button" onClick={() => insertEmoji(emoji)}>{emoji}</button>)}</span> : null}</span><button type="button" onClick={() => imageInputRef.current?.click()} aria-label={copy.photos} title={copy.photos}><ImagePlus /></button><button type="button" onClick={() => imageInputRef.current?.click()} aria-label={copy.file} title={copy.file}><Paperclip /></button><input ref={imageInputRef} className="dm-hidden-file-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={(event) => { addFiles(event.target.files || []); event.currentTarget.value = ""; }} /><textarea ref={textareaRef} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} onPaste={(event) => { if (event.clipboardData.files.length) { event.preventDefault(); addFiles(event.clipboardData.files); } }} placeholder={copy.placeholder} rows={1} /><button type="button" onClick={toggleListening} className={isListening ? "is-listening" : ""} aria-label={isListening ? copy.stopListening : copy.voiceInput} title={isListening ? copy.stopListening : copy.voiceInput}>{isListening ? <MicOff /> : <Mic />}</button><button type="button" onClick={() => void send()} disabled={(!draft.trim() && !attachments.length) || isSending} className="research-send" aria-label={copy.send}>{isSending ? <span aria-hidden="true">...</span> : <Send />}</button></div></footer>
    </section>
  </div>;
}

function ResearchWelcome({ settings, copy, onPrompt }: { settings: HeatherSettings; copy: typeof KO; onPrompt: (value: string) => void }) { return <div className="research-welcome"><div className="research-welcome-avatar"><HeatherAvatar settings={settings} size="large" researcher /><FlaskConical /></div><h2>Heather Researcher</h2><span>{copy.welcome}</span><div>{copy.prompts.map((prompt) => <button key={prompt} type="button" onClick={() => onPrompt(prompt)}>{prompt}</button>)}</div></div>; }
function ResearchMessage({ message, settings, onRetry }: { message: { role: string; content: string; status?: string; attachments?: MessageAttachment[]; provider?: string; model?: string; execution?: { actualExecutionMode: ChatExecutionMode; localEngineUsed: boolean; externalLlmUsed: boolean; errorCode?: string; durationMs?: number; searchUsed?: boolean } }; settings: HeatherSettings; onRetry: () => void }) { const isUser = message.role === "user"; return <article className={`research-message ${isUser ? "is-user" : "is-heather"}`}>{!isUser ? <HeatherAvatar settings={settings} size="small" researcher /> : null}<div>{message.attachments?.length ? <div className="research-image-grid">{message.attachments.map((attachment) => attachment.url ? <img key={attachment.id} src={attachment.url} alt="" /> : null)}</div> : null}{message.content ? <div className="research-message-content">{renderResearchContent(message.content)}</div> : null}{!isUser ? <ExecutionBadge execution={message.execution} provider={message.provider} model={message.model} locale={settings.defaultLanguage} /> : null}{message.status === "failed" ? <button type="button" className="research-retry" onClick={onRetry}>다시 시도</button> : null}</div></article>; }
function renderResearchContent(content: string) { return cleanResearchDisplayText(content).split(/\n{2,}/).map((block, index) => { const section = block.match(/^(핵심 결론|근거|한계|권장 후속 조치|출처|Key conclusion|Evidence|Limitations|Recommended next steps|Sources)\s*:\s*([\s\S]*)$/i); return section ? <section key={index} className="research-report-section"><strong>{section[1]}</strong><p>{section[2]}</p></section> : <p key={index}>{block}</p>; }); }
function createClientProgressEvent(stage: ChatProgressEvent["stage"], status: ChatProgressEvent["status"], progress: number): ChatProgressEvent { const now = new Date().toISOString(); return { id: `client:${stage}:${now}`, request_id: "client-cancel", stage, status, progress, source_type: "research_analysis", started_at: now, completed_at: now, duration_ms: 0 }; }
function formatDate(value: string, locale: "ko" | "en") { return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", { month: "short", day: "numeric" }).format(new Date(value)); }

const KO = { researcher: "Heather Researcher", conversations: "연구 대화", researchChat: "연구원 채팅", newConversation: "새 연구 대화", newResearch: "새 연구 대화", search: "연구 대화 검색", noMessages: "아직 메시지가 없습니다.", archive: "연구 대화 보관", loading: "연구 대화를 불러오는 중입니다.", emptyConversations: "저장된 연구 대화가 없습니다.", loadMore: "더 보기", loadOlder: "이전 메시지 불러오기", welcome: "연구와 실험, 데이터를 함께 분석하는 AI 연구원", prompts: ["실험 결과 해석", "연구 가설 정리", "연구 메모 작성", "변수 간 관계 분석", "후속 실험 설계"], progressTitle: "연구 요청 진행 상황", progressNote: "Heather가 수행 중인 연결·검토 단계를 표시합니다.", progressRequest: "질문 범위 확인", progressRequestDetail: "연구 목표와 필요한 결과 형식을 정리합니다.", progressMemory: "연구 메모 연결", progressMemoryFound: "관련된 저장 연구 메모리 {count}개를 확인합니다.", progressMemoryEmpty: "관련 저장 메모리가 없어 새 근거를 우선 확인합니다.", progressSearch: "학술 출처 경로 요청", progressSearchDetail: "Agent Runtime에 허용된 학술·공식 출처 조회를 요청합니다.", progressScope: "제공 자료 범위 확인", progressScopeDetail: "로그인 세션 또는 검색 결과 없이 제공된 자료만 검토합니다.", progressReview: "근거와 출처 검토", progressReviewDetail: "확인된 자료와 추정 내용을 구분합니다.", progressDraft: "답변 구성", progressDraftDetail: "결론, 근거, 한계와 후속 조치를 정리합니다.", placeholder: "연구 질문이나 실험 내용을 입력하세요...", photos: "사진", file: "파일 선택", removePhoto: "첨부 사진 제거", emoji: "이모지 선택", voiceInput: "음성 입력", stopListening: "음성 입력 중지", send: "연구 요청 보내기", uploadFailed: "사진을 업로드하지 못했습니다.", sendFailed: "연구 요청을 보내지 못했습니다.", failed: "연구 응답을 완성하지 못했습니다.", retry: "잠시 후 다시 시도해주세요." };
const EN = { researcher: "Heather Researcher", conversations: "Research conversations", researchChat: "Research chat", newConversation: "New research conversation", newResearch: "New research conversation", search: "Search research conversations", noMessages: "No messages yet.", archive: "Archive research conversation", loading: "Loading research conversations...", emptyConversations: "No saved research conversations.", loadMore: "Load more", loadOlder: "Load older messages", welcome: "An AI researcher for analyzing research, experiments, and data together.", prompts: ["Interpret experiment results", "Organize a research hypothesis", "Write a research note", "Analyze variable relationships", "Plan a follow-up experiment"], progressTitle: "Research request progress", progressNote: "Showing the connection and review steps Heather is performing.", progressRequest: "Confirming the request", progressRequestDetail: "Organizing the research goal and expected output.", progressMemory: "Checking research memory", progressMemoryFound: "Reviewing {count} related saved research memories.", progressMemoryEmpty: "No related saved research memory was found.", progressSearch: "Requesting source discovery", progressSearchDetail: "Requesting approved academic and official-source discovery from Agent Runtime.", progressScope: "Checking supplied material", progressScopeDetail: "Reviewing only supplied material without a signed-in search session.", progressReview: "Reviewing evidence", progressReviewDetail: "Separating verified material from assumptions.", progressDraft: "Drafting the response", progressDraftDetail: "Organizing conclusions, evidence, limitations, and next steps.", placeholder: "Enter a research question or experiment note...", photos: "Photos", file: "Choose file", removePhoto: "Remove attached photo", emoji: "Choose emoji", voiceInput: "Voice input", stopListening: "Stop voice input", send: "Send research request", uploadFailed: "Could not upload the photo.", sendFailed: "Could not send the research request.", failed: "Could not complete the research response.", retry: "Please try again shortly." };
