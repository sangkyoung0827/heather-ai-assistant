import { NextResponse } from "next/server";
import { generateConversationTitle } from "@heather/core";
import type { ChatExecutionMetadata, ChatRequestPayload } from "@heather/core";
import { isValidChatPayload } from "../../../../lib/llm/messages";
import { resolveModelProfile } from "../../../../lib/llm/config";
import { generateForModelRole } from "../../../../lib/llm/service";
import { buildResearchContext } from "../../../../lib/research/context";
import { executeResearcherHeatherBasic } from "../../../../lib/chat/heather-basic-engine";
import { parseChatExecutionMode } from "../../../../lib/chat/execution-mode";
import { encodeChatStreamEvent } from "../../../../lib/chat/progress-events";

export const runtime = "nodejs";

type AnonymousResearchResponse = {
  message: string;
  title: string;
  conversationId: string;
  provider?: string;
  model?: string;
  execution?: ChatExecutionMetadata;
};

export async function POST(request: Request) {
  let payload: ChatRequestPayload;
  try {
    payload = await request.json() as ChatRequestPayload;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const validationError = isValidChatPayload(payload);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  if (!request.headers.get("accept")?.includes("text/event-stream")) {
    try {
      return NextResponse.json(await resolveAnonymousResearch(payload));
    } catch {
      return NextResponse.json({ error: "연구 응답을 준비하지 못했습니다." }, { status: 502 });
    }
  }

  const encoder = new TextEncoder();
  const startedAt = Date.now();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      void resolveAnonymousResearch(payload).then((response) => {
        controller.enqueue(encoder.encode(encodeChatStreamEvent({ type: "content_delta", data: { text: response.message } })));
        controller.enqueue(encoder.encode(encodeChatStreamEvent({
          type: "done",
          data: {
            used_tools: [response.provider || "research-llm"],
            duration_ms: Date.now() - startedAt,
            provider: response.provider,
            model: response.model,
            conversation_id: response.conversationId,
            title: response.title,
            execution: response.execution ? serializeExecution(response.execution) : undefined
          }
        })));
      }).catch(() => {
        controller.enqueue(encoder.encode(encodeChatStreamEvent({ type: "error", data: { user_message: "연구 응답을 준비하지 못했습니다.", recoverable: true } })));
      }).finally(() => controller.close());
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}

async function resolveAnonymousResearch(payload: ChatRequestPayload): Promise<AnonymousResearchResponse> {
  const conversationId = usableConversationId(payload.conversationId) ? payload.conversationId! : crypto.randomUUID();
  const requestedMode = parseChatExecutionMode(payload.executionMode) || "ADVANCED_REASONING";

  if (requestedMode === "HEATHER_BASIC") {
    const basic = executeResearcherHeatherBasic(payload.message);
    return {
      message: basic.message,
      title: basic.title || generateConversationTitle(payload.message),
      conversationId,
      provider: "heather-basic",
      model: "browser-anonymous",
      execution: basic.execution
    };
  }

  const profile = resolveModelProfile("research");
  const { messages } = buildResearchContext(payload);
  const response = await generateForModelRole("research", {
    messages,
    temperature: profile.temperature,
    maxTokens: profile.maxTokens
  });
  return {
    message: response.content,
    title: generateConversationTitle(payload.message),
    conversationId,
    provider: response.provider,
    model: response.model,
    execution: {
      requestedExecutionMode: "ADVANCED_REASONING",
      actualExecutionMode: "ADVANCED_REASONING",
      chatType: "research",
      localEngineUsed: false,
      externalLlmUsed: true
    }
  };
}

function usableConversationId(value: string | undefined) {
  return Boolean(value && !value.startsWith("pending-") && value.length <= 160);
}

function serializeExecution(execution: ChatExecutionMetadata) {
  return {
    requested_execution_mode: execution.requestedExecutionMode,
    actual_execution_mode: execution.actualExecutionMode,
    chat_type: execution.chatType,
    local_engine_used: execution.localEngineUsed,
    external_llm_used: execution.externalLlmUsed,
    error_code: execution.errorCode,
    search_used: execution.searchUsed
  };
}
