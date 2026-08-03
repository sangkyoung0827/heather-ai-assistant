import assert from "node:assert/strict";
import test from "node:test";
import {
  DirectCommandSkillError,
  executeDirectCommandAction,
  parseDirectCommandSkillDirective
} from "../lib/intent/direct-command-skill-executor";

const staticCommand = {
  id: "static",
  canonicalTrigger: "고정 안내 보여줘",
  triggers: [],
  response: "고정 응답입니다.",
  enabled: true
};

const searchCommand = {
  id: "search",
  canonicalTrigger: "헤더 최신 정보 찾아줘",
  triggers: [],
  response: "@skill general_web_search {\"query\":\"$input\",\"locale\":\"ko\"}",
  enabled: true
};

test("ordinary direct commands remain fixed responses", async () => {
  const result = await executeDirectCommandAction({
    request: new Request("https://heather.local/api/chat"),
    command: staticCommand,
    message: "고정 안내 보여줘",
    chatType: "personal"
  });
  assert.equal(result.message, "고정 응답입니다.");
  assert.equal(result.provider, "direct-command");
  assert.deepEqual(result.usedTools, ["direct_command"]);
});

test("skill directives are parsed conservatively", () => {
  assert.equal(parseDirectCommandSkillDirective("고정 응답"), null);
  assert.deepEqual(parseDirectCommandSkillDirective("@skill general_web_search"), {
    skillId: "general_web_search",
    parameters: {}
  });
  assert.throws(
    () => parseDirectCommandSkillDirective("@skill arbitrary_shell"),
    (error) => error instanceof DirectCommandSkillError && error.code === "SKILL_NOT_ALLOWED"
  );
  assert.throws(
    () => parseDirectCommandSkillDirective("@skill general_web_search not-json"),
    (error) => error instanceof DirectCommandSkillError && error.code === "INVALID_SKILL_PARAMETERS"
  );
});

test("an allowlisted skill executes through Agent Runtime and returns verified sources", async () => {
  const previousUrl = process.env.AGENT_RUNTIME_URL;
  process.env.AGENT_RUNTIME_URL = "http://127.0.0.1:8123";
  let receivedBody: Record<string, unknown> | null = null;
  const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    receivedBody = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>;
    return new Response(JSON.stringify({
      status: "completed",
      skill_id: "general_web_search",
      result: {
        message: "검색 결과입니다.",
        provider: "searxng",
        cached: false,
        sources: [
          { title: "검증된 자료", url: "https://example.com/source", snippet: "요약" },
          { title: "잘못된 주소", url: "javascript:alert(1)" }
        ]
      }
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  try {
    const result = await executeDirectCommandAction({
      request: new Request("https://heather.local/api/chat", { headers: { Authorization: "Bearer test-token" } }),
      command: searchCommand,
      message: "헤더 최신 정보 찾아줘",
      chatType: "personal",
      fetchImpl
    });
    assert.equal(receivedBody?.skill_id, "general_web_search");
    assert.equal(receivedBody?.query, "헤더 최신 정보 찾아줘");
    assert.equal(result.provider, "agent-runtime");
    assert.equal(result.skillId, "general_web_search");
    assert.equal(result.sources?.length, 1);
    assert.match(result.message, /검색 결과입니다/);
    assert.match(result.message, /https:\/\/example.com\/source/);
  } finally {
    if (previousUrl === undefined) delete process.env.AGENT_RUNTIME_URL;
    else process.env.AGENT_RUNTIME_URL = previousUrl;
  }
});

test("skills cannot cross personal and research scopes", async () => {
  const previousUrl = process.env.AGENT_RUNTIME_URL;
  process.env.AGENT_RUNTIME_URL = "http://127.0.0.1:8123";
  try {
    await assert.rejects(
      executeDirectCommandAction({
        request: new Request("https://heather.local/api/research/chat", { headers: { Authorization: "Bearer test-token" } }),
        command: searchCommand,
        message: "헤더 최신 정보 찾아줘",
        chatType: "research",
        fetchImpl: (async () => new Response("{}")) as typeof fetch
      }),
      (error) => error instanceof DirectCommandSkillError && error.code === "SKILL_SCOPE_MISMATCH"
    );
  } finally {
    if (previousUrl === undefined) delete process.env.AGENT_RUNTIME_URL;
    else process.env.AGENT_RUNTIME_URL = previousUrl;
  }
});
