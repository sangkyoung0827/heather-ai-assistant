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
