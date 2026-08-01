import assert from "node:assert/strict";
import test from "node:test";
import { encodeChatStreamEvent, progressLabel, readChatProgressStream, type ChatStreamEvent } from "../lib/chat/progress-events";

test("parses progress events split across arbitrary stream chunks", async () => {
  const event: ChatStreamEvent = { type: "progress", data: { id: "one", request_id: "request", stage: "intent_analysis", status: "completed", progress: 16, started_at: "2026-07-30T00:00:00.000Z", completed_at: "2026-07-30T00:00:01.000Z", duration_ms: 1000 } };
  const encoded = encodeChatStreamEvent(event);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const bytes = new TextEncoder().encode(encoded);
      controller.enqueue(bytes.slice(0, 19));
      controller.enqueue(bytes.slice(19));
      controller.close();
    }
  });
  const received: ChatStreamEvent[] = [];
  await readChatProgressStream(new Response(stream), (value) => received.push(value));
  assert.equal(received.length, 1);
  assert.equal(received[0]?.type, "progress");
  assert.equal(received[0]?.type === "progress" && received[0].data.stage, "intent_analysis");
});

test("keeps progress labels free of internal reasoning details", () => {
  assert.equal(progressLabel("personal_memory_search", "ko"), "관련 개인 메모리를 찾고 있습니다.");
  assert.equal(progressLabel("personal_document_search", "ko"), "업로드한 개인 문서 원문을 찾고 있습니다.");
  assert.equal(progressLabel("web_search", "en"), "Searching trusted sources.");
});
