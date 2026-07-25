import { getLlmConfig, isModelProfileConfigured, type LlmConfig } from "../config";
import { LlmProviderError } from "../errors";
import type { LlmProvider, LlmRequest, LlmResponse, ModelProfile } from "../types";

interface NvidiaApiResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

export class NvidiaLlmProvider implements LlmProvider {
  constructor(private readonly config: LlmConfig, private readonly profile: ModelProfile) {}

  async generate(request: LlmRequest): Promise<LlmResponse> {
    if (!isModelProfileConfigured(this.profile, this.config)) {
      throw new LlmProviderError("configuration", false);
    }

    let lastError: LlmProviderError | undefined;
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      try {
        const response = await this.request(request);
        return response;
      } catch (error) {
        lastError = error instanceof LlmProviderError
          ? error
          : new LlmProviderError("upstream", true);
        if (!lastError.retryable || attempt === this.config.maxRetries) throw lastError;
        await delayWithJitter(attempt);
      }
    }

    throw lastError || new LlmProviderError("upstream", false);
  }

  private async request(request: LlmRequest): Promise<LlmResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: this.profile.modelId,
          messages: request.messages,
          temperature: request.temperature,
          max_tokens: request.maxTokens,
          stream: false
        }),
        signal: controller.signal,
        cache: "no-store"
      });

      if (!response.ok) throw errorForStatus(response.status);
      const body = await response.json() as NvidiaApiResponse;
      const content = body.choices?.[0]?.message?.content?.trim();
      if (!content) throw new LlmProviderError("invalid_response", true);
      return { content, provider: "nvidia", model: this.profile.modelId! };
    } catch (error) {
      if (error instanceof LlmProviderError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new LlmProviderError("timeout", true);
      }
      throw new LlmProviderError("upstream", true);
    } finally {
      clearTimeout(timeout);
    }
  }
}

function errorForStatus(status: number): LlmProviderError {
  if (status === 400 || status === 422) return new LlmProviderError("validation", false, status);
  if (status === 401) return new LlmProviderError("authentication", false, status);
  if (status === 403) return new LlmProviderError("permission", false, status);
  if (status === 404) return new LlmProviderError("not_found", false, status);
  if (status === 429) return new LlmProviderError("rate_limit", true, status);
  return new LlmProviderError("upstream", [500, 502, 503, 504].includes(status), status);
}

function delayWithJitter(attempt: number): Promise<void> {
  const baseDelay = 350 * 2 ** attempt;
  const jitter = Math.floor(Math.random() * 200);
  return new Promise((resolve) => setTimeout(resolve, baseDelay + jitter));
}
