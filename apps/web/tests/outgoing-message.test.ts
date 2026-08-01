import assert from "node:assert/strict";
import test from "node:test";
import { createExplicitPersonalMemory, dedupeConsecutiveUserMessages, isRecentDuplicateSubmission } from "../lib/chat/outgoing-message";

test("blocks a rapid identical chat submission", () => {
  assert.equal(isRecentDuplicateSubmission("같은 요청", { fingerprint: "같은 요청", submittedAt: 1_000 }, 2_000), true);
  assert.equal(isRecentDuplicateSubmission("다른 요청", { fingerprint: "같은 요청", submittedAt: 1_000 }, 2_000), false);
});

test("removes only adjacent duplicate user messages created by one submission", () => {
  const messages = [
    { id: "one", role: "user" as const, content: "기억해줘", createdAt: "2026-08-01T00:00:00.000Z" },
    { id: "two", role: "user" as const, content: " 기억해줘 ", createdAt: "2026-08-01T00:00:01.000Z" },
    { id: "three", role: "assistant" as const, content: "알겠습니다", createdAt: "2026-08-01T00:00:02.000Z" }
  ];
  assert.deepEqual(dedupeConsecutiveUserMessages(messages).map((message) => message.id), ["one", "three"]);
});

test("creates a personal-memory record only for explicit personal-memory requests", () => {
  const memory = createExplicitPersonalMemory("이 퀘스트는 개인 메모리에 등록해서 기억해줘.");
  assert.equal(memory?.type, "recurring_task");
  assert.equal(memory?.source, "chat-explicit");
  assert.equal(createExplicitPersonalMemory("오늘 할 일을 정리해줘."), null);
});
