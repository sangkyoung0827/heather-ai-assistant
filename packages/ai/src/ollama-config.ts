import type { HeatherSettings } from "@heather/core";

export const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
export const DEFAULT_OLLAMA_MODEL = "gemma4:latest";
export const FALLBACK_OLLAMA_MODEL = "gemma4:latest";

export function resolveOllamaBaseUrl(settings?: Pick<HeatherSettings, "ollamaBaseUrl">): string {
  const baseUrl =
    process.env.HEATHER_OLLAMA_BASE_URL ||
    process.env.OLLAMA_BASE_URL ||
    settings?.ollamaBaseUrl ||
    DEFAULT_OLLAMA_BASE_URL;

  return baseUrl.replace(/\/$/, "");
}

export function resolveOllamaModel(settings?: Pick<HeatherSettings, "ollamaModel">): string {
  return (
    process.env.HEATHER_OLLAMA_MODEL ||
    process.env.OLLAMA_MODEL ||
    settings?.ollamaModel ||
    DEFAULT_OLLAMA_MODEL
  );
}

export function resolveOllamaFallbackModel(): string {
  return process.env.HEATHER_OLLAMA_FALLBACK_MODEL || FALLBACK_OLLAMA_MODEL;
}
