import type { ChatRequestPayload, ChatResponsePayload } from "@heather/core";

export interface AIProvider {
  id: string;
  generateChat(payload: ChatRequestPayload): Promise<ChatResponsePayload>;
}

export interface AIProviderConfig {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}
