import assert from "node:assert/strict";
import test from "node:test";
import type { ChatRequestPayload } from "@heather/core";
import { buildLlmMessages } from "../lib/llm/messages";

test("passes retrieved personal-document excerpts to the hosted LLM fallback", () => {
  const payload = {
    message: "개인 메모리에 있는 일기를 읽고 내가 가장 많이 해온 생각이 뭐야?",
    memories: [{
      id: "document-chunk-1",
      type: "important_fact",
      content: "일기 원문 발췌: 나는 매일 관계와 앞으로의 방향을 오래 고민했다.",
      source: "document: 성찰 일기",
      tags: ["document", "journal", "direct_record"],
      confidence: 0.9,
      created_at: "2026-08-02T00:00:00.000Z",
      updated_at: "2026-08-02T00:00:00.000Z",
      archived: false
    }],
    projects: [],
    teachings: [],
    automationRecipes: [],
    settings: { tone: "analytical" },
    conversation: { messages: [] }
  } as unknown as ChatRequestPayload;

  const messages = buildLlmMessages(payload, "Base system prompt");
  const system = messages[0]?.content || "";

  assert.match(system, /성찰 일기/);
  assert.match(system, /일기 원문 발췌/);
  assert.match(system, /Do not say that personal memory, diary, or uploaded files are inaccessible/);
});
