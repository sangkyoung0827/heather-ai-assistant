"use client";

import type {
  ChatExecutionMetadata,
  ChatRequestPayload,
  ChatResponsePayload,
  ChatType
} from "@heather/core";
import { invokeTauriCommand, isTauriRuntime } from "@heather/platform";
import { getSupabaseBrowserClient } from "../supabase-client";

export type EmbeddedOllamaStatus = {
  available: boolean;
  embedded: boolean;
  endpoint: string;
  configuredModel: string;
  model: string;
  models: string[];
  modelsDir: string;
  runtimePath: string;
  importSummary: string;
  message: string;
};

export type EmbeddedOllamaChatResponse = ChatResponsePayload & {
  provider: "embedded-ollama";
  model: string;
  execution: ChatExecutionMetadata;
};

export type PersistedEmbeddedResearchTurn = {
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  title: string;
  duplicate: boolean;
};

export function canUseEmbeddedOllama(): boolean {
  return typeof window !== "undefined" && isTauriRuntime();
}

export async function embeddedOllamaStatus(model: string): Promise<EmbeddedOllamaStatus> {
  if (!canUseEmbeddedOllama()) {
    throw new Error("Heather 내장 기본 엔진은 데스크톱 앱에서만 실행됩니다.");
  }
  return invokeTauriCommand<EmbeddedOllamaStatus>("ollama_status", { model });
}

export async function runEmbeddedOllamaChat(
  payload: ChatRequestPayload,
  chatType: ChatType,
  signal?: AbortSignal
): Promise<EmbeddedOllamaChatResponse> {
  if (!canUseEmbeddedOllama()) {
    throw new Error("Heather 내장 기본 엔진은 데스크톱 앱에서만 실행됩니다.");
  }
  if (signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");

  const startedAt = performance.now();
  const result = await abortable(
    invokeTauriCommand<Omit<EmbeddedOllamaChatResponse, "execution">>("ollama_chat", { payload }),
    signal
  );
  const execution: ChatExecutionMetadata = {
    requestedExecutionMode: "HEATHER_BASIC",
    actualExecutionMode: "HEATHER_BASIC",
    chatType,
    localEngineUsed: true,
    externalLlmUsed: false,
    durationMs: Math.max(0, Math.round(performance.now() - startedAt))
  };

  return {
    ...result,
    provider: "embedded-ollama",
    execution
  };
}

export async function persistEmbeddedResearchTurn(
  payload: ChatRequestPayload,
  response: EmbeddedOllamaChatResponse,
  signal?: AbortSignal
): Promise<PersistedEmbeddedResearchTurn> {
  const session = await getSupabaseBrowserClient()?.auth.getSession();
  const token = session?.data.session?.access_token;
  if (!token) throw new Error("연구원 기본 엔진 대화를 저장하려면 로그인이 필요합니다.");
  const result = await fetch("/api/research/local-turn", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ payload, response }),
    cache: "no-store",
    signal
  });
  const data = await result.json() as PersistedEmbeddedResearchTurn & { error?: string };
  if (!result.ok || data.error) throw new Error(data.error || "로컬 연구 대화를 저장하지 못했습니다.");
  return data;
}

function abortable<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return operation;
  if (signal.aborted) return Promise.reject(new DOMException("The operation was aborted.", "AbortError"));
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new DOMException("The operation was aborted.", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    operation.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      }
    );
  });
}
