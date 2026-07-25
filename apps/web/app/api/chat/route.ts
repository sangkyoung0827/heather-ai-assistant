import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { generateConversationTitle } from "@heather/core";
import type { ChatRequestPayload, ChatResponsePayload } from "@heather/core";
import { getLlmConfig, resolveModelProfile } from "../../../lib/llm/config";
import { LlmProviderError } from "../../../lib/llm/errors";
import { buildLlmMessages, isValidChatPayload } from "../../../lib/llm/messages";
import { generateForModelRole } from "../../../lib/llm/service";

export const runtime = "nodejs";

interface CachedChatResponse extends ChatResponsePayload {
  provider: "nvidia";
  model: string;
  cached?: boolean;
}

declare global {
  // eslint-disable-next-line no-var
  var heatherChatCache: Map<string, CachedChatResponse> | undefined;
}

const chatCache = globalThis.heatherChatCache ?? new Map<string, CachedChatResponse>();
globalThis.heatherChatCache = chatCache;

export async function POST(request: Request) {
  try {
    const payload = await request.json() as ChatRequestPayload;
    const validationError = isValidChatPayload(payload);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

    const cacheKey = createCacheKey(payload);
    if (payload.settings.cacheResponses) {
      const cached = chatCache.get(cacheKey);
      if (cached) return NextResponse.json({ ...cached, cached: true });
    }

    const config = getLlmConfig();
    const profile = resolveModelProfile("general");
    const response = await generateForModelRole("general", {
      messages: buildLlmMessages(payload, profile.systemPrompt),
      temperature: profile.temperature,
      maxTokens: profile.maxTokens
    });
    const result: CachedChatResponse = {
      message: response.content,
      title: generateConversationTitle(payload.message),
      risk: {
        level: "low",
        requiresConfirmation: false,
        reason: "텍스트 응답입니다."
      },
      provider: response.provider,
      model: response.model
    };

    if (payload.settings.cacheResponses) chatCache.set(cacheKey, result);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: publicErrorMessage(error) },
      { status: error instanceof LlmProviderError && error.code === "configuration" ? 503 : 502 }
    );
  }
}

function publicErrorMessage(error: unknown): string {
  if (error instanceof LlmProviderError) {
    if (error.code === "configuration") {
      return "Heather의 AI 응답 서비스를 아직 사용할 수 없습니다. 잠시 후 다시 시도하세요.";
    }
    if (error.code === "timeout") {
      return "AI 응답 시간이 초과되었습니다. 잠시 후 다시 시도하세요.";
    }
  }

  return "AI 응답을 준비하지 못했습니다. 잠시 후 다시 시도하세요.";
}

function createCacheKey(payload: ChatRequestPayload): string {
  const compactPayload = {
    message: payload.message.trim().toLowerCase(),
    tone: payload.settings.tone,
    memories: payload.memories
      .filter((memory) => !memory.archived)
      .slice(0, 3)
      .map((memory) => [memory.type, memory.content.slice(0, 160)]),
    projects: payload.projects
      .slice(0, 3)
      .map((project) => [project.title, project.status, project.priority]),
    teachings: (payload.teachings || [])
      .filter((teaching) => teaching.active)
      .slice(0, 3)
      .map((teaching) => [teaching.type, teaching.title, teaching.content.slice(0, 160)]),
    history: payload.conversation?.messages
      .filter((message) => message.role !== "system")
      .slice(-4)
      .map((message) => [message.role, message.content.slice(0, 280)])
  };

  return createHash("sha256").update(JSON.stringify(compactPayload)).digest("hex");
}
