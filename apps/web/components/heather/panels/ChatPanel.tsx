"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Camera,
  Copy,
  ImagePlus,
  Loader2,
  Maximize2,
  MessageSquare,
  MessageSquarePlus,
  Mic,
  MicOff,
  Minimize2,
  Paperclip,
  Search,
  Send,
  Smile,
  Square,
  Trash2,
  Volume2,
  X
} from "lucide-react";
import {
  createConversation,
  createId,
  createMessage,
  generateConversationTitle,
  nowIso
} from "@heather/core";
import type {
  AutomationRecipe,
  ChatRequestPayload,
  ChatResponsePayload,
  Conversation,
  HeatherSettings,
  MessageAttachment,
  MemoryRecord,
  ProjectRecord,
  TeachingRecord
} from "@heather/core";
import { invokeTauriCommand, isTauriRuntime } from "@heather/platform";
import type { DesktopActionResult, MediaActionResult } from "@heather/platform";
import { HeatherAvatar } from "../HeatherAvatar";
import { useConversationStore } from "../../../lib/conversations/use-conversation-store";
import { getSupabaseBrowserClient } from "../../../lib/supabase-client";

interface ChatPanelProps {
  memories: MemoryRecord[];
  projects: ProjectRecord[];
  teachings: TeachingRecord[];
  automationRecipes: AutomationRecipe[];
  settings: HeatherSettings;
  onSaveMemory: (memory: MemoryRecord) => Promise<void>;
  onSaveSettings: (settings: HeatherSettings) => Promise<void>;
}

interface ApiChatResponse extends ChatResponsePayload {
  provider?: string;
  model?: string;
  providerWarning?: string;
  cached?: boolean;
  meteredApiCall?: boolean;
  error?: string;
  conversationId?: string;
}

type FastDesktopActionName =
  | "open_app"
  | "open_url"
  | "search_web"
  | "search_youtube"
  | "search_youtube_music"
  | "play_youtube_music"
  | "speak_macos"
  | "stop_speaking";

interface FastDesktopAction {
  name: FastDesktopActionName;
  description: string;
  target: string;
  riskLevel: "low" | "medium" | "high";
  requiresConfirmation: boolean;
  args: Record<string, unknown>;
}

interface SpeechRecognitionResultLike {
  transcript: string;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<ArrayLike<SpeechRecognitionResultLike>>;
}

interface SpeechRecognitionErrorEventLike {
  error?: string;
  message?: string;
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionLike;
}

type WindowWithSpeechRecognition = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

let activeHeatherAudio: HTMLAudioElement | null = null;
let activeHeatherAudioUrl: string | null = null;

type DraftAttachment = { id: string; file: File; previewUrl: string; status: "pending" | "failed"; error?: string };

const EMOJI_OPTIONS = ["😀", "🙂", "✨", "👍", "🙏", "🎯", "💡", "📌", "❤️", "🎉", "🤔", "✅"];

export function ChatPanel({
  memories,
  projects,
  teachings,
  automationRecipes,
  settings,
  onSaveMemory,
  onSaveSettings
}: ChatPanelProps) {
  const { conversations, activeConversation, loading: conversationsLoading, activeConversationId, selectConversation, setNewConversation, searchConversations, refreshAfterSend, archiveConversation, applyOptimistic, loadMore, loadOlderMessages } = useConversationStore("general");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<DraftAttachment[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [inputSource, setInputSource] = useState<"text" | "voice">("text");
  const [providerStatus, setProviderStatus] = useState("");
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [lightbox, setLightbox] = useState<{ images: MessageAttachment[]; index: number } | null>(null);
  const [showNewMessages, setShowNewMessages] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<"list" | "chat">("list");
  const [focusMode, setFocusMode] = useState(true);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceBaseDraftRef = useRef("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messageAreaRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const atBottomRef = useRef(true);
  const sendLockRef = useRef(false);
  const locale = settings.defaultLanguage;
  const copy = locale === "en" ? EN : KO;

  const filteredConversations = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return conversations;

    return conversations.filter((conversation) => {
      const haystack = `${conversation.title} ${conversation.preview}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [conversations, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void searchConversations(search); }, 180);
    return () => window.clearTimeout(timer);
  }, [search, searchConversations]);

  useEffect(() => {
    if (atBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: activeConversation?.messages.length ? "smooth" : "auto", block: "end" });
      setShowNewMessages(false);
    } else {
      setShowNewMessages(true);
    }
  }, [activeConversation?.messages.length, isSending]);

  useEffect(() => {
    return () => {
      stopHeatherSpeech();
    };
  }, []);

  useEffect(() => {
    const area = textareaRef.current;
    if (!area) return;
    area.style.height = "0px";
    area.style.height = `${Math.min(area.scrollHeight, 128)}px`;
  }, [draft]);

  useEffect(() => {
    if (!cameraOpen || !cameraStream || !videoRef.current) return;
    videoRef.current.srcObject = cameraStream;
    void videoRef.current.play().catch(() => undefined);
  }, [cameraOpen, cameraStream]);

  useEffect(() => () => { cameraStreamRef.current?.getTracks().forEach((track) => track.stop()); }, []);

  async function handleNewConversation() {
    await setNewConversation();
    setDraft("");
    clearAttachments();
    setMobilePanel("chat");
  }

  async function handleDeleteConversation(id: string) {
    if (!window.confirm("이 대화를 삭제할까요?")) return;

    await archiveConversation(id);
    if (activeConversationId === id) {
      await setNewConversation();
    }
  }

  async function handleSend() {
    const message = draft.trim();
    if ((!message && !attachments.length) || isSending || sendLockRef.current) return;

    sendLockRef.current = true;
    setIsSending(true);
    setProviderStatus(copy.sending);

    const baseConversation = activeConversation || createConversation();
    const userMessage = createMessage("user", message, inputSource, {
      attachments: attachments.map((attachment) => ({ id: attachment.id, type: "image", storagePath: "", mimeType: attachment.file.type, sizeBytes: attachment.file.size, status: attachment.status, url: attachment.previewUrl }))
    });
    const optimisticConversation: Conversation = {
      ...baseConversation,
      title: baseConversation.messages.length ? baseConversation.title : generateConversationTitle(message || copy.photo),
      messages: [...baseConversation.messages, userMessage],
      updatedAt: nowIso()
    };

    applyOptimistic(userMessage);

    try {
      const persistedMedia = attachments.length
        ? await uploadMedia({ message, clientMessageId: userMessage.id, conversationId: activeConversation?.id?.startsWith("pending-") ? undefined : activeConversation?.id, files: attachments.map((attachment) => attachment.file) })
        : null;
      const payload: ChatRequestPayload = {
        message: message || copy.photo,
        messageId: userMessage.id,
        clientMessageId: userMessage.id,
        conversationId: persistedMedia?.conversationId || (activeConversation?.id?.startsWith("pending-") ? undefined : activeConversation?.id),
        conversation: optimisticConversation,
        settings,
        memories,
        projects,
        teachings,
        automationRecipes,
        messageAlreadyPersisted: Boolean(persistedMedia)
      };
      setDraft("");
      clearAttachments();
      const fastResponse = await resolveFastCommand(payload.message, baseConversation, Boolean(persistedMedia));
      if (!fastResponse) {
        setProviderStatus(copy.thinking);
      }
      const data = fastResponse || (await resolveHeatherResponse(payload));
      if (fastResponse) {
        const persisted = await persistLocalResponse({ message: payload.message, clientMessageId: userMessage.id, conversationId: payload.conversationId, response: data, messageAlreadyPersisted: payload.messageAlreadyPersisted });
        data.conversationId = persisted.conversationId;
      }

      const assistantMessage = createMessage("assistant", data.message, "text", {
        provider: data.provider,
        model: data.model
      });
      applyOptimistic(assistantMessage);
      if (data.conversationId) await refreshAfterSend(data.conversationId);
      setProviderStatus(formatProviderStatus(data));

      if (data.meteredApiCall) {
        await onSaveSettings(incrementPaidApiCount(settings));
      }

      if (
        payload.settings.cacheResponses &&
        !data.cached &&
        data.provider !== "desktop" &&
        !asksCurrentProviderOrModel(payload.message)
      ) {
        writeCachedResponse(payload, data);
      }

      if (data.memorySuggestion && settings.memoryEnabled && !data.cached) {
        const timestamp = nowIso();
        await onSaveMemory({
          ...data.memorySuggestion,
          id: createId("memory"),
          created_at: timestamp,
          updated_at: timestamp,
          archived: false
        });
      }

      if (settings.voiceOutputEnabled && settings.voiceAutoReadEnabled) {
        void speakHeather(data.message, settings, {
          onStart: () => setSpeakingMessageId(assistantMessage.id),
          onEnd: () => setSpeakingMessageId(null)
        });
      }
    } catch (error) {
      if (attachments.length) setAttachments((current) => current.map((attachment) => ({ ...attachment, status: "failed", error: error instanceof Error ? error.message : copy.sendFailed })));
      const assistantMessage = createMessage(
        "assistant",
        `지금 응답을 완성하지 못했어요. ${error instanceof Error ? error.message : "알 수 없는 오류"}`
      );
      applyOptimistic(assistantMessage);
      setProviderStatus(error instanceof Error ? error.message : copy.sendFailed);
    } finally {
      sendLockRef.current = false;
      setInputSource("text");
      setIsSending(false);
    }
  }

  async function resolveHeatherResponse(payload: ChatRequestPayload): Promise<ApiChatResponse> {
    return requestIntentApi(payload);
  }

  async function resolveFastCommand(
    message: string,
    previousConversation: Conversation,
    hasImages: boolean
  ): Promise<ApiChatResponse | null> {
    if (hasImages) {
      return {
        message: locale === "en" ? "Your photo has been saved, but image analysis is not connected to this chat model yet." : "사진은 저장되었지만 현재 이 채팅 모델에는 이미지 분석 기능이 연결되어 있지 않아요.",
        title: generateConversationTitle(message), risk: { level: "low", requiresConfirmation: false, reason: "Image analysis is not available." }, provider: "system", model: "text-only"
      };
    }
    if (asksCurrentProviderOrModel(message)) {
      const model = settings.ollamaModel || "gemma4:latest";
      return {
        message: `현재 사용 중인 모델은 ${model}입니다. provider는 ollama입니다.`,
        title: generateConversationTitle(message),
        risk: {
          level: "low",
          requiresConfirmation: false,
          reason: "런타임 메타데이터 조회입니다."
        },
        provider: "ollama",
        model
      };
    }

    if (isForbiddenDesktopRequest(message)) {
      return {
        message:
          "이 작업은 Heather 안전 정책상 실행할 수 없습니다. 파일 삭제/이동/덮어쓰기, 결제/구매, 비밀번호/토큰 접근, 주식 거래, 임의 shell command 실행은 차단됩니다.",
        title: generateConversationTitle(message),
        risk: {
          level: "high",
          requiresConfirmation: true,
          reason: "금지된 작업 범주입니다."
        },
        provider: "desktop",
        model: "blocked-action"
      };
    }

    const action = planFastDesktopAction(message, previousConversation);
    if (!action) return null;

    if (!isTauriRuntime()) {
      return {
        message: `작업 제안: ${action.description}\n대상: ${action.target}\n위험도: ${action.riskLevel}\n\n이 기능은 Heather 데스크톱 앱에서 사용할 수 있습니다.`,
        title: generateConversationTitle(message),
        risk: {
          level: action.riskLevel,
          requiresConfirmation: action.requiresConfirmation,
          reason: "데스크톱 브리지가 필요한 기능입니다."
        },
        provider: "desktop",
        model: "not-connected"
      };
    }

    const result = await runFastDesktopAction(action);
    return {
      message: formatActionResponse(action, result),
      title: generateConversationTitle(message),
      risk: {
        level: action.riskLevel,
        requiresConfirmation: action.requiresConfirmation,
        reason: "허용된 데스크톱 action입니다."
      },
      provider: "desktop",
      model: "tauri-action"
    };
  }

  async function requestIntentApi(payload: ChatRequestPayload): Promise<ApiChatResponse> {
    const sessionResult = await getSupabaseBrowserClient()?.auth.getSession();
    const accessToken = sessionResult?.data.session?.access_token;
    const response = await fetch("/api/intent/resolve", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
      },
      body: JSON.stringify(payload)
    });

    const data = (await response.json()) as ApiChatResponse;

    if (!response.ok || data.error) {
      throw new Error(data.error || "Heather chat request failed.");
    }

    return data;
  }

  function toggleListening() {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition =
      (window as WindowWithSpeechRecognition).SpeechRecognition ||
      (window as WindowWithSpeechRecognition).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setProviderStatus(copy.voiceUnsupported);
      return;
    }

    const recognition = new SpeechRecognition();
    voiceBaseDraftRef.current = draft.trim();
    recognition.lang = settings.defaultLanguage === "ko" ? "ko-KR" : "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const result = event.results[event.results.length - 1]?.[0]?.transcript;
      if (result) {
        const base = voiceBaseDraftRef.current;
        setDraft(base ? `${base} ${result}` : result);
        setInputSource("voice");
      }
    };
    recognition.onerror = (event) => {
      setIsListening(false);
      const permissionErrors = ["not-allowed", "service-not-allowed", "permission-denied"];
      setProviderStatus(
        event.error && permissionErrors.includes(event.error)
          ? copy.voiceDenied
          : `${copy.voiceError}${event.error ? `: ${event.error}` : ""}`
      );
    };
    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    setIsListening(true);
    setProviderStatus(copy.listening);
    recognition.start();
  }

  function toggleSpeakMessage(messageId: string, text: string) {
    if (!settings.voiceOutputEnabled) {
      setProviderStatus(copy.voiceOutputDisabled);
      return;
    }

    if (speakingMessageId === messageId) {
      stopHeatherSpeech();
      setSpeakingMessageId(null);
      return;
    }

    void speakHeather(text, settings, {
      onStart: () => setSpeakingMessageId(messageId),
      onEnd: () => setSpeakingMessageId(null)
    });
  }

  function addFiles(files: FileList | File[]) {
    const accepted: DraftAttachment[] = [];
    const errors: string[] = [];
    for (const file of Array.from(files)) {
      if (attachments.length + accepted.length >= 10) { errors.push(copy.maxPhotos); break; }
      if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) { errors.push(copy.unsupportedFile); continue; }
      if (file.size > 10 * 1024 * 1024) { errors.push(copy.fileTooLarge); continue; }
      accepted.push({ id: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file), status: "pending" });
    }
    if (accepted.length) setAttachments((current) => [...current, ...accepted]);
    if (errors.length) setProviderStatus(errors[0]);
  }

  function removeAttachment(id: string) {
    setAttachments((current) => current.filter((attachment) => {
      if (attachment.id === id) URL.revokeObjectURL(attachment.previewUrl);
      return attachment.id !== id;
    }));
  }

  function clearAttachments() {
    setAttachments((current) => { current.forEach((attachment) => URL.revokeObjectURL(attachment.previewUrl)); return []; });
  }

  async function openCamera() {
    if (!navigator.mediaDevices?.getUserMedia) { cameraInputRef.current?.click(); return; }
    setCameraError("");
    try { const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false }); cameraStreamRef.current = stream; setCameraStream(stream); setCameraOpen(true); }
    catch { setCameraError(copy.cameraDenied); setCameraOpen(true); }
  }

  function stopCamera() {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    setCameraStream(null);
    setCameraOpen(false);
  }

  function captureCamera() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob((blob) => { if (blob) addFiles([new File([blob], `heather-camera-${Date.now()}.jpg`, { type: "image/jpeg" })]); stopCamera(); }, "image/jpeg", .92);
  }

  function insertEmoji(emoji: string) {
    const input = textareaRef.current;
    const start = input?.selectionStart ?? draft.length;
    const end = input?.selectionEnd ?? draft.length;
    setDraft(`${draft.slice(0, start)}${emoji}${draft.slice(end)}`);
    setShowEmojiPicker(false);
    requestAnimationFrame(() => { input?.focus(); input?.setSelectionRange(start + emoji.length, start + emoji.length); });
  }

  const messages = activeConversation?.messages || [];
  const hasComposerContent = Boolean(draft.trim() || attachments.length);
  return (
    <div className={`chat-workspace dm-workspace ${mobilePanel === "chat" ? "is-mobile-chat" : "is-mobile-list"} ${focusMode ? "is-focus-mode" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); addFiles(event.dataTransfer.files); }}>
      <aside className="chat-conversation-panel">
        <div className="chat-list-toolbar">
          <div className="dm-list-heading"><strong>{copy.messages}</strong><button type="button" onClick={handleNewConversation} className="dm-icon-button" aria-label={copy.newConversation} title={copy.newConversation}><MessageSquarePlus /></button></div>
          <div className="flex items-center gap-2">
            <label className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={copy.search}
                className="h-10 w-full rounded-lg border border-line bg-white pl-9 pr-3 text-sm"
              />
            </label>
          </div>
        </div>

        <div className="chat-conversation-list heather-scrollbar">
          {filteredConversations.length ? (
            filteredConversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => { setMobilePanel("chat"); void selectConversation(conversation.id); }}
                className={`chat-conversation-row dm-conversation-row group ${activeConversationId === conversation.id ? "is-active" : ""}`}
              >
                <HeatherAvatar settings={settings} size="medium" />
                <span className="dm-conversation-copy"><span><strong>{conversation.title}</strong><time>{formatListTime(conversation.updatedAt, locale)}</time></span><small>{conversation.preview || copy.noMessages}</small></span>
                <span role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); void handleDeleteConversation(conversation.id); }} onKeyDown={(event) => { if (event.key === "Enter") { event.stopPropagation(); void handleDeleteConversation(conversation.id); } }} className="dm-row-delete" title={copy.deleteConversation} aria-label={copy.deleteConversation}><Trash2 /></span>
              </button>
            ))
          ) : (
            <p className="chat-list-empty">{conversationsLoading ? copy.loading : search ? copy.noResults : copy.emptyConversations}</p>
          )}
          {filteredConversations.length > 0 && filteredConversations.length === conversations.length ? <button type="button" className="chat-load-more dm-load-more" onClick={() => void loadMore()}>{copy.loadMore}</button> : null}
        </div>
      </aside>

      <section className="chat-main-panel">
        <div className="chat-main-header">
          <div className="dm-header-person"><button type="button" className="dm-back" onClick={() => { setFocusMode(false); setMobilePanel("list"); }} aria-label={copy.back}><ArrowLeft /></button><HeatherAvatar settings={settings} size="medium" /><button type="button" className="dm-header-title" onClick={() => setProviderStatus(copy.partner)}><strong>Heather</strong><small>{copy.partner}</small></button></div>
          <div className="dm-header-actions"><button type="button" className="dm-icon-button" onClick={() => setFocusMode((focused) => !focused)} aria-label={focusMode ? copy.showConversations : copy.focusConversation} title={focusMode ? copy.showConversations : copy.focusConversation}>{focusMode ? <Minimize2 /> : <Maximize2 />}</button><button type="button" className="dm-icon-button" onClick={() => { setFocusMode(false); setMobilePanel("list"); }} aria-label={copy.back} title={copy.back}><X /></button></div>
        </div>

        <div className="chat-message-area dm-message-area heather-scrollbar" ref={messageAreaRef} onScroll={(event) => { const target = event.currentTarget; atBottomRef.current = target.scrollHeight - target.scrollTop - target.clientHeight < 80; if (atBottomRef.current) setShowNewMessages(false); }}>
          {messages.length ? <button type="button" className="chat-load-more" onClick={() => void loadOlderMessages()}>{copy.loadOlder}</button> : null}
          {messages.length ? (
            <MessageThread messages={messages} settings={settings} locale={locale} copy={copy} speakingMessageId={speakingMessageId} onSpeak={toggleSpeakMessage} onCopy={(content) => void navigator.clipboard?.writeText(content)} onOpenLightbox={(images, index) => setLightbox({ images, index })} />
          ) : (
            <div className="chat-welcome">
              <HeatherAvatar settings={settings} size="large" />
              <h2>Heather</h2><p>{copy.partner}</p><p className="dm-welcome-message">{copy.welcome}</p>
              <div className="chat-suggestions">
                {copy.suggestions.map(([label, prompt]) => <button key={label} type="button" onClick={() => setDraft(prompt)}>{label}</button>)}
              </div>
            </div>
          )}
          {isSending && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              {copy.thinking}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {showNewMessages && <button type="button" className="dm-new-messages" onClick={() => { atBottomRef.current = true; messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }}>{copy.newMessages}</button>}
        <div className="chat-composer-wrap">
          {attachments.length ? <div className="dm-attachment-strip" aria-label={copy.photoPreview}>{attachments.map((attachment) => <div key={attachment.id} className="dm-attachment-preview"><img src={attachment.previewUrl} alt="" /><button type="button" onClick={() => removeAttachment(attachment.id)} aria-label={copy.removePhoto}><X /></button>{attachment.status === "failed" ? <small>{copy.tryAgain}</small> : null}</div>)}</div> : null}
          <div className="chat-composer dm-composer">
            <div className="dm-emoji-wrap"><button type="button" onClick={() => setShowEmojiPicker((open) => !open)} className="dm-composer-button" title={copy.emoji} aria-label={copy.emoji}><Smile /></button>{showEmojiPicker ? <div className="dm-emoji-picker" role="dialog" aria-label={copy.emoji}>{EMOJI_OPTIONS.map((emoji) => <button key={emoji} type="button" onClick={() => insertEmoji(emoji)}>{emoji}</button>)}</div> : null}</div>
            <button type="button" onClick={() => imageInputRef.current?.click()} className="dm-composer-button" title={copy.photos} aria-label={copy.photos}><ImagePlus /></button>
            <button type="button" onClick={() => imageInputRef.current?.click()} className="dm-composer-button" title={copy.file} aria-label={copy.file}><Paperclip /></button>
            <input ref={imageInputRef} className="dm-hidden-file-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={(event) => { addFiles(event.target.files || []); event.currentTarget.value = ""; }} />
            <input ref={cameraInputRef} className="dm-hidden-file-input" type="file" accept="image/*" capture="user" onChange={(event) => { addFiles(event.target.files || []); event.currentTarget.value = ""; }} />
            <textarea
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setInputSource("text");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void handleSend();
                }
              }}
              onPaste={(event) => { const files = Array.from(event.clipboardData.files); if (files.length) { event.preventDefault(); addFiles(files); } }}
              placeholder={copy.placeholder}
              ref={textareaRef}
              className="dm-composer-textarea"
              rows={1}
            />
            <button
              type="button"
              onClick={toggleListening}
              className={`dm-composer-button ${
                isListening
                  ? "is-listening"
                  : ""
              }`}
              title={isListening ? copy.stopListening : copy.voiceInput}
              aria-label={isListening ? copy.stopListening : copy.voiceInput}
            >
              {isListening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </button>
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={!hasComposerContent || isSending}
              className={`dm-send-button ${hasComposerContent ? "has-content" : ""}`}
              title={copy.send}
              aria-label={copy.send}
            >
              {isSending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            </button>
          </div>
          {providerStatus ? <p className="dm-composer-status" role="status">{providerStatus}</p> : null}
        </div>
      </section>
      {cameraOpen ? <CameraModal copy={copy} error={cameraError} videoRef={videoRef} onCapture={captureCamera} onClose={stopCamera} onPickFile={() => cameraInputRef.current?.click()} /> : null}
      {lightbox ? <ImageLightbox state={lightbox} onClose={() => setLightbox(null)} onChange={(index) => setLightbox({ ...lightbox, index })} /> : null}
    </div>
  );
}

const KO = {
  messages: "채팅", newConversation: "새 대화", search: "검색", noMessages: "아직 메시지가 없습니다.", deleteConversation: "대화 삭제", loading: "대화를 불러오는 중입니다.", noResults: "검색 결과가 없습니다.", emptyConversations: "아직 대화가 없습니다.", partner: "일상과 연구를 함께하는 파트너", conversationInfo: "대화 정보", more: "더보기", moreUnavailable: "추가 대화 메뉴는 준비 중입니다.", back: "대화 목록으로", focusConversation: "대화에 집중", showConversations: "대화 목록 보기", file: "사진 파일 선택", loadMore: "더 보기", loadOlder: "이전 메시지 불러오기", welcome: "안녕하세요. 오늘은 무엇을 함께 이야기해볼까요?", suggestions: [["문서 요약", "이 문서의 핵심 내용을 요약해줘"], ["일정 정리", "오늘 해야 할 일을 정리해줘"], ["아이디어 정리", "이 아이디어를 실행 가능한 항목으로 정리해줘"], ["공지 작성", "이 내용을 공지문으로 작성해줘"]] as Array<[string, string]>, thinking: "Heather가 답변을 정리하고 있습니다.", sending: "메시지를 보내는 중입니다.", photo: "사진", placeholder: "메시지 입력...", photos: "사진", camera: "카메라", emoji: "이모지 선택", voiceInput: "음성 입력", stopListening: "음성 입력 중지", send: "보내기", photoPreview: "첨부 사진 미리보기", removePhoto: "첨부 사진 제거", tryAgain: "다시 시도", maxPhotos: "한 메시지에는 사진을 최대 10장까지 첨부할 수 있습니다.", unsupportedFile: "지원하지 않는 파일 형식입니다.", fileTooLarge: "파일이 너무 큽니다.", cameraDenied: "카메라 권한이 거부되었습니다. 사진 선택을 이용하세요.", voiceUnsupported: "이 브라우저는 음성 인식을 지원하지 않습니다.", voiceDenied: "마이크 권한이 거부되었습니다. 브라우저/시스템 권한을 확인하세요.", voiceError: "음성 입력 오류", listening: "음성 입력 중", voiceOutputDisabled: "음성 출력이 꺼져 있습니다.", sendFailed: "사진을 전송할 수 없습니다.", newMessages: "새 메시지", copy: "복사", read: "읽어주기", stop: "중지", imageAlt: "전송한 사진"
};

const EN = {
  messages: "Messages", newConversation: "New message", search: "Search", noMessages: "No messages yet.", deleteConversation: "Delete conversation", loading: "Loading conversations...", noResults: "No results found.", emptyConversations: "No conversations yet.", partner: "A partner for everyday life and research", conversationInfo: "Conversation information", more: "More", moreUnavailable: "More conversation options are coming soon.", back: "Back to conversations", focusConversation: "Focus conversation", showConversations: "Show conversations", file: "Choose photo files", loadMore: "Load more", loadOlder: "Load older messages", welcome: "Hi. What would you like to talk about today?", suggestions: [["Summarize a document", "Summarize the key points of this document"], ["Plan my day", "Organize what I need to do today"], ["Organize ideas", "Turn this idea into actionable items"], ["Write an announcement", "Write this as an announcement"]] as Array<[string, string]>, thinking: "Heather is preparing a reply.", sending: "Sending your message...", photo: "Photo", placeholder: "Message...", photos: "Photos", camera: "Camera", emoji: "Choose emoji", voiceInput: "Voice input", stopListening: "Stop voice input", send: "Send", photoPreview: "Attached photo preview", removePhoto: "Remove attached photo", tryAgain: "Try again", maxPhotos: "You can attach up to 10 photos to one message.", unsupportedFile: "Unsupported file type.", fileTooLarge: "File is too large.", cameraDenied: "Camera permission was denied. Use photo selection instead.", voiceUnsupported: "This browser does not support voice input.", voiceDenied: "Microphone permission was denied. Check browser and system permissions.", voiceError: "Voice input error", listening: "Listening", voiceOutputDisabled: "Voice output is off.", sendFailed: "Could not send the photo.", newMessages: "New messages", copy: "Copy", read: "Read aloud", stop: "Stop", imageAlt: "Sent photo"
};

type ChatCopy = typeof KO;

function MessageThread({ messages, settings, locale, copy, speakingMessageId, onSpeak, onCopy, onOpenLightbox }: { messages: Conversation["messages"]; settings: HeatherSettings; locale: "ko" | "en"; copy: ChatCopy; speakingMessageId: string | null; onSpeak: (id: string, text: string) => void; onCopy: (content: string) => void; onOpenLightbox: (images: MessageAttachment[], index: number) => void }) {
  return <div className="dm-thread">{messages.map((message, index) => {
    const previous = messages[index - 1];
    const grouped = Boolean(previous && previous.role === message.role && new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() < 5 * 60_000);
    const showAvatar = message.role === "assistant" && (!messages[index + 1] || messages[index + 1].role !== "assistant" || new Date(messages[index + 1].createdAt).getTime() - new Date(message.createdAt).getTime() >= 5 * 60_000);
    return <article key={message.id} className={`dm-message-row ${message.role === "user" ? "is-user" : "is-heather"} ${grouped ? "is-grouped" : ""}`}>
      {message.role !== "user" ? <span className="dm-message-avatar">{showAvatar ? <HeatherAvatar settings={settings} size="small" /> : null}</span> : null}
      <div className="dm-message-stack">
        {message.attachments?.length ? <ImageGrid attachments={message.attachments} onOpen={(imageIndex) => onOpenLightbox(message.attachments || [], imageIndex)} alt={copy.imageAlt} /> : null}
        {message.content ? <div className="chat-message dm-message-bubble"><div className="whitespace-pre-wrap">{message.content}</div></div> : null}
        <div className="dm-message-meta"><time>{formatMessageTime(message.createdAt, locale)}</time>{message.role === "assistant" ? <><button type="button" onClick={() => onCopy(message.content)} aria-label={copy.copy} title={copy.copy}><Copy /></button><button type="button" onClick={() => onSpeak(message.id, message.content)} aria-label={speakingMessageId === message.id ? copy.stop : copy.read} title={speakingMessageId === message.id ? copy.stop : copy.read}>{speakingMessageId === message.id ? <Square /> : <Volume2 />}</button></> : null}</div>
      </div>
    </article>;
  })}</div>;
}

function ImageGrid({ attachments, onOpen, alt }: { attachments: MessageAttachment[]; onOpen: (index: number) => void; alt: string }) {
  const visible = attachments.slice(0, 4);
  return <div className={`dm-image-grid image-count-${Math.min(attachments.length, 4)}`}>{visible.map((attachment, index) => <button key={attachment.id} type="button" onClick={() => onOpen(index)}>{attachment.url ? <img src={attachment.url} alt={`${alt} ${index + 1}`} /> : <span className="dm-image-placeholder" />}{index === 3 && attachments.length > 4 ? <span className="dm-more-images">+{attachments.length - 4}</span> : null}</button>)}</div>;
}

function CameraModal({ copy, error, videoRef, onCapture, onClose, onPickFile }: { copy: ChatCopy; error: string; videoRef: React.RefObject<HTMLVideoElement>; onCapture: () => void; onClose: () => void; onPickFile: () => void }) {
  return <div className="dm-modal-backdrop" role="presentation" onMouseDown={onClose}><section className="dm-camera-modal" role="dialog" aria-modal="true" aria-label={copy.camera} onMouseDown={(event) => event.stopPropagation()}>{error ? <div className="dm-camera-error"><p>{error}</p><button type="button" className="workspace-primary-button" onClick={onPickFile}>{copy.photos}</button></div> : <video ref={videoRef} muted playsInline /> }<footer><button type="button" className="workspace-secondary-button" onClick={onClose}>Cancel</button>{!error ? <button type="button" className="workspace-primary-button" onClick={onCapture}>{copy.camera}</button> : null}</footer></section></div>;
}

function ImageLightbox({ state, onClose, onChange }: { state: { images: MessageAttachment[]; index: number }; onClose: () => void; onChange: (index: number) => void }) {
  const current = state.images[state.index];
  useEffect(() => { const keydown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); if (event.key === "ArrowLeft" && state.index > 0) onChange(state.index - 1); if (event.key === "ArrowRight" && state.index < state.images.length - 1) onChange(state.index + 1); }; window.addEventListener("keydown", keydown); return () => window.removeEventListener("keydown", keydown); }, [onChange, onClose, state.images.length, state.index]);
  return <div className="dm-lightbox" role="dialog" aria-modal="true" aria-label="Image viewer" onMouseDown={onClose}><button type="button" className="dm-lightbox-close" onClick={onClose} aria-label="Close"><X /></button>{state.index > 0 ? <button type="button" className="dm-lightbox-nav is-left" onClick={(event) => { event.stopPropagation(); onChange(state.index - 1); }}>‹</button> : null}{current?.url ? <img src={current.url} alt="" onMouseDown={(event) => event.stopPropagation()} /> : null}{state.index < state.images.length - 1 ? <button type="button" className="dm-lightbox-nav is-right" onClick={(event) => { event.stopPropagation(); onChange(state.index + 1); }}>›</button> : null}</div>;
}

async function uploadMedia(input: { message: string; clientMessageId: string; conversationId?: string; files: File[] }) {
  const form = new FormData();
  form.set("message", input.message); form.set("clientMessageId", input.clientMessageId);
  if (input.conversationId) form.set("conversationId", input.conversationId);
  input.files.forEach((file) => form.append("files", file));
  const response = await fetch("/api/conversations/media", { method: "POST", body: form });
  const data = await response.json() as { conversationId?: string; error?: string };
  if (!response.ok || !data.conversationId) throw new Error(data.error || "Could not upload the photo.");
  return { conversationId: data.conversationId };
}

function formatListTime(value: string, locale: "ko" | "en") { return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", { month: "short", day: "numeric" }).format(new Date(value)); }
function formatMessageTime(value: string, locale: "ko" | "en") { return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(value)); }

async function persistLocalResponse(input: { message: string; clientMessageId: string; conversationId?: string; response: ApiChatResponse; messageAlreadyPersisted?: boolean }) {
  const response = await fetch("/api/conversations/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  const data = await response.json() as { conversationId?: string; error?: string };
  if (!response.ok || !data.conversationId) throw new Error(data.error || "Conversation could not be saved.");
  return { conversationId: data.conversationId };
}

function formatProviderStatus(data: ApiChatResponse): string {
  if (data.cached) {
    return "로컬 캐시 응답";
  }

  if (data.provider === "nvidia") {
    return "Heather 응답 완료";
  }

  if (data.provider === "openai") {
    return "OpenAI 응답 · 월 한도 차감";
  }

  if (data.provider === "ollama") {
    return data.model ? `로컬 모델 응답 · ${data.model}` : "로컬 모델 응답";
  }

  if (data.provider === "browser-local") {
    return "브라우저 로컬 응답";
  }

  if (data.providerWarning) {
    return "로컬 Heather 응답 · 비용 차단";
  }

  return "로컬 Heather 응답";
}

function incrementPaidApiCount(settings: HeatherSettings): HeatherSettings {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const currentCount = settings.apiUsageMonth === currentMonth ? settings.apiCallsThisMonth : 0;

  return {
    ...settings,
    apiUsageMonth: currentMonth,
    apiCallsThisMonth: currentCount + 1
  };
}

function readCachedResponse(payload: ChatRequestPayload): ApiChatResponse | null {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(cacheKey(payload));
  if (!raw) return null;

  try {
    return JSON.parse(raw) as ApiChatResponse;
  } catch {
    return null;
  }
}

function writeCachedResponse(payload: ChatRequestPayload, data: ApiChatResponse): void {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(
    cacheKey(payload),
    JSON.stringify({
      ...data,
      cached: false
    })
  );
}

function planFastDesktopAction(message: string, conversation: Conversation): FastDesktopAction | null {
  const trimmed = message.trim();
  const normalized = trimmed.toLowerCase();

  if (/말\s*멈춰|그만\s*말|읽기\s*중지|음성\s*중지|stop\s*(speaking|talking|tts)?/i.test(trimmed)) {
    return {
      name: "stop_speaking",
      description: "macOS 음성 읽기를 중지합니다.",
      target: "macOS speech",
      riskLevel: "low",
      requiresConfirmation: false,
      args: {}
    };
  }

  if (/(이\s*)?(답변|메시지).*(읽어|읽어줘|말해|들려)|read\s+(this|answer|message)/i.test(trimmed)) {
    const lastAssistantMessage = findLastAssistantMessage(conversation);
    return {
      name: "speak_macos",
      description: "직전 Heather 답변을 macOS 음성으로 읽습니다.",
      target: "last assistant message",
      riskLevel: "low",
      requiresConfirmation: false,
      args: {
        text: lastAssistantMessage?.content || "읽을 직전 답변이 없습니다.",
        rate: 190
      }
    };
  }

  const explicitUrl = trimmed.match(/https?:\/\/[^\s)"'<>]+/)?.[0];
  if (explicitUrl && /열어|열어줘|open|go\s*to|visit/i.test(trimmed)) {
    return {
      name: "open_url",
      description: "http/https 링크를 기본 브라우저로 엽니다.",
      target: explicitUrl,
      riskLevel: "low",
      requiresConfirmation: false,
      args: { url: explicitUrl }
    };
  }

  const appName = extractAllowedAppName(trimmed);
  if (appName && /열어|열어줘|실행|켜줘|켜|open|launch|start/i.test(trimmed)) {
    return {
      name: "open_app",
      description: "허용 목록에 있는 앱을 엽니다.",
      target: appName,
      riskLevel: "low",
      requiresConfirmation: false,
      args: { appName }
    };
  }

  if (/유튜브\s*뮤직|youtube\s*music/i.test(trimmed)) {
    const query = extractSearchQuery(trimmed, /유튜브\s*뮤직|youtube\s*music/gi);
    if (!query) return null;

    if (/재생|틀어|들려|play/i.test(normalized)) {
      return {
        name: "play_youtube_music",
        description: "YouTube Music에서 검색 후 재생을 시도합니다.",
        target: query,
        riskLevel: "low",
        requiresConfirmation: false,
        args: { query }
      };
    }

    if (/검색|찾아|search/i.test(normalized)) {
      return {
        name: "search_youtube_music",
        description: "YouTube Music 검색 페이지를 엽니다.",
        target: query,
        riskLevel: "low",
        requiresConfirmation: false,
        args: { query }
      };
    }
  }

  if (/유튜브|youtube/i.test(trimmed) && /검색|찾아|search/i.test(trimmed)) {
    const query = extractSearchQuery(trimmed, /유튜브|youtube/gi);
    if (query) {
      return {
        name: "search_youtube",
        description: "YouTube 검색 페이지를 엽니다.",
        target: query,
        riskLevel: "low",
        requiresConfirmation: false,
        args: { query }
      };
    }
  }

  if (/구글|google/i.test(trimmed) && /검색|찾아|search/i.test(trimmed)) {
    const query = extractSearchQuery(trimmed, /구글|google/gi);
    if (query) {
      return {
        name: "search_web",
        description: "Google 검색 페이지를 엽니다.",
        target: query,
        riskLevel: "low",
        requiresConfirmation: false,
        args: { query }
      };
    }
  }

  return null;
}

async function runFastDesktopAction(action: FastDesktopAction): Promise<DesktopActionResult> {
  if (action.name === "open_app") {
    return invokeTauriCommand<DesktopActionResult>("open_app", {
      appName: String(action.args.appName || "")
    });
  }

  if (action.name === "open_url") {
    return invokeTauriCommand<DesktopActionResult>("open_url", {
      url: String(action.args.url || "")
    });
  }

  if (action.name === "search_web") {
    return invokeTauriCommand<DesktopActionResult>("search_web", {
      query: String(action.args.query || "")
    });
  }

  if (action.name === "search_youtube") {
    return invokeTauriCommand<DesktopActionResult>("search_youtube", {
      query: String(action.args.query || "")
    });
  }

  if (action.name === "search_youtube_music") {
    return invokeTauriCommand<DesktopActionResult>("search_youtube_music", {
      query: String(action.args.query || "")
    });
  }

  if (action.name === "play_youtube_music") {
    const result = await invokeTauriCommand<MediaActionResult>("play_youtube_music", {
      query: String(action.args.query || "")
    });
    return {
      actionName: "play_youtube_music",
      target: result.query,
      url: result.url,
      message: result.message
    };
  }

  if (action.name === "speak_macos") {
    return invokeTauriCommand<DesktopActionResult>("speak_macos", {
      text: String(action.args.text || ""),
      rate: Number(action.args.rate || 190)
    });
  }

  return invokeTauriCommand<DesktopActionResult>("stop_speaking");
}

function formatActionResponse(action: FastDesktopAction, result: DesktopActionResult): string {
  return [
    `작업 제안: ${action.description}`,
    `대상: ${action.target}`,
    `위험도: ${action.riskLevel}`,
    "",
    `실행 결과: ${result.message}`
  ].join("\n");
}

function findLastAssistantMessage(conversation: Conversation): Conversation["messages"][number] | null {
  for (let index = conversation.messages.length - 1; index >= 0; index -= 1) {
    const message = conversation.messages[index];
    if (message.role === "assistant") return message;
  }

  return null;
}

function extractAllowedAppName(message: string): string | null {
  const appMap: Array<[RegExp, string]> = [
    [/google\s*chrome|chrome|크롬|구글\s*크롬/i, "Google Chrome"],
    [/safari|사파리/i, "Safari"],
    [/finder|파인더/i, "Finder"],
    [/cursor|커서/i, "Cursor"],
    [/vs\s*code|vscode|visual\s*studio\s*code/i, "VS Code"],
    [/notes|메모장|메모/i, "Notes"],
    [/calendar|캘린더|달력/i, "Calendar"],
    [/music|음악|뮤직/i, "Music"],
    [/zoom|줌/i, "Zoom"],
    [/capcut|캡컷/i, "CapCut"]
  ];

  return appMap.find(([pattern]) => pattern.test(message))?.[1] || null;
}

function extractSearchQuery(message: string, servicePattern: RegExp): string {
  return message
    .replace(/^\s*헤더[,\s]*/i, "")
    .replace(servicePattern, "")
    .replace(/에서|으로|로|에|좀|please/gi, " ")
    .replace(/검색해줘|검색해 줘|검색|찾아줘|찾아 줘|찾아|search|열어줘|열어/gi, " ")
    .replace(/재생해줘|재생해 줘|재생|틀어줘|틀어 줘|틀어|들려줘|들려 줘|들려|play/gi, " ")
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .slice(0, 160);
}

function isForbiddenDesktopRequest(message: string): boolean {
  return /파일\s*(삭제|이동|덮어쓰기)|delete\s+file|move\s+folder|overwrite|shell|터미널.*명령|결제|구매|송금|은행|bank|password|비밀번호|token|토큰|cookie|쿠키|주식|stock\s*trading|trade\s*stock/i.test(
    message
  );
}

function asksCurrentProviderOrModel(message: string): boolean {
  const normalized = message.toLowerCase();
  const asksRuntime =
    /모델|model|provider|프로바이더|제공자|엔진|backend|백엔드|api|런타임|runtime|상태|status|로컬\s*모델/.test(
      normalized
    );
  const asksCurrent = /현재|지금|사용\s*중|쓰고|뭐야|무엇|알려|확인|check|current/.test(normalized);

  return asksCurrent && asksRuntime;
}

function cacheKey(payload: ChatRequestPayload): string {
  const compact = JSON.stringify({
    message: payload.message.trim().toLowerCase(),
    tone: payload.settings.tone,
    aiMode: payload.settings.aiMode,
    ollamaBaseUrl: payload.settings.ollamaBaseUrl,
    ollamaModel: payload.settings.ollamaModel,
    memories: payload.memories
      .filter((memory) => !memory.archived)
      .slice(0, 4)
      .map((memory) => [memory.type, memory.content.slice(0, 160), memory.tags.slice(0, 4)]),
    projects: payload.projects
      .slice(0, 4)
      .map((project) => [project.title, project.status, project.priority, project.next_actions.slice(0, 3)]),
    teachings: (payload.teachings || [])
      .filter((teaching) => teaching.active)
      .slice(0, 4)
      .map((teaching) => [teaching.type, teaching.title, teaching.content.slice(0, 160), teaching.tags.slice(0, 4)]),
    automationRecipes: (payload.automationRecipes || [])
      .filter((recipe) => recipe.enabled)
      .slice(0, 2)
      .map((recipe) => [
        recipe.title,
        recipe.trigger.type,
        recipe.actions
          .filter((action) => action.enabled)
          .slice(0, 3)
          .map((action) => [action.type, action.label, action.desktopOnly])
      ]),
    history: payload.conversation?.messages
      .filter((message) => message.role !== "system")
      .slice(-2)
      .map((message) => [message.role, message.content.slice(0, 300)])
  });

  return `heather.ai.chat-cache.${hashString(compact)}`;
}

function hashString(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }

  return (hash >>> 0).toString(36);
}

function stopHeatherSpeech() {
  if (typeof window === "undefined") return;

  if (activeHeatherAudio) {
    activeHeatherAudio.pause();
    activeHeatherAudio = null;
  }

  if (activeHeatherAudioUrl) {
    URL.revokeObjectURL(activeHeatherAudioUrl);
    activeHeatherAudioUrl = null;
  }

  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

async function speakHeather(
  text: string,
  settings: HeatherSettings,
  callbacks: {
    onStart?: () => void;
    onEnd?: () => void;
  } = {}
) {
  if (typeof window === "undefined") return false;

  stopHeatherSpeech();
  const speechText = cleanSpeechText(text);

  if (settings.voiceProvider === "elevenlabs" && settings.elevenLabsVoiceId.trim()) {
    try {
      const response = await fetch("/api/tts/elevenlabs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          text: speechText,
          voiceId: settings.elevenLabsVoiceId,
          modelId: settings.elevenLabsModelId || "eleven_v3"
        })
      });

      if (response.ok) {
        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        activeHeatherAudio = audio;
        activeHeatherAudioUrl = audioUrl;
        audio.onplay = () => callbacks.onStart?.();
        audio.onended = () => {
          callbacks.onEnd?.();
          if (activeHeatherAudio === audio) {
            activeHeatherAudio = null;
          }
          URL.revokeObjectURL(audioUrl);
          if (activeHeatherAudioUrl === audioUrl) {
            activeHeatherAudioUrl = null;
          }
        };
        audio.onerror = () => {
          callbacks.onEnd?.();
          if (activeHeatherAudio === audio) {
            activeHeatherAudio = null;
          }
          URL.revokeObjectURL(audioUrl);
          if (activeHeatherAudioUrl === audioUrl) {
            activeHeatherAudioUrl = null;
          }
        };
        await audio.play();
        return true;
      }
    } catch {
      // Fall back to the browser TTS engine when ElevenLabs is unavailable.
    }
  }

  if (!("speechSynthesis" in window)) return false;

  const utterance = new SpeechSynthesisUtterance(speechText);
  utterance.lang = detectSpeechLanguage(speechText, settings);
  utterance.rate = 1.04;
  utterance.pitch = 1.02;
  utterance.onstart = callbacks.onStart || null;
  utterance.onend = callbacks.onEnd || null;
  utterance.onerror = callbacks.onEnd || null;

  const voices = window.speechSynthesis.getVoices();
  const selectedVoice =
    voices.find((voice) => voice.name === settings.voiceName) ||
    voices.find((voice) => voice.lang.toLowerCase().startsWith(utterance.lang.slice(0, 2).toLowerCase())) ||
    voices.find((voice) => voice.lang.toLowerCase().startsWith("en")) ||
    voices.find((voice) => voice.lang.toLowerCase().startsWith("ko"));

  if (selectedVoice) {
    utterance.voice = selectedVoice;
  }

  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
  return true;
}

function cleanSpeechText(text: string): string {
  return text.replace(/[#*_`>-]/g, "").replace(/\s+/g, " ").trim();
}

function detectSpeechLanguage(text: string, settings: HeatherSettings): string {
  if (settings.defaultLanguage === "ko") return "ko-KR";
  if (settings.defaultLanguage === "en") return /[가-힣]/.test(text) ? "ko-KR" : "en-US";
  return /[가-힣]/.test(text) ? "ko-KR" : "en-US";
}
