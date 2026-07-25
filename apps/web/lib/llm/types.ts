export type LlmMessageRole = "system" | "user" | "assistant";

export interface LlmMessage {
  role: LlmMessageRole;
  content: string;
}

export interface LlmRequest {
  messages: LlmMessage[];
  temperature: number;
  maxTokens: number;
}

export interface LlmResponse {
  content: string;
  provider: "nvidia";
  model: string;
}

export interface LlmProvider {
  generate(request: LlmRequest): Promise<LlmResponse>;
}

export type HeatherModelRole = "general" | "research" | "fallback";

export interface ModelProfile {
  role: HeatherModelRole;
  modelId?: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
  supportsReasoning: boolean;
  supportsTools: boolean;
  supportsStreaming: boolean;
}
