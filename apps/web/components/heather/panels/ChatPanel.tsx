"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  MessageSquarePlus,
  Mic,
  MicOff,
  Search,
  Send,
  Smile,
  Trash2,
  Volume2
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
  MemoryRecord,
  ProjectRecord,
  TeachingRecord
} from "@heather/core";
import { getSupabaseBrowserClient } from "../../../lib/supabase-client";
import { PersonalConversationRepository } from "../../../lib/personal-conversation-repository";
import { HeatherAvatar } from "../HeatherAvatar";
import { ThinkingStatusPanel } from "../chat/ThinkingStatusPanel";
import { readChatProgressStream, type ChatProgressEvent, type ChatStreamEvent } from "../../../lib/chat/progress-events";
import { createExplicitPersonalMemory, dedupeConsecutiveUserMessages, isRecentDuplicateSubmission, type RecentSubmission } from "../../../lib/chat/outgoing-message";

interface ChatPanelProps {
  conversations: Conversation[];
  memories: MemoryRecord[];
  projects: ProjectRecord[];
  teachings: TeachingRecord[];
  automationRecipes: AutomationRecipe[];
  settings: HeatherSettings;
  onSaveConversation: (conversation: Conversation) => Promise<void>;
  onDeleteConversation: (id: string) => Promise<void>;
  onMergeConversations: (conversations: Conversation[]) => Promise<void>;
  onSaveMemory: (memory: MemoryRecord) => Promise<void>;
  onSaveSettings: (settings: HeatherSettings) => Promise<void>;
}

interface ApiChatResponse extends ChatResponsePayload {
  provider?: string;
  providerWarning?: string;
  cached?: boolean;
  meteredApiCall?: boolean;
  error?: string;
  model?: string;
}

interface SpeechRecognitionResultLike {
  transcript: string;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<ArrayLike<SpeechRecognitionResultLike>>;
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionLike;
}

type WindowWithSpeechRecognition = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

export function ChatPanel({
  conversations,
  memories,
  projects,
  teachings,
  automationRecipes,
  settings,
  onSaveConversation,
  onDeleteConversation,
  onMergeConversations,
  onSaveMemory,
  onSaveSettings
}: ChatPanelProps) {
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [inputSource, setInputSource] = useState<"text" | "voice">("text");
  const [providerStatus, setProviderStatus] = useState("대기 중");
  const [progressEvents, setProgressEvents] = useState<ChatProgressEvent[]>([]);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messageAreaRef = useRef<HTMLDivElement | null>(null);
  const sendLockRef = useRef(false);
  const recentSubmissionRef = useRef<RecentSubmission | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const isComposingRef = useRef(false);
  const conversationRepositoryRef = useRef(new PersonalConversationRepository());

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) || null,
    [activeConversationId, conversations]
  );

  const filteredConversations = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return conversations;

    return conversations.filter((conversation) => {
      const haystack = `${conversation.title} ${conversation.messages
        .map((message) => message.content)
        .join(" ")}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [conversations, search]);

  const visibleMessages = useMemo(
    () => dedupeConsecutiveUserMessages(activeConversation?.messages || []),
    [activeConversation?.messages]
  );

  useEffect(() => {
    if (!activeConversationId && conversations[0]) {
      setActiveConversationId(conversations[0].id);
    }
  }, [activeConversationId, conversations]);

  useEffect(() => {
    const area = messageAreaRef.current;
    if (!area) return;
    const frame = window.requestAnimationFrame(() => {
      area.scrollTo({ top: area.scrollHeight, behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeConversation?.id, activeConversation?.messages.length, isSending, progressEvents.length]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    let active = true;
    async function restorePersonalConversations() {
      const session = await getSupabaseBrowserClient()?.auth.getSession();
      if (!session?.data.session?.access_token) return;
      try {
        const persisted = await conversationRepositoryRef.current.list();
        if (active && persisted.length) await onMergeConversations(persisted);
      } catch {
        // The current browser copy remains available while the account storage
        // migration is being applied or a transient network error is resolved.
      }
    }
    void restorePersonalConversations();
    return () => { active = false; };
  }, [onMergeConversations]);

  async function handleNewConversation() {
    const conversation = createConversation();
    await onSaveConversation(conversation);
    setActiveConversationId(conversation.id);
    setDraft("");
  }

  async function handleDeleteConversation(id: string) {
    if (!window.confirm("이 대화를 삭제할까요?")) return;

    try { await conversationRepositoryRef.current.archive(id); } catch { /* Local removal remains available. */ }
    await onDeleteConversation(id);
    if (activeConversationId === id) {
      setActiveConversationId(null);
    }
  }

  async function handleSend() {
    const message = (textareaRef.current?.value ?? draft).trim();
    if (!message || isSending || sendLockRef.current || isRecentDuplicateSubmission(message, recentSubmissionRef.current)) return;

    sendLockRef.current = true;
    recentSubmissionRef.current = { fingerprint: message.trim().replace(/\s+/g, " ").toLocaleLowerCase(), submittedAt: Date.now() };
    setDraft("");
    setIsSending(true);
    setProviderStatus("응답 준비 중");
    setProgressEvents([]);
    const controller = new AbortController();
    abortRef.current = controller;

    const baseConversation = activeConversation || createConversation(message);
    const userMessage = createMessage("user", message, inputSource);
    const optimisticConversation: Conversation = {
      ...baseConversation,
      title: baseConversation.messages.length ? baseConversation.title : generateConversationTitle(message),
      messages: [...dedupeConsecutiveUserMessages(baseConversation.messages), userMessage],
      updatedAt: nowIso()
    };

    setActiveConversationId(optimisticConversation.id);
    await onSaveConversation(optimisticConversation);

    try {
      const payload: ChatRequestPayload = {
        message,
        conversation: optimisticConversation,
        settings,
        memories,
        projects,
        teachings,
        automationRecipes
      };
      const data = await resolveHeatherResponse(payload, (event) => {
        if (event.type === "progress") setProgressEvents((current) => [...current, event.data]);
      }, controller.signal);

      const responseMessage = removeMarkdownEmphasis(data.message);
      const assistantMessage = createMessage("assistant", responseMessage);
      const finalConversation: Conversation = {
        ...optimisticConversation,
        title:
          optimisticConversation.messages.length <= 1
            ? data.title || optimisticConversation.title
            : optimisticConversation.title,
        messages: [...optimisticConversation.messages, assistantMessage],
        updatedAt: nowIso()
      };

      await onSaveConversation(finalConversation);
      let persistenceFailed = false;
      try {
        const persistedConversation = await conversationRepositoryRef.current.save(finalConversation);
        if (persistedConversation.id !== finalConversation.id) {
          await onDeleteConversation(finalConversation.id);
          await onSaveConversation(persistedConversation);
          setActiveConversationId(persistedConversation.id);
        }
      } catch {
        // Do not lose a completed answer if account persistence is temporarily unavailable.
        persistenceFailed = true;
      }
      setProviderStatus(persistenceFailed ? "답변은 완료됐지만 개인 채팅 기록을 계정에 저장하지 못했습니다." : formatProviderStatus(data));

      if (data.meteredApiCall) {
        await onSaveSettings(incrementPaidApiCount(settings));
      }

      const memorySuggestion = data.memorySuggestion || createExplicitPersonalMemory(message);
      const memoryAlreadyExists = memorySuggestion && memories.some((memory) => !memory.archived && memory.content === memorySuggestion.content);
      if (memorySuggestion && settings.memoryEnabled && !memoryAlreadyExists) {
        try {
          const timestamp = nowIso();
          await onSaveMemory({
            ...memorySuggestion,
            id: createId("memory"),
            created_at: timestamp,
            updated_at: timestamp,
            archived: false
          });
          if (memorySuggestion.source === "chat-explicit") setProviderStatus("개인 메모리에 저장했습니다.");
        } catch {
          if (memorySuggestion.source === "chat-explicit") setProviderStatus("답변은 완료됐지만 개인 메모리는 저장하지 못했습니다. 로그인 상태를 확인하세요.");
        }
      }

      if (settings.voiceOutputEnabled) {
        speakHeather(responseMessage, settings.voiceName);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setProgressEvents((current) => [...current, createClientProgressEvent("cancelled", "cancelled", 100)]);
        setProviderStatus("응답 생성을 중단했습니다.");
        return;
      }
      const assistantMessage = createMessage(
        "assistant",
        `지금 응답을 완성하지 못했어요. ${error instanceof Error ? error.message : "알 수 없는 오류"}`
      );
      await onSaveConversation({
        ...optimisticConversation,
        messages: [...optimisticConversation.messages, assistantMessage],
        updatedAt: nowIso()
      });
      setProviderStatus("오류 발생");
    } finally {
      setInputSource("text");
      abortRef.current = null;
      sendLockRef.current = false;
      setIsSending(false);
    }
  }

  function handleStopResponse() {
    abortRef.current?.abort();
  }

  async function resolveHeatherResponse(payload: ChatRequestPayload, onEvent: (event: ChatStreamEvent) => void, signal: AbortSignal): Promise<ApiChatResponse> {
    const cachedResponse = payload.settings.cacheResponses && !isQuickLinkCommand(payload.message) && !isPersonalMemoryRequest(payload.message) ? readCachedResponse(payload) : null;
    if (cachedResponse) {
      onEvent({ type: "progress", data: createClientProgressEvent("request_received", "completed", 10) });
      onEvent({ type: "progress", data: createClientProgressEvent("response_composition", "completed", 92, "cache") });
      onEvent({ type: "progress", data: createClientProgressEvent("completed", "completed", 100, "cache") });
      return {
        ...cachedResponse,
        cached: true
      };
    }

    const session = await getSupabaseBrowserClient()?.auth.getSession();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (session?.data.session?.access_token) headers.Authorization = `Bearer ${session.data.session.access_token}`;
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { ...headers, Accept: "text/event-stream" },
      body: JSON.stringify(payload),
      signal
    });

    if (!response.ok) {
      const data = await response.json() as ApiChatResponse;
      throw new Error(data.error || "Heather chat request failed.");
    }

    let message = "";
    let provider: string | undefined;
    let model: string | undefined;
    let wasCached = false;
    let streamError: string | undefined;
    await readChatProgressStream(response, (event) => {
      onEvent(event);
      if (event.type === "content_delta") message += event.data.text;
      if (event.type === "done") { provider = event.data.provider; model = event.data.model; wasCached = Boolean(event.data.cached); }
      if (event.type === "error") streamError = event.data.user_message;
    });
    if (streamError || !message) throw new Error(streamError || "Heather chat request failed.");
    const data: ApiChatResponse = { message, title: generateConversationTitle(payload.message), risk: { level: "low", requiresConfirmation: false, reason: "Text response." }, provider, model, cached: wasCached };

    if (payload.settings.cacheResponses && !isQuickLinkCommand(payload.message) && !isPersonalMemoryRequest(payload.message)) {
      writeCachedResponse(payload, data);
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
      setProviderStatus("이 브라우저는 음성 인식을 지원하지 않습니다.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "ko-KR";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const result = event.results[event.results.length - 1]?.[0]?.transcript;
      if (result) {
        setDraft(result);
        setInputSource("voice");
      }
    };
    recognition.onerror = () => {
      setIsListening(false);
      setProviderStatus("음성 입력 오류");
    };
    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    setIsListening(true);
    setProviderStatus("음성 입력 중");
    recognition.start();
  }

  return (
    <div className="chat-workspace dm-workspace">
      <aside className="chat-conversation-panel">
        <div className="chat-list-toolbar">
          <div className="dm-list-heading">
            <strong>채팅</strong>
            <button
              type="button"
              onClick={handleNewConversation}
              className="dm-icon-button"
              title="새 대화"
              aria-label="새 대화"
            >
              <MessageSquarePlus />
            </button>
          </div>
          <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="대화 검색"
                className="h-10 w-full rounded-lg border border-line bg-white pl-9 pr-3 text-sm"
              />
          </label>
        </div>

        <div className="chat-conversation-list heather-scrollbar">
          {filteredConversations.length ? (
            filteredConversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => setActiveConversationId(conversation.id)}
                className={`chat-conversation-row dm-conversation-row group ${
                  activeConversationId === conversation.id ? "is-active" : ""
                }`}
              >
                <HeatherAvatar settings={settings} size="medium" />
                <span className="dm-conversation-copy">
                  <span>
                    <strong>{conversation.title}</strong>
                    <time>
                      {new Date(conversation.updatedAt).toLocaleDateString("ko-KR", {
                        month: "short",
                        day: "numeric"
                      })}
                    </time>
                  </span>
                  <small>{conversation.messages.at(-1)?.content || "아직 메시지가 없습니다."}</small>
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleDeleteConversation(conversation.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.stopPropagation();
                      void handleDeleteConversation(conversation.id);
                    }
                  }}
                  className="dm-row-delete"
                  title="대화 삭제"
                  aria-label="대화 삭제"
                >
                  <Trash2 />
                </span>
              </button>
            ))
          ) : (
            <p className="chat-list-empty">{search ? "검색 결과가 없습니다." : "아직 대화가 없습니다."}</p>
          )}
        </div>
      </aside>

      <section className="chat-main-panel">
        <div className="chat-main-header">
          <div className="dm-header-person">
            <HeatherAvatar settings={settings} size="medium" />
            <div className="dm-header-title">
              <strong>Heather</strong>
              <small>일상과 연구를 함께하는 파트너</small>
            </div>
          </div>
          <div className="dm-header-actions" title={settings.voiceOutputEnabled ? "음성 응답 켜짐" : "음성 응답 꺼짐"}>
            <Volume2 />
          </div>
        </div>

        <div ref={messageAreaRef} className="chat-message-area dm-message-area heather-scrollbar">
          {visibleMessages.length ? (
            <div className="dm-thread">
              {visibleMessages.map((message) => (
                <article
                  key={message.id}
                  className={`dm-message-row ${message.role === "user" ? "is-user" : "is-heather"}`}
                >
                  {message.role !== "user" ? (
                    <span className="dm-message-avatar">
                      <HeatherAvatar settings={settings} size="small" />
                    </span>
                  ) : null}
                  <div className="dm-message-stack">
                    <div className="chat-message dm-message-bubble">
                      <MessageContent content={message.content} removeEmphasis={message.role === "assistant"} />
                    </div>
                    <div className="dm-message-meta">
                      {message.source === "voice" ? "voice · " : ""}
                      {new Date(message.createdAt).toLocaleTimeString("ko-KR", {
                        hour: "2-digit",
                        minute: "2-digit"
                      })}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="chat-welcome">
              <HeatherAvatar settings={settings} size="large" />
              <h2>Heather</h2>
              <p>일상과 연구를 함께하는 파트너</p>
              <p className="dm-welcome-message">안녕하세요. 오늘은 무엇을 함께 이야기해볼까요?</p>
            </div>
          )}
          {(isSending || progressEvents.length) ? <ThinkingStatusPanel events={progressEvents} isRunning={isSending} locale={settings.defaultLanguage} onCancel={handleStopResponse} /> : null}
        </div>

        <div className="chat-composer-wrap">
          <div className="chat-composer dm-composer">
            <button
              type="button"
              className="dm-composer-button"
              onClick={() => {
                setDraft((current) => `${current}${current ? " " : ""}🙂`);
                textareaRef.current?.focus();
              }}
              title="이모지"
              aria-label="이모지"
            >
              <Smile />
            </button>
            <button
              type="button"
              onClick={toggleListening}
              className={`dm-composer-button ${isListening ? "is-listening" : ""}`}
              title={isListening ? "음성 입력 중지" : "음성 입력"}
              aria-label={isListening ? "음성 입력 중지" : "음성 입력"}
            >
              {isListening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </button>
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setInputSource("text");
              }}
              onCompositionStart={() => {
                isComposingRef.current = true;
              }}
              onCompositionEnd={(event) => {
                isComposingRef.current = false;
                setDraft(event.currentTarget.value);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.shiftKey) return;
                if (event.nativeEvent.isComposing || isComposingRef.current) return;

                event.preventDefault();
                void handleSend();
              }}
              placeholder="헤더에게 요청할 내용을 입력하세요."
              className="dm-composer-textarea"
              rows={1}
            />
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={!draft.trim() || isSending}
              className={`dm-send-button ${draft.trim() ? "has-content" : ""}`}
              title="보내기"
              aria-label="보내기"
            >
              <Send className="h-5 w-5" />
            </button>
          </div>
          {!isSending ? <p className="dm-composer-status" role="status">{providerStatus}</p> : null}
        </div>
      </section>
    </div>
  );
}

function formatProviderStatus(data: ApiChatResponse): string {
  if (data.provider === "agent-runtime") {
    return "웹 검색 결과를 반영한 응답";
  }

  if (data.cached) {
    return "로컬 캐시 응답";
  }

  if (data.provider === "openai") {
    return "OpenAI 응답 · 월 한도 차감";
  }

  if (data.provider === "ollama") {
    return "로컬 모델 응답";
  }

  if (data.provider === "ollama") {
    return data.model ? `Ollama 응답 · ${data.model}` : "Ollama 응답";
  }

  if (data.provider === "browser-local") {
    return "브라우저 로컬 응답";
  }

  if (data.providerWarning) {
    return "로컬 Heather 응답 · 비용 차단";
  }

  return "로컬 Heather 응답";
}

function createClientProgressEvent(stage: ChatProgressEvent["stage"], status: ChatProgressEvent["status"], progress: number, sourceType?: ChatProgressEvent["source_type"]): ChatProgressEvent { const now = new Date().toISOString(); return { id: `client:${stage}:${now}`, request_id: "client-cache", stage, status, progress, source_type: sourceType, started_at: now, completed_at: now, duration_ms: 0 }; }

function MessageContent({ content, removeEmphasis = false }: { content: string; removeEmphasis?: boolean }) {
  const visibleContent = removeEmphasis ? removeMarkdownEmphasis(content) : content;
  const parts = visibleContent.split(/(https?:\/\/[^\s]+)/g);
  return <div className="whitespace-pre-wrap">{parts.map((part, index) => /^https?:\/\//.test(part)
    ? <a key={index} href={part} target="_blank" rel="noreferrer" className="break-all text-heather-700 underline underline-offset-2">{part}</a>
    : part)}</div>;
}

function removeMarkdownEmphasis(value: string) {
  return value.replace(/\*\*/g, "");
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

function cacheKey(payload: ChatRequestPayload): string {
  const compact = JSON.stringify({
    message: payload.message.trim().toLowerCase(),
    tone: payload.settings.tone,
    aiMode: payload.settings.aiMode,
    memories: payload.memories
      .filter((memory) => !memory.archived)
      .slice(0, 6)
      .map((memory) => [memory.type, memory.content.slice(0, 180), memory.tags]),
    projects: payload.projects
      .slice(0, 6)
      .map((project) => [project.title, project.status, project.priority, project.next_actions.slice(0, 4)]),
    teachings: (payload.teachings || [])
      .filter((teaching) => teaching.active)
      .slice(0, 6)
      .map((teaching) => [teaching.type, teaching.title, teaching.content.slice(0, 180), teaching.tags]),
    automationRecipes: (payload.automationRecipes || [])
      .filter((recipe) => recipe.enabled)
      .slice(0, 4)
      .map((recipe) => [
        recipe.title,
        recipe.trigger.type,
        recipe.actions
          .filter((action) => action.enabled)
          .slice(0, 5)
          .map((action) => [action.type, action.label, action.desktopOnly])
      ]),
    history: payload.conversation?.messages
      .filter((message) => message.role !== "system")
      .slice(-4)
      .map((message) => [message.role, message.content.slice(0, 360)])
  });

  return `heather.ai.chat-cache.${hashString(compact)}`;
}

function isQuickLinkCommand(message: string) {
  const action = /등록|추가|삭제|지워|제거|옮겨|이동|주소.*(?:바꿔|변경|수정)|링크.*(?:바꿔|변경|수정)|\b(add|register|delete|remove|move|update|rename|change)\b/i.test(message);
  const target = /https?:\/\/|사이트|링크|업무|프로젝트|콘텐츠|유튜브|음악|\b(quick\s*access|quick\s*link|website|link|work|project|content)\b/i.test(message);
  return action && target;
}

function isPersonalMemoryRequest(message: string) {
  return /\b(my (?:document|file|journal|diary)|uploaded (?:document|file))\b|개인\s*메모리|내\s*(?:파일|문서|일기)|업로드(?:한|한\s*파일|한\s*문서)|일기(?:를|의|파일)?/.test(message.toLocaleLowerCase());
}

function hashString(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }

  return (hash >>> 0).toString(36);
}

function speakHeather(text: string, voiceName: string) {
  if (typeof window === "undefined") return;
  if (!("speechSynthesis" in window)) return;

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text.replace(/[#*_`>-]/g, ""));
  utterance.lang = "ko-KR";
  utterance.rate = 1;
  utterance.pitch = 1.02;

  const voices = window.speechSynthesis.getVoices();
  const selectedVoice =
    voices.find((voice) => voice.name === voiceName) ||
    voices.find((voice) => voice.lang.toLowerCase().startsWith("ko"));

  if (selectedVoice) {
    utterance.voice = selectedVoice;
  }

  window.speechSynthesis.speak(utterance);
}
