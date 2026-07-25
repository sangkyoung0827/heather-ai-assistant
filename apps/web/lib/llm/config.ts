const DEFAULT_NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";

export interface LlmConfig {
  provider: string;
  apiKey?: string;
  baseUrl: string;
  model?: string;
  maxOutputTokens: number;
  timeoutMs: number;
  maxRetries: number;
  temperature: number;
  maxInputChars: number;
  maxHistoryMessages: number;
}

function integerFromEnv(name: string, fallback: number, min: number, max: number): number {
  const value = Number.parseInt(process.env[name] || "", 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function numberFromEnv(name: string, fallback: number, min: number, max: number): number {
  const value = Number.parseFloat(process.env[name] || "");
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function getLlmConfig(): LlmConfig {
  return {
    provider: (process.env.LLM_PROVIDER || "nvidia").trim().toLowerCase(),
    apiKey: process.env.NVIDIA_API_KEY?.trim(),
    baseUrl: (process.env.NVIDIA_API_BASE_URL || DEFAULT_NVIDIA_BASE_URL).replace(/\/$/, ""),
    model: process.env.NVIDIA_MODEL?.trim(),
    maxOutputTokens: integerFromEnv("LLM_MAX_OUTPUT_TOKENS", 1200, 32, 4096),
    timeoutMs: integerFromEnv("LLM_TIMEOUT_MS", 45000, 1000, 120000),
    maxRetries: integerFromEnv("LLM_MAX_RETRIES", 2, 0, 4),
    temperature: numberFromEnv("LLM_TEMPERATURE", 0.3, 0, 1),
    maxInputChars: integerFromEnv("LLM_MAX_INPUT_CHARS", 12000, 500, 50000),
    maxHistoryMessages: integerFromEnv("LLM_MAX_HISTORY_MESSAGES", 12, 0, 30)
  };
}

export function isNvidiaConfigured(config = getLlmConfig()): boolean {
  return config.provider === "nvidia" && Boolean(config.apiKey && config.model);
}
