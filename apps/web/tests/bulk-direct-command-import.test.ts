import assert from "node:assert/strict";
import test from "node:test";
import { parseHeatherDirectCommandFile, previewBulkImport } from "../lib/intent/bulk-direct-command-import";

const source = `HEATHER_DIRECT_COMMAND_FILE_VERSION: 1

=== HEATHER_DIRECT_COMMAND ===
TITLE: 헤더 소개
TRIGGER: 헤더가 뭐야?
TRIGGERS:
- 헤더에 대해 설명해줘
- Heather는 어떤 프로그램이야?
RESPONSE:
Heather는 개인 AI 운영체제입니다.
여러 줄 응답도 지원합니다.
TAGS:
- Heather
- 소개
=== END ===`;

test("parses the Heather TXT v1 format with defaults and multiline responses", () => {
  const parsed = parseHeatherDirectCommandFile(source);
  assert.equal(parsed.errors.length, 0);
  const input = parsed.inputs[0];
  assert.ok(input);
  assert.equal(input.enabled, true);
  assert.equal(input.triggers?.length, 2);
  assert.match(input.response, /여러 줄 응답/);
  assert.equal(input.tags?.length, 2);
});

test("classifies duplicate, merge, and response conflicts without mutating data", () => {
  const input = parseHeatherDirectCommandFile(source).inputs[0]!;
  const existing = [{ id: "one", title: "기존", canonicalTrigger: "헤더가 뭐야?", triggers: ["헤더에 대해 설명해줘"], response: input.response, enabled: true, tags: [], createdBy: "user" as const, createdAt: "", updatedAt: "", usageCount: 0, lastUsedAt: null }];
  assert.equal(previewBulkImport([input], existing).summary.merge, 1);
  assert.equal(previewBulkImport([{ ...input, response: "다른 응답" }], existing).summary.error, 1);
  assert.equal(previewBulkImport([{ ...input, triggers: [] }], existing).summary.duplicate, 1);
});

test("rejects unsupported versions and malformed required fields", () => {
  assert.throws(() => parseHeatherDirectCommandFile("HEATHER_DIRECT_COMMAND_FILE_VERSION: 2"));
  const broken = parseHeatherDirectCommandFile(`HEATHER_DIRECT_COMMAND_FILE_VERSION: 1
=== HEATHER_DIRECT_COMMAND ===
TITLE: 누락 테스트
TRIGGER: 질문
=== END ===`);
  assert.equal(broken.errors.length, 1);
  const invalidEnabled = parseHeatherDirectCommandFile(`HEATHER_DIRECT_COMMAND_FILE_VERSION: 1
=== HEATHER_DIRECT_COMMAND ===
TITLE: 상태
TRIGGER: 상태 알려줘
RESPONSE:
정상
ENABLED: yes
=== END ===`);
  assert.equal(invalidEnabled.errors.length, 1);
});

test("enforces command count and detects internal trigger conflicts", () => {
  const block = `=== HEATHER_DIRECT_COMMAND ===\nTITLE: 명령\nTRIGGER: 질문\nRESPONSE:\n응답\n=== END ===`;
  assert.throws(() => parseHeatherDirectCommandFile(`HEATHER_DIRECT_COMMAND_FILE_VERSION: 1\n${Array.from({ length: 1001 }, () => block).join("\n")}`));
  const first = parseHeatherDirectCommandFile(source).inputs[0]!;
  assert.equal(previewBulkImport([first, { ...first, response: "다른 응답" }], []).summary.error, 1);
});
