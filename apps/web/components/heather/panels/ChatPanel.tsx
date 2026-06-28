"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
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
  createLocalHeatherResponse,
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
import type { MediaActionResult } from "@heather/platform";

interface ChatPanelProps {
  conversations: Conversation[];
  memories: MemoryRecord[];
  projects: ProjectRecord[];
  teachings: TeachingRecord[];
  automationRecipes: AutomationRecipe[];
  settings: HeatherSettings;
  onSaveConversation: (conversation: Conversation) => Promise<void>;
  onDeleteConversation: (id: string) => Promise<void>;
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
  conversations,
  memories,
  projects,
  teachings,
  automationRecipes,
  settings,
  onSaveConversation,
  onDeleteConversation,
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
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceBaseDraftRef = useRef("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const sendLockRef = useRef(false);

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

  useEffect(() => {
    if (!activeConversationId && conversations[0]) {
      setActiveConversationId(conversations[0].id);
    }
  }, [activeConversationId, conversations]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [activeConversation?.messages.length, isSending]);

  useEffect(() => {
    return () => {
      stopHeatherSpeech();
    };
  }, []);

  async function handleNewConversation() {
    const conversation = createConversation();
    await onSaveConversation(conversation);
    setActiveConversationId(conversation.id);
    setDraft("");
  }

  async function handleDeleteConversation(id: string) {
    if (!window.confirm("이 대화를 삭제할까요?")) return;

    await onDeleteConversation(id);
    if (activeConversationId === id) {
      setActiveConversationId(null);
    }
  }

  async function handleSend() {
    const message = draft.trim();
    if (!message || isSending || sendLockRef.current) return;

    sendLockRef.current = true;
    setDraft("");
    setIsSending(true);
    setProviderStatus("헤더가 맥락을 확인하는 중");

    const baseConversation = activeConversation || createConversation();
    const userMessage = createMessage("user", message, inputSource);
    const optimisticConversation: Conversation = {
      ...baseConversation,
      title: baseConversation.messages.length ? baseConversation.title : generateConversationTitle(message),
      messages: [...baseConversation.messages, userMessage],
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
      const data = (await resolveImmediateDesktopAction(message)) || (await resolveHeatherResponse(payload));

      const assistantMessage = createMessage("assistant", data.message, "text", {
        provider: data.provider,
        model: data.model
      });
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
      setProviderStatus(formatProviderStatus(data));

      if (data.meteredApiCall) {
        await onSaveSettings(incrementPaidApiCount(settings));
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
      await onSaveConversation({
        ...optimisticConversation,
        messages: [...optimisticConversation.messages, assistantMessage],
        updatedAt: nowIso()
      });
      setProviderStatus("오류 발생");
    } finally {
      sendLockRef.current = false;
      setInputSource("text");
      setIsSending(false);
    }
  }

  async function resolveHeatherResponse(payload: ChatRequestPayload): Promise<ApiChatResponse> {
    if (payload.settings.aiMode === "local_only") {
      return {
        ...createLocalHeatherResponse(payload),
        provider: "browser-local"
      };
    }

    const providerModelStatusQuestion = asksCurrentProviderOrModel(payload.message);
    const cached =
      payload.settings.cacheResponses && !providerModelStatusQuestion
        ? readCachedResponse(payload)
        : null;
    if (cached) {
      return {
        ...cached,
        cached: true
      };
    }

    const data = isTauriRuntime()
      ? await invokeTauriCommand<ApiChatResponse>("ollama_chat", { payload })
      : await requestHeatherApi(payload);

    return data;
  }

  async function resolveImmediateDesktopAction(message: string): Promise<ApiChatResponse | null> {
    if (!isTauriRuntime()) return null;

    const musicQuery = extractYouTubeMusicPlayQuery(message);
    if (musicQuery) {
      const result = await invokeTauriCommand<MediaActionResult>("play_youtube_music", {
        query: musicQuery
      });
      return {
        message: result.message,
        title: generateConversationTitle(message),
        risk: {
          level: "low",
          requiresConfirmation: false,
          reason: "허용된 YouTube Music 데스크톱 액션입니다."
        },
        provider: "desktop",
        model: "tauri-action"
      };
    }

    return null;
  }

  async function requestHeatherApi(payload: ChatRequestPayload): Promise<ApiChatResponse> {
    const response = await fetch("/api/chat", {
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
    <div className="grid min-h-[calc(100vh-10rem)] gap-4 lg:grid-cols-[320px_1fr]">
      <aside className="flex min-h-0 flex-col rounded-lg border border-line bg-slate-50">
        <div className="border-b border-line p-3">
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
            <button
              type="button"
              onClick={handleNewConversation}
              className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-white text-heather-700 hover:bg-heather-50"
              title="새 대화"
              aria-label="새 대화"
            >
              <MessageSquarePlus className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 heather-scrollbar">
          {filteredConversations.length ? (
            filteredConversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => setActiveConversationId(conversation.id)}
                className={`group w-full rounded-lg border p-3 text-left transition ${
                  activeConversationId === conversation.id
                    ? "border-heather-500 bg-white"
                    : "border-line bg-white hover:border-heather-300"
                }`}
              >
                <span className="block truncate text-sm font-semibold">{conversation.title}</span>
                <span className="mt-1 block truncate text-xs text-slate-500">
                  {conversation.messages.at(-1)?.content || "아직 메시지가 없습니다."}
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
            <p className="p-4 text-sm text-slate-500">검색 결과가 없습니다.</p>
          )}
        </div>
      </aside>

      <section className="flex min-h-[640px] min-w-0 flex-col rounded-lg border border-line bg-white">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div className="min-w-0">
            <h3 className="truncate font-semibold">{activeConversation?.title || "새 대화"}</h3>
            <p className="text-sm text-slate-500">{providerStatus}</p>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Volume2 className="h-4 w-4 text-heather-700" />
            <span>{settings.voiceOutputEnabled ? "TTS on" : "TTS off"}</span>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-slate-50 p-4 heather-scrollbar">
          {activeConversation?.messages.length ? (
            activeConversation.messages.map((message) => (
              <article
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[840px] rounded-lg border px-4 py-3 text-sm leading-6 ${
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
                      <>
                        <span>{formatAssistantMetadata(message)}</span>
                        <span>
                          {new Date(message.createdAt).toLocaleTimeString("ko-KR", {
                            hour: "2-digit",
                            minute: "2-digit"
                          })}
                        </span>
                      </>
                    ) : (
                      <span>
                        {message.source === "voice" ? "voice" : "text"} ·{" "}
                        {new Date(message.createdAt).toLocaleTimeString("ko-KR", {
                          hour: "2-digit",
                          minute: "2-digit"
                        })}
                      </span>
                    )}
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
            <div className="flex h-full min-h-[360px] items-center justify-center text-center">
              <div>
                <p className="font-semibold">헤더라고 부르면 시작할게요.</p>
                <p className="mt-2 text-sm text-slate-500">
                  프로젝트, 일정, 인간관계 분석, 문서 초안, 오늘의 우선순위를 물어보세요.
                </p>
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

        <div className="border-t border-line p-3">
          <div className="flex gap-2">
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

function formatProviderStatus(data: ApiChatResponse): string {
  if (data.cached) {
    return "로컬 캐시 응답";
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

function formatAssistantMetadata(message: Conversation["messages"][number]): string {
  return [message.provider, message.model].filter(Boolean).join(" · ") || "assistant";
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

function asksCurrentProviderOrModel(message: string): boolean {
  const normalized = message.toLowerCase();
  const asksRuntime =
    /모델|model|provider|프로바이더|제공자|엔진|backend|백엔드|api|런타임|runtime|상태|status|로컬\s*모델/.test(
      normalized
    );
  const asksCurrent = /현재|지금|사용\s*중|쓰고|뭐야|무엇|알려|확인|check|current/.test(normalized);

  return asksCurrent && asksRuntime;
}

function extractYouTubeMusicPlayQuery(message: string): string | null {
  const normalized = message.toLowerCase();
  const asksYouTubeMusic = /유튜브\s*뮤직|youtube\s*music/.test(normalized);
  const asksPlayback = /재생|틀어|들려|play/.test(normalized);
  if (!asksYouTubeMusic || !asksPlayback) return null;

  const query = message
    .replace(/^\s*헤더[,\s]*/i, "")
    .replace(/유튜브\s*뮤직(에서|으로)?/gi, "")
    .replace(/youtube\s*music/gi, "")
    .replace(/재생해줘|재생해 줘|재생|틀어줘|틀어 줘|틀어|들려줘|들려 줘|들려|play/gi, "")
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "");

  return query || null;
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
