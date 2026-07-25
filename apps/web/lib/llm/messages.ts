import type { ChatRequestPayload, ConversationMessage } from "@heather/core";
import { getLlmConfig } from "./config";
import type { LlmMessage } from "./types";

const allowedRoles = new Set<ConversationMessage["role"]>(["user", "assistant"]);

export function buildLlmMessages(payload: ChatRequestPayload, systemPrompt: string): LlmMessage[] {
  const config = getLlmConfig();
  const history = (payload.conversation?.messages || [])
    .filter((message) => allowedRoles.has(message.role) && message.content.trim())
    .filter((message) => !(message.role === "user" && message.content.trim() === payload.message.trim()))
    .slice(-config.maxHistoryMessages)
    .map((message) => ({ role: message.role, content: message.content.trim().slice(0, config.maxInputChars) }));

  return [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: payload.message.trim() }
  ];
}

export function isValidChatPayload(payload: ChatRequestPayload): string | null {
  const config = getLlmConfig();
  if (!payload.message || !payload.message.trim()) return "Message is required.";
  if (payload.message.length > config.maxInputChars) {
    return `Message must be ${config.maxInputChars} characters or fewer.`;
  }

  const history = payload.conversation?.messages;
  if (history && (!Array.isArray(history) || history.length > 100)) {
    return "Conversation history is invalid.";
  }
  if (history?.some((message) => !["system", "user", "assistant"].includes(message.role) || typeof message.content !== "string")) {
    return "Conversation history contains an invalid message.";
  }

  return null;
}
