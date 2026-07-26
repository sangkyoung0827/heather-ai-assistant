"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  MessageSquare,
  MessageSquarePlus,
  Mic,
  MicOff,
  Search,
  Send,
  Square,
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
import { invokeTauriCommand, isTauriRuntime } from "@heather/platform";
import type { DesktopActionResult, MediaActionResult } from "@heather/platform";
import { HeatherAvatar } from "../HeatherAvatar";
import { useConversationStore } from "../../../lib/conversations/use-conversation-store";

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
  const [isSending, setIsSending] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [inputSource, setInputSource] = useState<"text" | "voice">("text");
  const [providerStatus, setProviderStatus] = useState("대기 중");
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceBaseDraftRef = useRef("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const sendLockRef = useRef(false);

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
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [activeConversation?.messages.length, isSending]);

  useEffect(() => {
    return () => {
      stopHeatherSpeech();
    };
  }, []);

  async function handleNewConversation() {
    await setNewConversation();
    setDraft("");
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
    if (!message || isSending || sendLockRef.current) return;

    sendLockRef.current = true;
    setDraft("");
    setIsSending(true);
    setProviderStatus("빠른 명령 확인 중");

    const baseConversation = activeConversation || createConversation();
    const userMessage = createMessage("user", message, inputSource);
    const optimisticConversation: Conversation = {
      ...baseConversation,
      title: baseConversation.messages.length ? baseConversation.title : generateConversationTitle(message),
      messages: [...baseConversation.messages, userMessage],
      updatedAt: nowIso()
    };

    applyOptimistic(userMessage);

    try {
      const payload: ChatRequestPayload = {
        message,
        messageId: userMessage.id,
        clientMessageId: userMessage.id,
        conversationId: activeConversation?.id?.startsWith("pending-") ? undefined : activeConversation?.id,
        conversation: optimisticConversation,
        settings,
        memories,
        projects,
        teachings,
        automationRecipes
      };
      const fastResponse = await resolveFastCommand(message, baseConversation);
      if (!fastResponse) {
        setProviderStatus("Heather 응답 대기 중");
      }
      const data = fastResponse || (await resolveHeatherResponse(payload));
      if (fastResponse) {
        const persisted = await persistLocalResponse({ message, clientMessageId: userMessage.id, conversationId: payload.conversationId, response: data });
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
        !asksCurrentProviderOrModel(message)
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
      const assistantMessage = createMessage(
        "assistant",
        `지금 응답을 완성하지 못했어요. ${error instanceof Error ? error.message : "알 수 없는 오류"}`
      );
      applyOptimistic(assistantMessage);
      setProviderStatus("오류 발생");
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
    previousConversation: Conversation
  ): Promise<ApiChatResponse | null> {
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
    const response = await fetch("/api/intent/resolve", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
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
      setProviderStatus("이 브라우저는 음성 인식을 지원하지 않습니다.");
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
          ? "마이크 권한이 거부되었습니다. 브라우저/시스템 권한을 확인하세요."
          : `음성 입력 오류${event.error ? `: ${event.error}` : ""}`
      );
    };
    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    setIsListening(true);
    setProviderStatus("음성 입력 중");
    recognition.start();
  }

  function toggleSpeakMessage(messageId: string, text: string) {
    if (!settings.voiceOutputEnabled) {
      setProviderStatus("음성 출력이 꺼져 있습니다.");
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

  return (
    <div className="chat-workspace">
      <aside className="chat-conversation-panel">
        <div className="chat-list-toolbar">
          <button type="button" onClick={handleNewConversation} className="chat-new-conversation">
            <MessageSquarePlus className="h-4 w-4" /> 새 대화
          </button>
          <div className="flex items-center gap-2">
            <label className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="대화 검색"
                className="h-10 w-full rounded-lg border border-line bg-white pl-9 pr-3 text-sm"
              />
            </label>
          </div>
        </div>

        <div className="chat-list-section"><span>최근 대화</span></div>
        <div className="chat-conversation-list heather-scrollbar">
          {filteredConversations.length ? (
            filteredConversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => void selectConversation(conversation.id)}
                className={`chat-conversation-row group ${
                  activeConversationId === conversation.id
                    ? "border-heather-500 bg-white"
                    : "border-line bg-white hover:border-heather-300"
                }`}
              >
                <span className="block truncate text-sm font-semibold">{conversation.title}</span>
                <span className="mt-1 block truncate text-xs text-slate-500">
                  {conversation.preview || "아직 메시지가 없습니다."}
                </span>
                <span className="mt-2 flex items-center justify-between text-xs text-slate-400">
                  <span>{new Date(conversation.updatedAt).toLocaleString("ko-KR")}</span>
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
                    className="grid h-7 w-7 place-items-center rounded-md text-slate-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                    title="대화 삭제"
                    aria-label="대화 삭제"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </span>
                </span>
              </button>
            ))
          ) : (
            <p className="chat-list-empty">{conversationsLoading ? "대화를 불러오는 중입니다." : "검색 결과가 없습니다."}</p>
          )}
          {filteredConversations.length === conversations.length ? <button type="button" className="chat-load-more" onClick={() => void loadMore()}>더 보기</button> : null}
        </div>
      </aside>

      <section className="chat-main-panel">
        <div className="chat-main-header">
          <div className="min-w-0">
            <h3 className="truncate font-semibold">{activeConversation?.title || "새 대화"}</h3>
            <p className="text-sm text-slate-500">Heather와 대화하며 작업을 이어가세요.</p>
          </div>
          <span className="chat-status-dot"><span />Heather</span>
        </div>

        <div className="chat-message-area heather-scrollbar">
          {activeConversation?.messages.length ? <button type="button" className="chat-load-more" onClick={() => void loadOlderMessages()}>이전 메시지 불러오기</button> : null}
          {activeConversation?.messages.length ? (
            activeConversation.messages.map((message) => (
              <article
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                    className={`chat-message max-w-[840px] ${
                    message.role === "user"
                      ? "border-heather-500 bg-heather-700 text-white"
                      : "border-line bg-white text-ink"
                  }`}
                >
                  <div className="whitespace-pre-wrap">{message.content}</div>
                  <div
                    className={`mt-2 flex flex-wrap items-center gap-2 text-xs ${
                      message.role === "user" ? "text-heather-100" : "text-slate-400"
                    }`}
                  >
                    {message.role === "assistant" ? (
                      <span>{new Date(message.createdAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</span>
                    ) : <span>{new Date(message.createdAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</span>}
                    {message.role === "assistant" ? (
                      <button
                        type="button"
                        onClick={() => toggleSpeakMessage(message.id, message.content)}
                        className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-2 py-1 font-semibold text-heather-700 hover:bg-heather-50"
                      >
                        {speakingMessageId === message.id ? (
                          <>
                            <Square className="h-3 w-3" />
                            중지
                          </>
                        ) : (
                          <>
                            <Volume2 className="h-3 w-3" />
                            읽어주기
                          </>
                        )}
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            ))
          ) : (
            <div className="chat-welcome">
              <div className="chat-welcome-icon"><HeatherAvatar settings={settings} size="medium" /></div>
              <h2>안녕하세요, 저는 Heather예요.</h2><p>무엇을 도와드릴까요?</p>
              <div className="chat-suggestions">
                {[["프로젝트 계획 수립", "새 프로젝트의 다음 단계를 정리해줘"], ["문서 요약하기", "이 문서의 핵심 내용을 요약해줘"], ["아이디어 정리", "이 아이디어를 실행 가능한 항목으로 정리해줘"]].map(([label, prompt]) => <button key={label} type="button" onClick={() => setDraft(prompt)}>{label}<span>›</span></button>)}
              </div>
            </div>
          )}
          {isSending && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              헤더가 답변을 정리하고 있습니다.
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="chat-composer-wrap">
          <div className="chat-composer">
            <button
              type="button"
              onClick={toggleListening}
              className={`grid h-12 w-12 shrink-0 place-items-center rounded-lg border ${
                isListening
                  ? "border-coral bg-red-50 text-coral"
                  : "border-line bg-white text-heather-700 hover:bg-heather-50"
              }`}
              title={isListening ? "음성 입력 중지" : "음성 입력"}
              aria-label={isListening ? "음성 입력 중지" : "음성 입력"}
            >
              {isListening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </button>
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
              placeholder="헤더에게 요청할 내용을 입력하세요."
              className="min-h-12 flex-1 resize-none rounded-lg border border-line bg-white px-3 py-3 text-sm leading-5"
              rows={1}
            />
            {isListening ? (
              <span className="self-center rounded-md bg-red-50 px-2 py-1 text-xs font-semibold text-coral">
                녹음 중
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={!draft.trim() || isSending}
              className="grid h-12 w-12 shrink-0 place-items-center rounded-lg border border-heather-700 bg-heather-700 text-white transition hover:bg-heather-900 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-300"
              title="보내기"
              aria-label="보내기"
            >
              {isSending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

async function persistLocalResponse(input: { message: string; clientMessageId: string; conversationId?: string; response: ApiChatResponse }) {
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
