import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { generateConversationTitle, type ChatExecutionMetadata, type ChatExecutionMode, type ChatRequestPayload, type ChatResponsePayload, type MemoryRecord } from "@heather/core";
import { runAgentSearch, type SearchSource } from "../../../lib/agent-runtime-search";
import { resolveModelProfile } from "../../../lib/llm/config";
import { buildLlmMessages } from "../../../lib/llm/messages";
import { generateForModelRole } from "../../../lib/llm/service";
import { ContextControlError, enrichChatPayloadFromContext, requireContextUser } from "../../../lib/context-control/server";
import { retrieveDocumentMemoryContext } from "../../../lib/documents/server";
import { executeQuickLinkIntent, parseQuickLinkIntent } from "../../../lib/quick-links/server";
import { DirectCommandRepository } from "../../../lib/intent/direct-command-repository";
import { parsePersonalMemoIntent, runPersonalMemoSkill, type PersonalMemoSkillResult } from "../../../lib/personal-memos/server";
import { encodeChatStreamEvent, type ChatProgressEvent, type ChatProgressStage, type ChatProgressStatus, type ChatStreamEvent } from "../../../lib/chat/progress-events";
import { executePersonalHeatherBasic } from "../../../lib/chat/heather-basic-engine";
import { DEFAULT_CHAT_EXECUTION_MODE, executionModeForStoredValue, isExecutionModeSelectorEnabled, parseChatExecutionMode } from "../../../lib/chat/execution-mode";
import { getPersonalConversationExecutionMode } from "../../../lib/personal-conversation-server";

export const runtime = "nodejs";

interface CachedChatResponse extends ChatResponsePayload {
  provider?: string;
  model?: string;
  cached?: boolean;
  search?: { used: boolean; skillId: string; provider: string; cached: boolean; sources: SearchSource[] };
  quickLinksChanged?: boolean;
  personalMemo?: { id: string; title: string; action: string };
}

type ResolvedChat = { response: CachedChatResponse; usedTools: string[] };
type ProgressReporter = (stage: ChatProgressStage, status: ChatProgressStatus, progress: number, source?: { type?: ChatProgressEvent["source_type"]; name?: string; detail?: string }) => void;

declare global {
  // eslint-disable-next-line no-var
  var heatherChatCache: Map<string, CachedChatResponse> | undefined;
}

const chatCache = globalThis.heatherChatCache ?? new Map<string, CachedChatResponse>();
globalThis.heatherChatCache = chatCache;

export async function POST(request: Request) {
  const receivedPayload = await request.json() as ChatRequestPayload;
  if (!receivedPayload.message?.trim()) return NextResponse.json({ error: "Message is required." }, { status: 400 });
  if (!request.headers.get("accept")?.includes("text/event-stream")) {
    try {
      return NextResponse.json((await resolveHeatherChat(request, receivedPayload)).response);
    } catch (error) {
      return NextResponse.json({ error: safeError(error) }, { status: 503 });
    }
  }
  return createProgressStream(request, receivedPayload);
}

function createProgressStream(request: Request, receivedPayload: ChatRequestPayload) {
  const encoder = new TextEncoder();
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  const stageStarts = new Map<ChatProgressStage, number>();
  let eventIndex = 0;

  return new Response(new ReadableStream({
    async start(controller) {
      const emit = (event: ChatStreamEvent) => controller.enqueue(encoder.encode(encodeChatStreamEvent(event)));
      const report: ProgressReporter = (stage, status, progress, source) => {
        const now = Date.now();
        if (status === "active") stageStarts.set(stage, now);
        const started = stageStarts.get(stage) || now;
        const event: ChatProgressEvent = {
          id: `${requestId}:${stage}:${eventIndex++}`,
          request_id: requestId,
          stage,
          status,
          progress,
          source_type: source?.type,
          source_name: source?.name,
          detail: source?.detail,
          started_at: new Date(started).toISOString(),
          completed_at: status === "active" ? undefined : new Date(now).toISOString(),
          duration_ms: status === "active" ? undefined : now - started
        };
        emit({ type: "progress", data: event });
      };

      try {
        const resolved = await resolveHeatherChat(request, receivedPayload, report);
        if (request.signal.aborted) {
          report("cancelled", "cancelled", 100);
          controller.close();
          return;
        }
        emit({ type: "content_delta", data: { text: resolved.response.message } });
        report("completed", "completed", 100);
        const durationMs = Date.now() - startedAt;
        emit({ type: "done", data: { used_tools: resolved.usedTools, duration_ms: durationMs, provider: resolved.response.provider, model: resolved.response.model, cached: resolved.response.cached, personal_memo: resolved.response.personalMemo, execution: serializeExecution(resolved.response.execution || advancedExecution("general", resolved.response.provider), durationMs) } });
      } catch (error) {
        report("failed", "failed", 100);
        emit({ type: "error", data: { user_message: safeError(error), recoverable: true } });
      } finally {
        controller.close();
      }
    },
    cancel() {
      // The client request was intentionally cancelled. No sensitive request data is retained.
    }
  }), { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}

async function resolveHeatherChat(request: Request, receivedPayload: ChatRequestPayload, report?: ProgressReporter): Promise<ResolvedChat> {
  const usedTools: string[] = [];
  report?.("request_received", "active", 4);
  report?.("request_received", "completed", 8);
  report?.("execution_mode_check", "active", 10);
  const executionMode = await resolvePersonalExecutionMode(request, receivedPayload);
  report?.("execution_mode_check", "completed", 14);
  if (executionMode === "HEATHER_BASIC") {
    report?.("local_engine_status", "active", 40);
    const response = executePersonalHeatherBasic(receivedPayload.message);
    report?.("local_engine_status", "warning", 90, { detail: "로컬 엔진이 아직 연결되지 않았습니다." });
    return { response, usedTools };
  }
  report?.("intent_analysis", "active", 12);
  const intent = classifyIntent(receivedPayload.message);
  const personalDocumentRequest = shouldSearchPersonalDocuments(receivedPayload.message);
  const personalMemoIntent = parsePersonalMemoIntent(receivedPayload.message);
  report?.("intent_analysis", "completed", 16);

  report?.("direct_command_check", "active", 20, { type: "direct_command" });
  const directCommands = new DirectCommandRepository();
  let directMatch: Awaited<ReturnType<DirectCommandRepository["find"]>> = null;
  try {
    directMatch = await directCommands.find(receivedPayload.message);
  } catch {
    report?.("direct_command_check", "warning", 24, { type: "direct_command" });
  }
  if (directMatch && !personalDocumentRequest && !personalMemoIntent) {
    report?.("direct_command_check", "completed", 24, { type: "direct_command", name: directMatch.command.canonicalTrigger });
    usedTools.push("direct_command");
    await directCommands.incrementUsage(directMatch.command.id).catch(() => undefined);
    await directCommands.logIntent("direct_command", receivedPayload.message, directMatch.command.id).catch(() => undefined);
    return {
      response: { message: directMatch.command.response, title: directMatch.command.canonicalTrigger, risk: { level: "low", requiresConfirmation: false, reason: "Saved direct command." }, provider: "direct-command", model: "server" },
      usedTools
    };
  }
  report?.("direct_command_check", directMatch ? "skipped" : "completed", 24, directMatch
    ? { type: "direct_command", detail: "개인 메모리 요청이므로 저장된 고정 응답 대신 원문을 조회합니다." }
    : { type: "direct_command" });

  if (personalMemoIntent) {
    let memoResult: PersonalMemoSkillResult;
    try {
      const result = await runPersonalMemoSkill(await requireContextUser(request), {
        message: receivedPayload.message,
        conversationId: receivedPayload.conversationId || receivedPayload.conversation?.id,
        activeMemoId: receivedPayload.activePersonalMemoId,
        sourceMessageId: receivedPayload.messageId || receivedPayload.clientMessageId,
        onProgress: (stage, status, detail) => report?.(stage, status, stage === "personal_memo_verify" ? 94 : stage === "personal_memo_summary" ? 86 : stage === "personal_memo_write" ? 74 : 48, { type: "personal_memo", detail })
      });
      if (!result) throw new ContextControlError("Personal memo command could not be resolved.", 400);
      memoResult = result;
    } catch (error) {
      if (error instanceof ContextControlError) {
        const korean = containsHangul(receivedPayload.message);
        const message = error.status === 401
          ? korean ? "개인 메모리를 사용하려면 먼저 로그인해주세요." : "Please sign in to use personal memos."
          : error.message.includes("migration")
            ? korean ? "누적형 개인 메모리를 사용하려면 최신 Heather 데이터베이스 migration을 먼저 실행해야 합니다." : "The latest Heather database migration is required for persistent personal memos."
            : korean ? "개인 메모리를 처리하지 못했습니다. 저장 결과를 확인한 뒤 다시 시도해주세요." : "I could not complete that personal memo action. Please try again.";
        return { response: { message, title: generateConversationTitle(receivedPayload.message), risk: { level: "low", requiresConfirmation: false, reason: "Personal memo action could not be completed." }, provider: "personal-memo", model: "server" }, usedTools: ["personal_memo"] };
      }
      throw error;
    }
    usedTools.push("personal_memo");
    return {
      response: {
        message: memoResult.message,
        title: generateConversationTitle(receivedPayload.message),
        risk: { level: memoResult.requiresConfirmation ? "medium" : "low", requiresConfirmation: Boolean(memoResult.requiresConfirmation), reason: "Persistent personal memo action." },
        provider: "personal-memo",
        model: "server",
        personalMemo: memoResult.memo ? { id: memoResult.memo.id, title: memoResult.memo.title, action: memoResult.action } : undefined
      },
      usedTools
    };
  }

  const quickLinkIntent = parseQuickLinkIntent(receivedPayload.message);
  if (quickLinkIntent) {
    report?.("quick_link_parse", "active", 28);
    report?.("quick_link_parse", "completed", 34);
    if (quickLinkIntent.url) {
      report?.("quick_link_url_validation", "active", 38);
      report?.("quick_link_url_validation", "completed", 44);
    } else {
      report?.("quick_link_url_validation", "skipped", 44);
    }
    report?.("quick_link_duplicate_check", "active", 50);
    let quickLink;
    try {
      quickLink = await executeQuickLinkIntent(await requireContextUser(request), receivedPayload.message);
    } catch (error) {
      if (error instanceof ContextControlError) {
        const korean = containsHangul(receivedPayload.message);
        const message = error.status === 401
          ? korean ? "자주 쓰는 사이트를 관리하려면 먼저 로그인해주세요." : "Please sign in to manage Quick Access links."
          : error.status === 400 && /url|address|http|quick access/i.test(error.message)
            ? korean ? "입력한 주소를 확인할 수 없습니다. http 또는 https 주소를 다시 보내주세요." : "Please provide a valid http or https URL."
            : korean ? "자주 쓰는 사이트를 처리하지 못했습니다. 내용을 확인한 뒤 다시 시도해주세요." : "I could not update this Quick Access link. Please check the details and try again.";
        return { response: { message, title: generateConversationTitle(receivedPayload.message), risk: { level: "low", requiresConfirmation: false, reason: "Quick Access action could not be completed." }, provider: "quick-link", model: "server" }, usedTools: ["quick_link_duplicate_check"] };
      }
      throw error;
    }
    if (quickLink) {
      report?.("quick_link_duplicate_check", "completed", 62);
      if (quickLink.changed) {
        report?.("quick_link_write", "active", 70);
        report?.("quick_link_write", "completed", 82);
        report?.("quick_link_verify", "active", 87);
        report?.("quick_link_verify", "completed", 94);
      } else {
        report?.("quick_link_write", "skipped", 82);
        report?.("quick_link_verify", "skipped", 94);
      }
      usedTools.push(...quickLink.usedTools);
      return { response: { message: quickLink.message, title: generateConversationTitle(receivedPayload.message), risk: { level: "low", requiresConfirmation: false, reason: "Personal dashboard Quick Access action." }, provider: "quick-link", model: "server", quickLinksChanged: quickLink.changed }, usedTools };
    }
  }

  let payload = receivedPayload;
  if (intent.personal && payload.memories.length) {
    report?.("personal_memory_search", "active", 30, { type: "personal_memory" });
    const relevantMemories = selectRelevantMemories(payload.message, payload.memories);
    if (relevantMemories.length) {
      payload = { ...payload, memories: relevantMemories };
      usedTools.push("personal_memory");
      report?.("personal_memory_search", "completed", 38, { type: "personal_memory", name: `${relevantMemories.length}` });
    } else {
      report?.("personal_memory_search", "skipped", 38, { type: "personal_memory" });
    }
  }

  if (intent.personal || intent.document || personalDocumentRequest) {
    report?.("personal_document_search", "active", 30, { type: "personal_memory", detail: "로그인한 계정의 업로드 파일 원문을 조회하고 있습니다." });
    try {
      const documentMemories = await retrieveDocumentMemoryContext(await requireContextUser(request), "personal", payload.message);
      if (documentMemories.length) {
        // Document excerpts must be first so the bounded provider context always
        // receives the source material that was found for this request.
        payload = { ...payload, memories: [...documentMemories, ...payload.memories].slice(0, 12) };
        usedTools.push("document_context");
        const sources = [...new Set(documentMemories.map((memory) => memory.source.replace(/^document:\s*/, "").split(" · ")[0]))].join(", ");
        report?.("personal_document_search", "completed", 38, { type: "personal_memory", name: `${documentMemories.length} document chunks`, detail: `${sources}에서 관련 원문 ${documentMemories.length}개를 읽어 답변에 반영합니다.` });
      } else report?.("personal_document_search", "skipped", 38, { type: "personal_memory", detail: "관련 원문을 찾지 못했습니다. 원문이 없는 상태에서 내용을 추측하지 않습니다." });
    } catch {
      // Chat remains available if a user is signed out or document storage is unavailable.
      report?.("personal_document_search", "warning", 38, { type: "personal_memory", detail: "개인 문서 조회를 완료하지 못했습니다. 원문 없이 추측하지 않고 답변을 준비합니다." });
    }
  }

  if (intent.project) {
    report?.("project_context_resolve", "active", 44, { type: "project_context" });
    const enriched = await enrichChatPayloadFromContext(request, payload);
    const projectWasAdded = enriched.projects.length > payload.projects.length;
    payload = enriched;
    if (projectWasAdded) usedTools.push("project_context");
    report?.("project_context_resolve", projectWasAdded ? "completed" : "skipped", 51, { type: "project_context" });
  }

  const cacheKey = createCacheKey(payload);
  if (payload.settings.cacheResponses) {
    const cached = chatCache.get(cacheKey);
    if (cached) {
      report?.("response_composition", "completed", 92, { type: "cache" });
      usedTools.push("cache");
      return { response: { ...cached, cached: true }, usedTools };
    }
  }

  if (intent.currentInfo) {
    const agentSearch = await runAgentSearch(
      payload.message,
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || null,
      containsHangul(payload.message) ? "ko" : "en",
      (stage, status, source) => report?.(stage, status, stage === "web_search_decision" ? 58 : stage === "web_search" ? 72 : 80, { type: "web_search", name: source?.sourceName })
    );
    if (agentSearch) {
      usedTools.push("web_search");
      const citations = agentSearch.sources.map((source, index) => `[${index + 1}] ${source.title}\n${source.url}`).join("\n\n");
      report?.("response_composition", "active", 86, { type: "web_search" });
      const response = { message: `${agentSearch.message}\n\n${containsHangul(payload.message) ? "출처" : "Sources"}\n${citations}`, provider: "agent-runtime", model: "search-synthesis", search: { used: true, skillId: agentSearch.skillId, provider: agentSearch.provider, cached: agentSearch.cached, sources: agentSearch.sources } } as CachedChatResponse;
      report?.("response_composition", "completed", 92, { type: "web_search" });
      report?.("response_review", "completed", 96, { type: "web_search" });
      return { response, usedTools };
    }
  }

  report?.("response_composition", "active", 84, { type: "llm" });
  const response = await generateHeatherResponse(payload, cacheKey);
  report?.("response_composition", "completed", 92, { type: "llm" });
  report?.("response_review", "active", 96, { type: "llm" });
  report?.("response_review", "completed", 99, { type: "llm" });
  usedTools.push("llm");
  return { response, usedTools };
}

async function resolvePersonalExecutionMode(request: Request, payload: ChatRequestPayload): Promise<ChatExecutionMode> {
  if (!isExecutionModeSelectorEnabled()) return DEFAULT_CHAT_EXECUTION_MODE;
  const requested = parseChatExecutionMode(payload.executionMode) || DEFAULT_CHAT_EXECUTION_MODE;
  if (!isPersistedConversationId(payload.conversationId)) {
    if (requested === "HEATHER_BASIC") await requireContextUser(request);
    return requested;
  }
  const context = await requireContextUser(request);
  const stored = await getPersonalConversationExecutionMode(context.user.id, payload.conversationId!);
  if (!stored) throw new ContextControlError("Conversation was not found.", 404);
  return executionModeForStoredValue(stored);
}

function advancedExecution(chatType: "general" | "research", provider?: string): ChatExecutionMetadata {
  return { requestedExecutionMode: "ADVANCED_REASONING", actualExecutionMode: "ADVANCED_REASONING", chatType, localEngineUsed: false, externalLlmUsed: provider === "nvidia" };
}

function serializeExecution(execution: ChatExecutionMetadata, durationMs: number) {
  return { requested_execution_mode: execution.requestedExecutionMode, actual_execution_mode: execution.actualExecutionMode, chat_type: execution.chatType, local_engine_used: execution.localEngineUsed, external_llm_used: execution.externalLlmUsed, error_code: execution.errorCode, search_used: execution.searchUsed };
}

function isPersistedConversationId(value: string | undefined) { return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)); }

async function generateHeatherResponse(payload: ChatRequestPayload, cacheKey: string) {
  const profile = resolveModelProfile("general");
  const response = await generateForModelRole("general", {
    messages: buildLlmMessages(payload, profile.systemPrompt),
    temperature: profile.temperature,
    maxTokens: profile.maxTokens
  });
  return cacheIfNeeded(cacheKey, payload, {
    message: response.content,
    title: generateConversationTitle(payload.message),
    risk: { level: "low", requiresConfirmation: false, reason: "텍스트 응답입니다." },
    provider: response.provider,
    model: response.model
  });
}

function classifyIntent(message: string) {
  const normalized = message.trim().toLowerCase();
  return {
    personal: /\b(i|my|me|prefer|preference|remember|memory|style)\b|내가|나의|내\s|선호|기억|평소|스타일|전에/.test(normalized),
    document: /\b(document|file|journal|diary|upload|paper)\b|문서|파일|일기|기록|업로드|논문/.test(normalized),
    project: /\b(project|status|progress|current state|xudy)\b|프로젝트|진행|현황|상태|현재|자이디|주디|xudy/i.test(normalized),
    currentInfo: /\b(search|find|latest|news|current|today|202[0-9])\b|검색|찾아|최신|최근|뉴스|공고|오늘|현재|[0-9]{4}년/.test(normalized)
  };
}

function shouldSearchPersonalDocuments(message: string) {
  return /\b(my (?:document|file|journal|diary)|uploaded (?:document|file))\b|개인\s*메모리|내\s*(?:파일|문서|일기)|업로드(?:한|한\s*파일|한\s*문서)|일기(?:를|의|파일)?/.test(message.toLocaleLowerCase());
}

function selectRelevantMemories(message: string, memories: MemoryRecord[]) {
  const terms = message.toLowerCase().match(/[a-z]{3,}|[가-힣]{2,}/g) || [];
  const scored = memories.filter((memory) => !memory.archived).map((memory) => {
    const haystack = `${memory.content} ${memory.tags.join(" ")}`.toLowerCase();
    return { memory, score: terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0) };
  }).filter((item) => item.score > 0).sort((left, right) => right.score - left.score);
  return scored.slice(0, 6).map((item) => item.memory);
}

function cacheIfNeeded(cacheKey: string, payload: ChatRequestPayload, response: CachedChatResponse): CachedChatResponse {
  // Uploaded-file context is private and can change independently of the chat
  // history, so never reuse a server response in place of a fresh retrieval.
  if (payload.settings.cacheResponses && !payload.memories.some((memory) => memory.tags.includes("document"))) chatCache.set(cacheKey, response);
  return response;
}

function createCacheKey(payload: ChatRequestPayload): string {
  const compactPayload = {
    message: payload.message.trim().toLowerCase(), tone: payload.settings.tone, aiMode: payload.settings.aiMode, model: resolveModelProfile("general").modelId,
    memories: payload.memories.filter((memory) => !memory.archived).slice(0, 6).map((memory) => [memory.type, memory.content.slice(0, 240), memory.tags]),
    projects: payload.projects.slice(0, 6).map((project) => [project.title, project.status, project.priority, project.next_actions.slice(0, 4)]),
    teachings: (payload.teachings || []).filter((teaching) => teaching.active).slice(0, 6).map((teaching) => [teaching.type, teaching.title, teaching.content.slice(0, 240), teaching.tags]),
    automationRecipes: (payload.automationRecipes || []).filter((recipe) => recipe.enabled).slice(0, 4).map((recipe) => [recipe.title, recipe.trigger.type, recipe.actions.filter((action) => action.enabled).slice(0, 5).map((action) => [action.type, action.label, action.desktopOnly])]),
    history: payload.conversation?.messages.filter((message) => message.role !== "system").slice(-4).map((message) => [message.role, message.content.slice(0, 500)])
  };
  return createHash("sha256").update(JSON.stringify(compactPayload)).digest("hex");
}

function containsHangul(value: string): boolean { return /[\u3131-\uD79D]/.test(value); }
function safeError(error: unknown) { return error instanceof Error && error.message ? "Heather 응답을 준비하지 못했습니다. 잠시 후 다시 시도하세요." : "Heather 응답을 준비하지 못했습니다. 잠시 후 다시 시도하세요."; }
