import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import {
  createOllamaProvider,
  resolveOllamaBaseUrl,
  resolveOllamaFallbackModel,
  resolveOllamaModel
} from "@heather/ai";
import type { ChatRequestPayload, ChatResponsePayload } from "@heather/core";
import { runAgentSearch, type SearchSource } from "../../../lib/agent-runtime-search";

export const runtime = "nodejs";

interface CachedChatResponse extends ChatResponsePayload {
  provider: string;
  model?: string;
  cached?: boolean;
  search?: { used: boolean; skillId: string; provider: string; cached: boolean; sources: SearchSource[] };
}

declare global {
  // eslint-disable-next-line no-var
  var heatherChatCache: Map<string, CachedChatResponse> | undefined;
}

const chatCache = globalThis.heatherChatCache ?? new Map<string, CachedChatResponse>();
globalThis.heatherChatCache = chatCache;

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as ChatRequestPayload;

    if (!payload.message?.trim()) {
      return NextResponse.json({ error: "Message is required." }, { status: 400 });
    }

    const agentSearch = await runAgentSearch(
      payload.message,
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || null,
      containsHangul(payload.message) ? "ko" : "en"
    );
    if (agentSearch) {
      const citations = agentSearch.sources.map((source, index) => `[${index + 1}] ${source.title}\n${source.url}`).join("\n\n");
      return NextResponse.json({
        message: `${agentSearch.message}\n\n${containsHangul(payload.message) ? "출처" : "Sources"}\n${citations}`,
        provider: "agent-runtime",
        model: "search-synthesis",
        search: { used: true, skillId: agentSearch.skillId, provider: agentSearch.provider, cached: agentSearch.cached, sources: agentSearch.sources }
      });
    }

    const cacheKey = createCacheKey(payload);

    if (payload.settings.cacheResponses) {
      const cached = chatCache.get(cacheKey);
      if (cached) {
        return NextResponse.json({
          ...cached,
          cached: true
        });
      }
    }

    const baseUrl = resolveOllamaBaseUrl(payload.settings);
    const model = resolveOllamaModel(payload.settings);
    const fallbackModel = resolveOllamaFallbackModel();
    const provider = createOllamaProvider({ baseUrl, model, fallbackModel });

    try {
      const response = await provider.generateChat(payload);

      return NextResponse.json(
        cacheIfNeeded(cacheKey, payload, {
          ...response,
          provider: "ollama",
          model: response.model || payload.settings.ollamaModel || model
        })
      );
    } catch (error) {
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : "Ollama chat request failed."
        },
        { status: 503 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown chat route error."
      },
      { status: 500 }
    );
  }
}

function cacheIfNeeded(
  cacheKey: string,
  payload: ChatRequestPayload,
  response: CachedChatResponse
): CachedChatResponse {
  if (payload.settings.cacheResponses) {
    chatCache.set(cacheKey, response);
  }

  return response;
}

function createCacheKey(payload: ChatRequestPayload): string {
  const compactPayload = {
    message: payload.message.trim().toLowerCase(),
    tone: payload.settings.tone,
    aiMode: payload.settings.aiMode,
    model: resolveOllamaModel(payload.settings),
    memories: payload.memories
      .filter((memory) => !memory.archived)
      .slice(0, 6)
      .map((memory) => [memory.type, memory.content.slice(0, 240), memory.tags]),
    projects: payload.projects
      .slice(0, 6)
      .map((project) => [
        project.title,
        project.status,
        project.priority,
        project.next_actions.slice(0, 4)
      ]),
    teachings: (payload.teachings || [])
      .filter((teaching) => teaching.active)
      .slice(0, 6)
      .map((teaching) => [
        teaching.type,
        teaching.title,
        teaching.content.slice(0, 240),
        teaching.tags
      ]),
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
      .map((message) => [message.role, message.content.slice(0, 500)])
  };

  return createHash("sha256").update(JSON.stringify(compactPayload)).digest("hex");
}

function containsHangul(value: string): boolean {
  return /[\u3131-\uD79D]/.test(value);
}
