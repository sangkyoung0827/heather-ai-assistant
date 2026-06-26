import type { ChatRequestPayload, ChatResponsePayload } from "@heather/core";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ProviderChatResponse {
  content: string;
  model?: string;
  raw?: unknown;
}

export interface ChatChunk {
  content: string;
  done?: boolean;
}

export interface AIProvider {
  id: string;
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ProviderChatResponse>;
  streamChat?(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<ChatChunk>;
  generate?(messages: ChatMessage[], options?: ChatOptions): Promise<ProviderChatResponse>;
  isAvailable(): Promise<boolean>;
  generateChat(payload: ChatRequestPayload): Promise<ChatResponsePayload>;
}

export interface AIProviderConfig {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export interface TTSOptions {
  voiceName?: string;
  language?: string;
  rate?: number;
  pitch?: number;
}

export interface TTSProvider {
  id: string;
  speak(text: string, options?: TTSOptions): Promise<void>;
  stop?(): void;
  isAvailable(): Promise<boolean>;
}

export interface STTOptions {
  language?: string;
  interimResults?: boolean;
}

export interface STTProvider {
  id: string;
  transcribe(options?: STTOptions): AsyncIterable<string>;
  stop?(): void;
  isAvailable(): Promise<boolean>;
}
