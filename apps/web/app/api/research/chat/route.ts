import { NextResponse } from "next/server";
import { generateConversationTitle } from "@heather/core";
import type { ChatRequestPayload, ProjectRecord } from "@heather/core";
import { resolveModelProfile } from "../../../../lib/llm/config";
import { LlmProviderError } from "../../../../lib/llm/errors";
import { isValidChatPayload } from "../../../../lib/llm/messages";
import { generateForModelRole } from "../../../../lib/llm/service";
import { buildResearchContext } from "../../../../lib/research/context";
import { createResearchPlan, providerStage } from "../../../../lib/research/progress-plan";
import { ConversationRepository, createConversationTitle } from "../../../../lib/conversations/repository";
import { runMatchedSkill, type RuntimeSkillProgress, type RuntimeSource } from "../../../../lib/skills/agent-runtime";
import { DirectCommandRepository } from "../../../../lib/intent/direct-command-repository";
import { externalDiscoveryUnavailableMessage, formatResearchResponse, verifiedResearchSources, type ResearchSourceReference } from "../../../../lib/research/response";
import { encodeChatStreamEvent, type ChatProgressEvent, type ChatProgressStage, type ChatProgressStatus, type ChatStreamEvent, type HeatherProgressStage } from "../../../../lib/chat/progress-events";

export const runtime = "nodejs";

type ResearchResponse = {
  message: string;
  title: string;
  risk: { level: "low"; requiresConfirmation: false; reason: string };
  mode: "research";
  provider?: string;
  model?: string;
  evidence?: unknown;
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  duplicate?: boolean;
};

type ProgressEmitter = (stage: HeatherProgressStage, status: ChatProgressStatus, extra?: Partial<ChatProgressEvent>) => void;

export async function POST(request: Request) {
  let payload: ChatRequestPayload;
  try {
    payload = await request.json() as ChatRequestPayload;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const validationError = isValidChatPayload(payload);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
  if (!payload.clientMessageId && !payload.messageId) return NextResponse.json({ error: "clientMessageId is required." }, { status: 400 });

  if (!request.headers.get("accept")?.includes("text/event-stream")) {
    try {
      return NextResponse.json(await resolveResearchChat(request, payload));
    } catch (error) {
      return researchErrorResponse(error);
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const requestId = crypto.randomUUID();
      const startedAt = Date.now();
      const plan = createResearchPlan(payload.message, {
        hasResearchMemories: payload.memories.some((memory) => !memory.archived && (memory.type === "project_context" || memory.source.startsWith("research"))),
        hasRelevantProject: findRelevantProject(payload.message, payload.projects) !== null
      });
      const reporter = createProgressReporter(requestId, plan.stages, (event) => controller.enqueue(encoder.encode(encodeChatStreamEvent(event))));
      void (async () => {
        try {
          const data = await resolveResearchChat(request, payload, reporter);
          reporter("completed", "completed", { source_type: "research_analysis" });
          controller.enqueue(encoder.encode(encodeChatStreamEvent({ type: "content_delta", data: { text: data.message } })));
          controller.enqueue(encoder.encode(encodeChatStreamEvent({ type: "done", data: { used_tools: data.provider === "agent-runtime" ? [data.model || "research discovery"] : [data.provider || "research llm"], duration_ms: Date.now() - startedAt, provider: data.provider, model: data.model, conversation_id: data.conversationId, title: data.title } })));
        } catch (error) {
          if (isAbortError(error) || request.signal.aborted) reporter("cancelled", "cancelled", { source_type: "research_analysis" });
          else reporter("failed", "failed", { source_type: "research_analysis" });
          const response = researchErrorResponse(error);
          const body = await response.json() as { error?: string };
          controller.enqueue(encoder.encode(encodeChatStreamEvent({ type: "error", data: { user_message: body.error || "연구 응답을 준비하지 못했습니다.", recoverable: !isAbortError(error) } })));
        } finally {
          controller.close();
        }
      })();
    }
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}

async function resolveResearchChat(request: Request, payload: ChatRequestPayload, emit?: ProgressEmitter): Promise<ResearchResponse> {
  let turn: Awaited<ReturnType<ConversationRepository["beginMessage"]>> | null = null;
  const clientMessageId = payload.clientMessageId || payload.messageId;
  if (!clientMessageId) throw new Error("clientMessageId is required.");

  try {
    emit?.("request_received", "active", { source_type: "research_analysis" });
    const conversations = new ConversationRepository();
    turn = payload.messageAlreadyPersisted && payload.conversationId
      ? await conversations.getStoredTurn({ conversationId: payload.conversationId, type: "research", clientMessageId })
      : await conversations.beginMessage({ conversationId: payload.conversationId, type: "research", title: createConversationTitle(payload.message, "research"), content: payload.message, clientMessageId });
    emit?.("request_received", "completed", { source_type: "research_analysis" });

    if (turn.duplicate) {
      const previous = await conversations.findCompletedAssistant(turn.conversation.id, clientMessageId);
      if (previous) return completedResponse(previous.content, turn.conversation.title, "stored", "conversation-history", turn.conversation.id, turn.userMessage.id, previous.id, true);
      throw new Error("이 메시지는 이미 처리 중입니다. 잠시 후 대화를 다시 열어주세요.");
    }

    emit?.("research_intent_analysis", "active", { source_type: "research_analysis" });
    const relevantProject = findRelevantProject(payload.message, payload.projects);
    emit?.("research_intent_analysis", "completed", { source_type: "research_analysis" });
    if (relevantProject) {
      emit?.("project_context_resolve", "active", { source_type: "research_project", project_id: relevantProject.id, project_name: relevantProject.title });
      emit?.("project_context_resolve", "completed", { source_type: "research_project", project_id: relevantProject.id, project_name: relevantProject.title, detail: relevantProject.title });
    }
    emit?.("scope_definition", "active", { source_type: "research_analysis" });
    emit?.("scope_definition", "completed", { source_type: "research_analysis" });

    const { evidence, messages } = buildResearchContext(payload);
    if (payload.memories.some((memory) => !memory.archived && (memory.type === "project_context" || memory.source.startsWith("research")))) {
      emit?.("research_memory_search", "active", { source_type: "research_memory" });
      emit?.("research_memory_search", "completed", { source_type: "research_memory", source_count: evidence.length, detail: evidence.length ? undefined : "관련된 저장 연구 메모리가 없습니다." });
    }

    emit?.("direct_command_check", "active", { source_type: "direct_command" });
    const directCommands = new DirectCommandRepository();
    const directMatch = await directCommands.find(payload.message);
    emit?.("direct_command_check", "completed", { source_type: "direct_command" });
    if (directMatch) {
      await directCommands.incrementUsage(directMatch.command.id);
      await directCommands.logIntent("direct_command", payload.message, directMatch.command.id);
      const message = formatResearchResponse(directMatch.command.response);
      const assistant = await conversations.appendAssistant({ conversationId: turn.conversation.id, content: message, source: "direct_command", replyTo: clientMessageId, metadata: { provider: "direct-command" } });
      emit?.("response_review", "completed", { source_type: "direct_command" });
      return completedResponse(message, directMatch.command.canonicalTrigger, "direct-command", "server", turn.conversation.id, turn.userMessage.id, assistant.id);
    }

    const runtimePlan = createResearchPlan(payload.message, {
      hasResearchMemories: payload.memories.some((memory) => !memory.archived && (memory.type === "project_context" || memory.source.startsWith("research"))),
      hasRelevantProject: relevantProject !== null
    });
    const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || null;
    const skill = runtimePlan.usesExternalDiscovery
      ? await runMatchedSkill(payload.message, payload.settings.defaultLanguage, accessToken, "research", (progress) => emitRuntimeProgress(emit, progress), request.signal)
      : null;
    const verifiedSources = verifiedResearchSources(skill?.sources || []);
    if (runtimePlan.usesExternalDiscovery && (!skill || !verifiedSources.length)) {
      const message = externalDiscoveryUnavailableMessage(payload.settings.defaultLanguage, runtimePlan.academic);
      emit?.("fallback", "warning", { source_type: "academic_search", detail: "실제 검색 출처를 확인하지 못했습니다. 출처 없는 논문과 DOI는 생성하지 않습니다." });
      emit?.("response_review", "completed", { source_type: "academic_search" });
      const assistant = await conversations.appendAssistant({
        conversationId: turn.conversation.id,
        content: message,
        source: "skill",
        replyTo: clientMessageId,
        metadata: { provider: "agent-runtime", model: "research-discovery-unavailable", discovery_status: "no_verified_sources" }
      });
      return completedResponse(message, generateConversationTitle(payload.message), "agent-runtime", "research-discovery-unavailable", turn.conversation.id, turn.userMessage.id, assistant.id);
    }

    if (skill) {
      emit?.("metadata_normalization", "active", { source_type: "academic_search" });
      const sourceStats = summarizeSources(verifiedSources);
      emit?.("metadata_normalization", "completed", { source_type: "academic_search", ...sourceStats });
      emit?.("deduplication", "completed", { source_type: "academic_search", source_count: sourceStats.source_count, candidate_count: sourceStats.candidate_count, duplicate_count: 0 });
      if (sourceStats.abstract_checked_count) emit?.("abstract_verification", "completed", { source_type: "academic_search", abstract_checked_count: sourceStats.abstract_checked_count, source_count: sourceStats.source_count });
      emit?.("source_relevance_scoring", "completed", { source_type: "academic_search", source_count: sourceStats.source_count, candidate_count: sourceStats.candidate_count });
      emit?.("research_synthesis", "active", { source_type: "research_analysis", source_count: sourceStats.source_count });
      const message = formatResearchResponse(skill.message, verifiedSources as ResearchSourceReference[]);
      emit?.("research_synthesis", "completed", { source_type: "research_analysis", ...sourceStats });
      emit?.("citation_assembly", "completed", { source_type: "academic_search", ...sourceStats });
      emitCandidateStatus(emit, payload.message);
      emit?.("response_review", "completed", { source_type: "research_analysis" });
      const assistant = await conversations.appendAssistant({ conversationId: turn.conversation.id, content: message, source: "skill", replyTo: clientMessageId, metadata: { provider: "agent-runtime", model: skill.skillId } });
      return completedResponse(message, generateConversationTitle(payload.message), "agent-runtime", skill.skillId, turn.conversation.id, turn.userMessage.id, assistant.id);
    }

    emit?.("fallback", "warning", { source_type: "llm", detail: "외부 연구 검색 결과 없이 제공된 대화와 메모리를 사용합니다." });
    emit?.("research_synthesis", "active", { source_type: "llm", source_count: evidence.length });
    const profile = resolveModelProfile("research");
    const response = await generateForModelRole("research", { messages, temperature: profile.temperature, maxTokens: profile.maxTokens });
    const message = formatResearchResponse(response.content);
    emit?.("research_synthesis", "completed", { source_type: "llm", source_count: evidence.length, evidence_level: evidence.length ? "internal_record" : undefined });
    emitCandidateStatus(emit, payload.message);
    emit?.("response_review", "completed", { source_type: "llm" });
    const assistant = await conversations.appendAssistant({ conversationId: turn.conversation.id, content: message, source: "nemotron", replyTo: clientMessageId, metadata: { provider: response.provider, model: response.model } });
    return completedResponse(message, generateConversationTitle(payload.message), response.provider, response.model, turn.conversation.id, turn.userMessage.id, assistant.id, false, evidence);
  } catch (error) {
    const message = userFacingResearchError(error);
    if (turn && !isAbortError(error)) await new ConversationRepository().appendAssistant({ conversationId: turn.conversation.id, content: message, source: "nemotron", status: "failed", replyTo: clientMessageId }).catch(() => undefined);
    throw error;
  }
}

function completedResponse(message: string, title: string, provider: string, model: string, conversationId: string, userMessageId: string, assistantMessageId: string, duplicate = false, evidence?: unknown): ResearchResponse {
  return { message, title, risk: { level: "low", requiresConfirmation: false, reason: "Read-only research analysis." }, mode: "research", provider, model, evidence, conversationId, userMessageId, assistantMessageId, duplicate };
}

function createProgressReporter(requestId: string, plannedStages: HeatherProgressStage[], send: (event: ChatStreamEvent) => void): ProgressEmitter {
  const planned = [...plannedStages];
  const completed = new Set<HeatherProgressStage>();
  return (stage, status, extra = {}) => {
    if (!planned.includes(stage)) planned.push(stage);
    if (status === "completed" || status === "warning" || status === "failed" || status === "cancelled") completed.add(stage);
    const index = planned.indexOf(stage);
    const progress = status === "completed" || status === "warning" ? Math.round((completed.size / planned.length) * 100) : Math.round((Math.max(0, completed.size - (completed.has(stage) ? 1 : 0)) / planned.length) * 100);
    const now = new Date().toISOString();
    send({ type: "progress", data: { id: `${requestId}:${stage}:${status}:${index}:${Date.now()}`, request_id: requestId, stage, status, progress: stage === "completed" && status === "completed" ? 100 : progress, started_at: now, completed_at: status === "active" ? undefined : now, duration_ms: status === "active" ? undefined : 0, ...extra } });
  };
}

function emitRuntimeProgress(emit: ProgressEmitter | undefined, progress: RuntimeSkillProgress) {
  if (!emit) return;
  if (progress.phase === "provider_routing") {
    emit("provider_routing", progress.status, { source_type: "academic_search", detail: progress.skillId, provider_status: progress.status === "warning" ? "warning" : progress.status });
    return;
  }
  if (progress.phase === "cache_check") {
    emit("cache_check", progress.status, { source_type: "cache", detail: progress.cached ? "cached" : undefined, provider_status: progress.status === "warning" ? "warning" : progress.status });
    return;
  }
  const stage = providerStage(progress.provider);
  if (stage && progress.provider) emit(stage, progress.status, { source_type: "academic_search", provider: progress.provider, provider_status: progress.status === "warning" ? "warning" : progress.status, candidate_count: progress.candidateCount });
}

function summarizeSources(sources: RuntimeSource[]) {
  const sourceCount = sources.length;
  const abstractChecked = sources.filter((source) => source.verification_level === "metadata_and_abstract" || source.verification_level === "abstract_checked").length;
  const verified = sources.filter((source) => Boolean(source.doi)).length;
  return { source_count: sourceCount, candidate_count: sourceCount, verified_count: verified, abstract_checked_count: abstractChecked, evidence_level: sourceCount ? evidenceLevel(sources) : undefined };
}

function evidenceLevel(sources: RuntimeSource[]) {
  if (sources.some((source) => source.verification_level === "full_text_checked")) return "full_text_checked";
  if (sources.some((source) => source.verification_level === "metadata_and_abstract" || source.verification_level === "abstract_checked")) return "abstract_checked";
  return "metadata_only";
}

function emitCandidateStatus(emit: ProgressEmitter | undefined, message: string) {
  const normalized = message.toLowerCase();
  if ((normalized.includes("등록") || normalized.includes("register")) && (normalized.includes("논문") || normalized.includes("paper") || normalized.includes("연구자료") || normalized.includes("material"))) emit?.("research_material_candidate_prepare", "warning", { source_type: "research_material", detail: "자동 등록 기능은 아직 연결되지 않았습니다." });
  if ((normalized.includes("메모리") || normalized.includes("memory") || normalized.includes("메모")) && (normalized.includes("저장") || normalized.includes("save") || normalized.includes("후보") || normalized.includes("candidate"))) emit?.("research_memory_candidate_prepare", "warning", { source_type: "research_memory", detail: "승인형 연구 메모리 저장 기능은 아직 연결되지 않았습니다." });
}

function findRelevantProject(message: string, projects: ProjectRecord[]) {
  const normalized = message.toLowerCase();
  return projects.find((project) => normalized.includes(project.title.toLowerCase()) || project.title.toLowerCase().split(/\s+/).some((term) => term.length > 2 && normalized.includes(term))) || null;
}

function researchErrorResponse(error: unknown) {
  const message = userFacingResearchError(error);
  return NextResponse.json({ error: message }, { status: error instanceof LlmProviderError && error.code === "configuration" ? 503 : isAbortError(error) ? 499 : 502 });
}

function userFacingResearchError(error: unknown) {
  if (isAbortError(error)) return "연구 응답 생성을 중단했습니다.";
  if (error instanceof LlmProviderError && error.code === "configuration") return "연구 AI 응답 서비스를 아직 사용할 수 없습니다. 잠시 후 다시 시도하세요.";
  if (error instanceof LlmProviderError && error.code === "timeout") return "연구 AI 응답 시간이 초과되었습니다. 잠시 후 다시 시도하세요.";
  return "연구 AI 응답을 준비하지 못했습니다. 잠시 후 다시 시도하세요.";
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError" || error instanceof Error && error.name === "AbortError";
}
