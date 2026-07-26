"use client";
/* eslint-disable @next/next/no-img-element -- local previews and short-lived signed attachment URLs are runtime-only. */

import { useEffect, useMemo, useRef, useState } from "react";
import { FlaskConical, ImagePlus, Loader2, MessageSquarePlus, Mic, MicOff, Paperclip, Search, Send, Smile, Trash2, X } from "lucide-react";
import { createMessage } from "@heather/core";
import type { ChatRequestPayload, HeatherSettings, MemoryRecord, MessageAttachment, ProjectRecord } from "@heather/core";
import { HeatherAvatar } from "../HeatherAvatar";
import { useConversationStore } from "../../../lib/conversations/use-conversation-store";

type ResearchResponse = { message?: string; title?: string; conversationId?: string; error?: string };
type UploadResponse = { conversationId?: string; attachments?: MessageAttachment[]; error?: string };
type DraftAttachment = { id: string; file: File; previewUrl: string };
const EMOJIS = ["🧪", "🔬", "📊", "🧬", "⚗️", "💡", "✅", "📌"];
type SpeechRecognitionResultLike = { transcript: string };
type SpeechRecognitionEventLike = { results: ArrayLike<ArrayLike<SpeechRecognitionResultLike>> };
type SpeechRecognitionLike = { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void; onresult: ((event: SpeechRecognitionEventLike) => void) | null; onerror: (() => void) | null; onend: (() => void) | null };
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;
type WindowWithSpeechRecognition = Window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };

export function ResearchChatPanel({ memories, projects, settings }: { memories: MemoryRecord[]; projects: ProjectRecord[]; settings: HeatherSettings }) {
  const { conversations, activeConversation, activeConversationId, loading, selectConversation, setNewConversation, refreshAfterSend, archiveConversation, applyOptimistic, searchConversations, loadMore, loadOlderMessages } = useConversationStore("research");
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [attachments, setAttachments] = useState<DraftAttachment[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const lockRef = useRef(false);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceBaseDraftRef = useRef("");
  const locale = settings.defaultLanguage;
  const copy = locale === "en" ? EN : KO;
  const researchMemories = useMemo(() => memories.filter((memory) => !memory.archived && (memory.type === "project_context" || memory.source.startsWith("research"))), [memories]);

  useEffect(() => { const timer = window.setTimeout(() => { void searchConversations(search); }, 180); return () => window.clearTimeout(timer); }, [search, searchConversations]);
  useEffect(() => { const area = textareaRef.current; if (!area) return; area.style.height = "0px"; area.style.height = `${Math.min(area.scrollHeight, 128)}px`; }, [draft]);
  useEffect(() => () => attachments.forEach((attachment) => URL.revokeObjectURL(attachment.previewUrl)), [attachments]);

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
    lockRef.current = true; setIsSending(true); setDraft(""); setShowEmoji(false);
    const userMessage = createMessage("user", message, "text", { attachments: attachments.map((attachment) => ({ id: attachment.id, type: "image", storagePath: "", mimeType: attachment.file.type, sizeBytes: attachment.file.size, status: "ready", url: attachment.previewUrl })) });
    const files = attachments.map((attachment) => attachment.file);
    setAttachments([]); applyOptimistic(userMessage);
    try {
      let conversationId = activeConversation?.id?.startsWith("pending-") ? undefined : activeConversation?.id;
      let messageAlreadyPersisted = false;
      if (files.length) {
        const form = new FormData(); form.set("message", message); form.set("clientMessageId", userMessage.id); form.set("type", "research"); if (conversationId) form.set("conversationId", conversationId); files.forEach((file) => form.append("files", file));
        const upload = await fetch("/api/conversations/media", { method: "POST", body: form });
        const uploaded = await upload.json() as UploadResponse;
        if (!upload.ok || !uploaded.conversationId) throw new Error(uploaded.error || copy.uploadFailed);
        conversationId = uploaded.conversationId; messageAlreadyPersisted = true;
      }
      const payload: ChatRequestPayload = { message, messageId: userMessage.id, clientMessageId: userMessage.id, conversationId, conversation: activeConversation || undefined, messageAlreadyPersisted, settings, memories: researchMemories, projects, teachings: [], automationRecipes: [] };
      const response = await fetch("/api/research/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json() as ResearchResponse;
      if (!response.ok || !data.message || !data.conversationId) throw new Error(data.error || copy.sendFailed);
      applyOptimistic(createMessage("assistant", data.message, "text", { provider: "nvidia" }));
      await refreshAfterSend(data.conversationId);
    } catch (error) {
      applyOptimistic({ ...createMessage("assistant", `${copy.failed} ${error instanceof Error ? error.message : copy.retry}`), status: "failed" });
    } finally { lockRef.current = false; setIsSending(false); }
  }

  return <div className="research-chat-shell" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); addFiles(event.dataTransfer.files); }}>
    <aside className="research-conversation-panel">
      <header className="research-list-header"><div><p>{copy.conversations}</p><h2>{copy.researchChat}</h2></div><button type="button" onClick={() => { void setNewConversation(); setDraft(""); }} aria-label={copy.newConversation} title={copy.newConversation}><MessageSquarePlus /></button></header>
      <label className="research-search"><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={copy.search} /></label>
      <div className="research-conversation-list heather-scrollbar">{conversations.length ? conversations.map((conversation) => <button key={conversation.id} type="button" onClick={() => void selectConversation(conversation.id)} className={`research-conversation-row ${activeConversationId === conversation.id ? "is-active" : ""}`}><span className="research-conversation-mark"><FlaskConical /></span><span><strong>{conversation.title}</strong><small>{conversation.preview || copy.noMessages}</small><time>{formatDate(conversation.updatedAt, locale)}</time></span><i role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); void archiveConversation(conversation.id); }} onKeyDown={(event) => { if (event.key === "Enter") { event.stopPropagation(); void archiveConversation(conversation.id); } }} aria-label={copy.archive}><Trash2 /></i></button>) : <p className="research-list-empty">{loading ? copy.loading : copy.emptyConversations}</p>}{conversations.length ? <button type="button" className="research-load-more" onClick={() => void loadMore()}>{copy.loadMore}</button> : null}</div>
    </aside>
    <section className="research-chat-main">
      <header className="research-chat-header"><div><span className="research-header-badge"><FlaskConical />{copy.researcher}</span><h2>{activeConversation?.title || copy.newResearch}</h2></div><HeatherAvatar settings={settings} size="medium" researcher /></header>
      <div className="research-message-area heather-scrollbar">{activeConversation?.messages.length ? <><button type="button" className="research-load-more" onClick={() => void loadOlderMessages()}>{copy.loadOlder}</button><div className="research-thread">{activeConversation.messages.map((message) => <ResearchMessage key={message.id} message={message} settings={settings} onRetry={() => setDraft(message.content)} />)}</div></> : <ResearchWelcome settings={settings} copy={copy} onPrompt={setDraft} />}{isSending ? <div className="research-thinking"><Loader2 />{copy.thinking}</div> : null}</div>
      <footer className="research-composer-wrap">{attachments.length ? <div className="research-attachment-strip">{attachments.map((attachment) => <div key={attachment.id}><img src={attachment.previewUrl} alt="" /><button type="button" onClick={() => removeAttachment(attachment.id)} aria-label={copy.removePhoto}><X /></button></div>)}</div> : null}<div className="research-composer"><span className="research-emoji-wrap"><button type="button" onClick={() => setShowEmoji((open) => !open)} aria-label={copy.emoji} title={copy.emoji}><Smile /></button>{showEmoji ? <span className="research-emoji-picker">{EMOJIS.map((emoji) => <button key={emoji} type="button" onClick={() => insertEmoji(emoji)}>{emoji}</button>)}</span> : null}</span><button type="button" onClick={() => imageInputRef.current?.click()} aria-label={copy.photos} title={copy.photos}><ImagePlus /></button><button type="button" onClick={() => imageInputRef.current?.click()} aria-label={copy.file} title={copy.file}><Paperclip /></button><input ref={imageInputRef} className="dm-hidden-file-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={(event) => { addFiles(event.target.files || []); event.currentTarget.value = ""; }} /><textarea ref={textareaRef} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} onPaste={(event) => { if (event.clipboardData.files.length) { event.preventDefault(); addFiles(event.clipboardData.files); } }} placeholder={copy.placeholder} rows={1} /><button type="button" onClick={toggleListening} className={isListening ? "is-listening" : ""} aria-label={isListening ? copy.stopListening : copy.voiceInput} title={isListening ? copy.stopListening : copy.voiceInput}>{isListening ? <MicOff /> : <Mic />}</button><button type="button" onClick={() => void send()} disabled={(!draft.trim() && !attachments.length) || isSending} className="research-send" aria-label={copy.send}>{isSending ? <Loader2 /> : <Send />}</button></div></footer>
    </section>
  </div>;
}

function ResearchWelcome({ settings, copy, onPrompt }: { settings: HeatherSettings; copy: typeof KO; onPrompt: (value: string) => void }) { return <div className="research-welcome"><div className="research-welcome-avatar"><HeatherAvatar settings={settings} size="large" researcher /><FlaskConical /></div><h2>Heather Researcher</h2><span>{copy.welcome}</span><div>{copy.prompts.map((prompt) => <button key={prompt} type="button" onClick={() => onPrompt(prompt)}>{prompt}</button>)}</div></div>; }
function ResearchMessage({ message, settings, onRetry }: { message: { role: string; content: string; status?: string; attachments?: MessageAttachment[] }; settings: HeatherSettings; onRetry: () => void }) { const isUser = message.role === "user"; return <article className={`research-message ${isUser ? "is-user" : "is-heather"}`}>{!isUser ? <HeatherAvatar settings={settings} size="small" researcher /> : null}<div>{message.attachments?.length ? <div className="research-image-grid">{message.attachments.map((attachment) => attachment.url ? <img key={attachment.id} src={attachment.url} alt="" /> : null)}</div> : null}{message.content ? <div className="research-message-content">{renderResearchContent(message.content)}</div> : null}{message.status === "failed" ? <button type="button" className="research-retry" onClick={onRetry}>다시 시도</button> : null}</div></article>; }
function renderResearchContent(content: string) { return content.split(/\n{2,}/).map((block, index) => { const heading = block.match(/^\[([^\]]+)\]\s*\n?([\s\S]*)$/); return heading ? <section key={index} className="research-report-section"><strong>{heading[1]}</strong><p>{heading[2]}</p></section> : <p key={index}>{block}</p>; }); }
function formatDate(value: string, locale: "ko" | "en") { return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", { month: "short", day: "numeric" }).format(new Date(value)); }

const KO = { researcher: "Heather Researcher", conversations: "연구 대화", researchChat: "연구원 채팅", newConversation: "새 연구 대화", newResearch: "새 연구 대화", search: "연구 대화 검색", noMessages: "아직 메시지가 없습니다.", archive: "연구 대화 보관", loading: "연구 대화를 불러오는 중입니다.", emptyConversations: "저장된 연구 대화가 없습니다.", loadMore: "더 보기", loadOlder: "이전 메시지 불러오기", welcome: "연구와 실험, 데이터를 함께 분석하는 AI 연구원", prompts: ["실험 결과 해석", "연구 가설 정리", "연구 메모 작성", "변수 간 관계 분석", "후속 실험 설계"], thinking: "Heather Researcher가 분석하고 있습니다.", placeholder: "연구 질문이나 실험 내용을 입력하세요...", photos: "사진", file: "파일 선택", removePhoto: "첨부 사진 제거", emoji: "이모지 선택", voiceInput: "음성 입력", stopListening: "음성 입력 중지", send: "연구 요청 보내기", uploadFailed: "사진을 업로드하지 못했습니다.", sendFailed: "연구 요청을 보내지 못했습니다.", failed: "연구 응답을 완성하지 못했습니다.", retry: "잠시 후 다시 시도해주세요." };
const EN = { researcher: "Heather Researcher", conversations: "Research conversations", researchChat: "Research chat", newConversation: "New research conversation", newResearch: "New research conversation", search: "Search research conversations", noMessages: "No messages yet.", archive: "Archive research conversation", loading: "Loading research conversations...", emptyConversations: "No saved research conversations.", loadMore: "Load more", loadOlder: "Load older messages", welcome: "An AI researcher for analyzing research, experiments, and data together.", prompts: ["Interpret experiment results", "Organize a research hypothesis", "Write a research note", "Analyze variable relationships", "Plan a follow-up experiment"], thinking: "Heather Researcher is analyzing.", placeholder: "Enter a research question or experiment note...", photos: "Photos", file: "Choose file", removePhoto: "Remove attached photo", emoji: "Choose emoji", voiceInput: "Voice input", stopListening: "Stop voice input", send: "Send research request", uploadFailed: "Could not upload the photo.", sendFailed: "Could not send the research request.", failed: "Could not complete the research response.", retry: "Please try again shortly." };
