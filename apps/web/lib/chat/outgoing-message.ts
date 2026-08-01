import type { ConversationMessage, MemoryRecord } from "@heather/core";

const DUPLICATE_WINDOW_MS = 10_000;

export type RecentSubmission = { fingerprint: string; submittedAt: number };

export function isRecentDuplicateSubmission(message: string, previous: RecentSubmission | null, now = Date.now()) {
  if (!previous) return false;
  return fingerprint(message) === previous.fingerprint && now - previous.submittedAt < DUPLICATE_WINDOW_MS;
}

export function dedupeConsecutiveUserMessages(messages: ConversationMessage[]) {
  return messages.reduce<ConversationMessage[]>((items, message) => {
    const previous = items.at(-1);
    if (
      message.role === "user" &&
      previous?.role === "user" &&
      fingerprint(message.content) === fingerprint(previous.content) &&
      Math.abs(new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime()) < DUPLICATE_WINDOW_MS
    ) {
      return items;
    }
    items.push(message);
    return items;
  }, []);
}

export function createExplicitPersonalMemory(message: string): Omit<MemoryRecord, "id" | "created_at" | "updated_at" | "archived"> | null {
  const normalized = message.trim();
  const asksForPersonalMemory = /개인\s*메모리|personal\s+memory/i.test(normalized);
  const asksToStore = /등록|저장|기억|기록|save|remember/i.test(normalized);
  if (!asksForPersonalMemory || !asksToStore) return null;

  const isRecurringTask = /퀘스트|할\s*일|일정|계획|해야\s*할|task|plan/i.test(normalized);
  return {
    type: isRecurringTask ? "recurring_task" : "important_fact",
    content: normalized.slice(0, 6_000),
    source: "chat-explicit",
    confidence: 0.9,
    tags: ["chat", "explicit-memory"]
  };
}

function fingerprint(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}
