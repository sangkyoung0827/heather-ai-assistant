import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createLocalAIProvider, createOllamaProvider, createOpenAIProvider } from "@heather/ai";
import type { ChatRequestPayload, ChatResponsePayload } from "@heather/core";

export const runtime = "nodejs";

interface CachedChatResponse extends ChatResponsePayload {
  provider: string;
  cached?: boolean;
  meteredApiCall?: boolean;
  providerWarning?: string;
}

declare global {
  // eslint-disable-next-line no-var
  var heatherChatCache: Map<string, CachedChatResponse> | undefined;
  // eslint-disable-next-line no-var
  var heatherPaidApiCounters: Map<string, number> | undefined;
}

const chatCache = globalThis.heatherChatCache ?? new Map<string, CachedChatResponse>();
globalThis.heatherChatCache = chatCache;

const paidApiCounters = globalThis.heatherPaidApiCounters ?? new Map<string, number>();
globalThis.heatherPaidApiCounters = paidApiCounters;

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as ChatRequestPayload;

    if (!payload.message?.trim()) {
      return NextResponse.json({ error: "Message is required." }, { status: 400 });
    }

    const localProvider = createLocalAIProvider();
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

    if (payload.settings.aiMode === "local_only") {
      const localResponse = await localProvider.generateChat(payload);
      return NextResponse.json(cacheIfNeeded(cacheKey, payload, {
        ...localResponse,
        provider: "local-heather"
      }));
    }

    const ollamaBaseUrl = process.env.OLLAMA_BASE_URL;
    const ollamaModel = process.env.OLLAMA_MODEL;

    if (ollamaBaseUrl) {
      try {
        const provider = createOllamaProvider({ baseUrl: ollamaBaseUrl, model: ollamaModel });
        const response = await provider.generateChat(payload);
        return NextResponse.json(cacheIfNeeded(cacheKey, payload, {
          ...response,
          provider: "ollama"
        }));
      } catch (error) {
        if (payload.settings.aiMode === "local_model") {
          const localResponse = await localProvider.generateChat(payload);
          return NextResponse.json(cacheIfNeeded(cacheKey, payload, {
            ...localResponse,
            provider: "local-heather",
            providerWarning:
              error instanceof Error ? error.message : "Local model failed, local Heather fallback used."
          }));
        }
      }
    }

    if (payload.settings.aiMode === "local_model") {
      const localResponse = await localProvider.generateChat(payload);
      return NextResponse.json(cacheIfNeeded(cacheKey, payload, {
        ...localResponse,
        provider: "local-heather",
        providerWarning: "OLLAMA_BASE_URL is not configured. Local Heather fallback used."
      }));
    }

    const openAIKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL;
    const paidProviderEnabled = process.env.HEATHER_ALLOW_PAID_API === "true";
    const currentMonth = new Date().toISOString().slice(0, 7);
    const clientMonthCount =
      payload.settings.apiUsageMonth === currentMonth ? payload.settings.apiCallsThisMonth : 0;
    const serverMonthCount = paidApiCounters.get(currentMonth) || 0;
    const monthlyLimit = Math.max(0, payload.settings.monthlyApiCallLimit);
    const paidApiAllowed =
      payload.settings.aiMode === "cloud_allowed" &&
      payload.settings.allowPaidApiCalls &&
      paidProviderEnabled &&
      Boolean(openAIKey) &&
      monthlyLimit > 0 &&
      clientMonthCount < monthlyLimit &&
      serverMonthCount < monthlyLimit;

    if (!paidApiAllowed) {
      const localResponse = await localProvider.generateChat(payload);
      return NextResponse.json(cacheIfNeeded(cacheKey, payload, {
        ...localResponse,
        provider: "local-heather",
        providerWarning: explainPaidApiBlock({
          hasKey: Boolean(openAIKey),
          paidProviderEnabled,
          allowPaidApiCalls: payload.settings.allowPaidApiCalls,
          monthlyLimit,
          clientMonthCount,
          serverMonthCount
        })
      }));
    }

    try {
      const provider = createOpenAIProvider({ apiKey: openAIKey, model });
      const response = await provider.generateChat(payload);
      paidApiCounters.set(currentMonth, serverMonthCount + 1);
      return NextResponse.json(cacheIfNeeded(cacheKey, payload, {
        ...response,
        provider: "openai",
        meteredApiCall: true
      }));
    } catch (error) {
      const localResponse = await localProvider.generateChat(payload);
      return NextResponse.json(cacheIfNeeded(cacheKey, payload, {
        ...localResponse,
        provider: "local-heather",
        providerWarning:
          error instanceof Error ? error.message : "OpenAI provider failed, local fallback used."
      }));
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
    history: payload.conversation?.messages
      .filter((message) => message.role !== "system")
      .slice(-4)
      .map((message) => [message.role, message.content.slice(0, 500)])
  };

  return createHash("sha256").update(JSON.stringify(compactPayload)).digest("hex");
}

function explainPaidApiBlock(params: {
  hasKey: boolean;
  paidProviderEnabled: boolean;
  allowPaidApiCalls: boolean;
  monthlyLimit: number;
  clientMonthCount: number;
  serverMonthCount: number;
}): string {
  if (!params.allowPaidApiCalls) {
    return "Paid API calls are disabled in Heather settings.";
  }

  if (!params.paidProviderEnabled) {
    return "HEATHER_ALLOW_PAID_API is not true, so paid providers are blocked.";
  }

  if (!params.hasKey) {
    return "OPENAI_API_KEY is missing.";
  }

  if (params.monthlyLimit <= 0) {
    return "Monthly paid API limit is 0.";
  }

  if (params.clientMonthCount >= params.monthlyLimit || params.serverMonthCount >= params.monthlyLimit) {
    return "Monthly paid API limit reached.";
  }

  return "Paid API call skipped by cost-control policy.";
}
