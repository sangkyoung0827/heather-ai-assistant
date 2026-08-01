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
    { role: "system", content: `${systemPrompt}\n\n${buildMemoryContext(payload)}` },
    ...history,
    { role: "user", content: payload.message.trim() }
  ];
}

/**
 * The hosted fallback model must receive the same bounded personal context as
 * the local provider. Otherwise an uploaded diary can be found by the server
 * but remain invisible to the model that writes the response.
 */
function buildMemoryContext(payload: ChatRequestPayload): string {
  const memories = payload.memories
    .filter((memory) => !memory.archived)
    .slice(0, 6)
    .map((memory) => {
      const isDocument = memory.tags.includes("document");
      const excerpt = memory.content.slice(0, isDocument ? 1_500 : 240);
      return `- ${memory.type}${isDocument ? " (uploaded document excerpt)" : ""} [${memory.source}]: ${excerpt}`;
    })
    .join("\n");
  const hasDocumentExcerpt = payload.memories.some((memory) => !memory.archived && memory.tags.includes("document"));

  return [
    "Retrieved personal context:",
    memories || "- None",
    hasDocumentExcerpt
      ? "The server retrieved the uploaded personal-document excerpts above for this request. Read and analyze those excerpts directly. Do not say that personal memory, diary, or uploaded files are inaccessible. Do not claim facts that are not present in the excerpts."
      : "Only treat the retrieved context above as personal-memory evidence; do not claim to have read an uploaded file when no excerpt is supplied."
  ].join("\n");
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
