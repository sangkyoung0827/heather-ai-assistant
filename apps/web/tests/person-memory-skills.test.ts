import assert from "node:assert/strict";
import test from "node:test";
import {
  DirectCommandSkillError,
  executeDirectCommandAction,
  parseDirectCommandSkillDirective
} from "../lib/intent/direct-command-skill-executor";
import { extractPersonSections } from "../lib/person-memory/skills";

const profileCommand = {
  id: "person-profile",
  canonicalTrigger: "문승주 관련 정보 모두 보여줘",
  triggers: ["승주 정보 보여줘"],
  response: "@skill person_memory.get_full_profile {\"person_alias\":\"문승주\",\"aliases\":[\"승주\",\"Moon\",\"승주형\"],\"memo_title\":\"주변인 프로파일링 보고서\",\"locale\":\"ko\"}",
  enabled: true
};

test("extracts only the matching person section from a markdown report", () => {
  const report = [
    "# Ⅲ. 한승재 / Han",
    "한승재에 관한 기록입니다.",
    "",
    "# Ⅵ. 문승주 / Moon",
    "## 1. 학업 상태",
    "문승주는 학사경고 3회가 누적된 상태다.",
    "",
    "## 2. 음주",
    "Moon은 음주 빈도가 높다고 기록됐다.",
    "",
    "# Ⅶ. A",
    "A에 관한 기록입니다."
  ].join("\n");

  const sections = extractPersonSections(report, ["문승주", "Moon", "승주"]);
  assert.equal(sections.length, 1);
  assert.match(sections[0], /문승주는 학사경고 3회/);
  assert.match(sections[0], /Moon은 음주 빈도/);
  assert.doesNotMatch(sections[0], /한승재에 관한 기록/);
  assert.doesNotMatch(sections[0], /A에 관한 기록/);
});

test("person memory directives are accepted by the allowlist", () => {
  assert.deepEqual(parseDirectCommandSkillDirective(profileCommand.response), {
    skillId: "person_memory.get_full_profile",
    parameters: {
      person_alias: "문승주",
      aliases: ["승주", "Moon", "승주형"],
      memo_title: "주변인 프로파일링 보고서",
      locale: "ko"
    }
  });
});

test("person memory skills execute internally without Agent Runtime", async () => {
  const previousUrl = process.env.AGENT_RUNTIME_URL;
  delete process.env.AGENT_RUNTIME_URL;
  let called = false;
  try {
    const result = await executeDirectCommandAction({
      request: new Request("https://heather.local/api/chat", { headers: { Authorization: "Bearer test-token" } }),
      command: profileCommand,
      message: "문승주 관련 정보 모두 보여줘",
      chatType: "personal",
      personSkillExecutor: async (input) => {
        called = true;
        assert.equal(input.skillId, "person_memory.get_full_profile");
        assert.equal(input.parameters.person_alias, "문승주");
        return {
          message: "문승주 인물 프로필",
          model: "person-memory:person_memory.get_full_profile",
          usedTools: ["direct_command", "person_memory", input.skillId]
        };
      }
    });
    assert.equal(called, true);
    assert.equal(result.provider, "person-memory");
    assert.equal(result.skillId, "person_memory.get_full_profile");
    assert.equal(result.message, "문승주 인물 프로필");
  } finally {
    if (previousUrl === undefined) delete process.env.AGENT_RUNTIME_URL;
    else process.env.AGENT_RUNTIME_URL = previousUrl;
  }
});

test("person memory skills cannot run in research chat", async () => {
  await assert.rejects(
    executeDirectCommandAction({
      request: new Request("https://heather.local/api/research/chat", { headers: { Authorization: "Bearer test-token" } }),
      command: profileCommand,
      message: "문승주 관련 정보 모두 보여줘",
      chatType: "research",
      personSkillExecutor: async () => ({ message: "", model: "", usedTools: [] })
    }),
    (error) => error instanceof DirectCommandSkillError && error.code === "SKILL_SCOPE_MISMATCH"
  );
});
