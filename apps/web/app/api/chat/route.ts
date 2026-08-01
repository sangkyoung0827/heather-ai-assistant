import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import {
  createOllamaProvider,
  resolveOllamaBaseUrl,
  resolveOllamaFallbackModel,
  resolveOllamaModel
} from "@heather/ai";
import { generateConversationTitle, type ChatRequestPayload, type ChatResponsePayload, type MemoryRecord } from "@heather/core";
import { runAgentSearch, type SearchSource } from "../../../lib/agent-runtime-search";
import { resolveModelProfile } from "../../../lib/llm/config";
import { buildLlmMessages } from "../../../lib/llm/messages";
import { generateForModelRole } from "../../../lib/llm/service";
import { enrichChatPayloadFromContext, requireContextUser } from "../../../lib/context-control/server";
import { retrieveDocumentMemoryContext } from "../../../lib/documents/server";
import { DirectCommandRepository } from "../../../lib/intent/direct-command-repository";
import { encodeChatStreamEvent, type ChatProgressEvent, type ChatProgressStage, type ChatProgressStatus, type ChatStreamEvent } from "../../../lib/chat/progress-events";

export const runtime = "nodejs";

interface CachedChatResponse extends ChatResponsePayload {
  provider: string;
  model?: string;
  cached?: boolean;
  search?: { used: boolean; skillId: string; provider: string; cached: boolean; sources: SearchSource[] };
}

type ResolvedChat = { response: CachedChatResponse; usedTools: string[] };
type ProgressReporter = (stage: ChatProgressStage, status: ChatProgressStatus, progress: number, source?: { type?: ChatProgressEvent["source_type"]; name?: string }) => void;

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
        emit({ type: "done", data: { used_tools: resolved.usedTools, duration_ms: Date.now() - startedAt, provider: resolved.response.provider, model: resolved.response.model, cached: resolved.response.cached } });
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
  report?.("intent_analysis", "active", 12);
  const intent = classifyIntent(receivedPayload.message);
  report?.("intent_analysis", "completed", 16);

  report?.("direct_command_check", "active", 20, { type: "direct_command" });
  const directCommands = new DirectCommandRepository();
  let directMatch: Awaited<ReturnType<DirectCommandRepository["find"]>> = null;
  try {
    directMatch = await directCommands.find(receivedPayload.message);
    report?.("direct_command_check", "completed", 24, { type: "direct_command", name: directMatch?.command.canonicalTrigger });
  } catch {
    report?.("direct_command_check", "warning", 24, { type: "direct_command" });
  }
  if (directMatch) {
    usedTools.push("direct_command");
    await directCommands.incrementUsage(directMatch.command.id).catch(() => undefined);
    await directCommands.logIntent("direct_command", receivedPayload.message, directMatch.command.id).catch(() => undefined);
    return {
      response: { message: directMatch.command.response, title: directMatch.command.canonicalTrigger, risk: { level: "low", requiresConfirmation: false, reason: "Saved direct command." }, provider: "direct-command", model: "server" },
      usedTools
    };
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

  if (intent.personal || intent.document) {
    report?.("personal_memory_search", "active", 30, { type: "personal_memory", name: "documents" });
    try {
      const documentMemories = await retrieveDocumentMemoryContext(await requireContextUser(request), "personal", payload.message);
      if (documentMemories.length) {
        payload = { ...payload, memories: [...payload.memories, ...documentMemories] };
        usedTools.push("document_context");
        report?.("personal_memory_search", "completed", 38, { type: "personal_memory", name: `${documentMemories.length} document chunks` });
      } else report?.("personal_memory_search", "skipped", 38, { type: "personal_memory" });
    } catch {
      // Chat remains available if a user is signed out or document storage is unavailable.
      report?.("personal_memory_search", "skipped", 38, { type: "personal_memory" });
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
  const response = await generateHeatherResponse(payload, cacheKey, report);
  report?.("response_composition", "completed", 92, { type: "llm" });
  report?.("response_review", "active", 96, { type: "llm" });
  report?.("response_review", "completed", 99, { type: "llm" });
  usedTools.push("llm");
  return { response, usedTools };
}

async function generateHeatherResponse(payload: ChatRequestPayload, cacheKey: string, report?: ProgressReporter) {
  const baseUrl = resolveOllamaBaseUrl(payload.settings);
  const model = resolveOllamaModel(payload.settings);
  const provider = createOllamaProvider({ baseUrl, model, fallbackModel: resolveOllamaFallbackModel() });
  try {
    const response = await provider.generateChat(payload);
    return cacheIfNeeded(cacheKey, payload, { ...response, provider: "ollama", model: response.model || payload.settings.ollamaModel || model });
  } catch (error) {
    report?.("fallback", "warning", 88, { type: "llm" });
    try {
      const profile = resolveModelProfile("general");
      const fallback = await generateForModelRole("general", { messages: buildLlmMessages(payload, profile.systemPrompt), temperature: profile.temperature, maxTokens: profile.maxTokens });
      return cacheIfNeeded(cacheKey, payload, { message: fallback.content, title: generateConversationTitle(payload.message), risk: { level: "low", requiresConfirmation: false, reason: "텍스트 응답입니다." }, provider: fallback.provider, model: fallback.model });
    } catch {
      throw error;
    }
  }
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

function selectRelevantMemories(message: string, memories: MemoryRecord[]) {
  const terms = message.toLowerCase().match(/[a-z]{3,}|[가-힣]{2,}/g) || [];
  const scored = memories.filter((memory) => !memory.archived).map((memory) => {
    const haystack = `${memory.content} ${memory.tags.join(" ")}`.toLowerCase();
    return { memory, score: terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0) };
  }).filter((item) => item.score > 0).sort((left, right) => right.score - left.score);
  return scored.slice(0, 6).map((item) => item.memory);
}

function cacheIfNeeded(cacheKey: string, payload: ChatRequestPayload, response: CachedChatResponse): CachedChatResponse {
  if (payload.settings.cacheResponses) chatCache.set(cacheKey, response);
  return response;
}

function createCacheKey(payload: ChatRequestPayload): string {
  const compactPayload = {
    message: payload.message.trim().toLowerCase(), tone: payload.settings.tone, aiMode: payload.settings.aiMode, model: resolveOllamaModel(payload.settings),
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
