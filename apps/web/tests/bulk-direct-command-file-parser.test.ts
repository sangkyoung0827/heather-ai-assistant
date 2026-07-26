import assert from "node:assert/strict";
import test from "node:test";
import { parseBulkDirectCommandFile } from "../lib/intent/bulk-direct-command-file-parser";

const encoder = new TextEncoder();

test("parses JSON while retaining valid items and rejecting unsafe items", async () => {
  const source = JSON.stringify([
    { title: "소개", canonicalTrigger: "헤더가 뭐야?", triggers: ["Heather가 뭐야?"], response: "Heather는 개인 AI 파트너입니다.", tags: ["소개"] },
    { title: "날씨", canonicalTrigger: "오늘 날씨 알려줘", response: "맑음", tags: [] }
  ]);
  const parsed = await parseBulkDirectCommandFile({ fileType: "json", bytes: encoder.encode(source) });
  assert.equal(parsed.inputs[0]?.title, "소개");
  assert.equal(parsed.inputs[1], null);
  assert.equal(parsed.errors.length, 1);
});

test("parses quoted CSV fields and pipe-delimited triggers", async () => {
  const source = "title,canonical_trigger,additional_triggers,response,tags,enabled\n소개,헤더가 뭐야?,Heather 소개해줘|헤더를 설명해줘,\"첫 줄\\n둘째 줄\",소개|Heather,true";
  const parsed = await parseBulkDirectCommandFile({ fileType: "csv", bytes: encoder.encode(source) });
  assert.equal(parsed.inputs[0]?.triggers?.length, 2);
  assert.match(parsed.inputs[0]?.response || "", /둘째 줄/);
});

test("parses the constrained Markdown Q/A format", async () => {
  const source = "## 헤더 소개\n\nQ: 헤더가 뭐야?\nQ: Heather 소개해줘\nA: Heather는 일상과 연구를 함께하는 파트너입니다.\nTags: Heather, 소개";
  const parsed = await parseBulkDirectCommandFile({ fileType: "md", bytes: encoder.encode(source) });
  assert.equal(parsed.inputs[0]?.canonicalTrigger, "헤더가 뭐야?");
  assert.equal(parsed.inputs[0]?.triggers?.[0], "Heather 소개해줘");
});

test("keeps the existing Heather TXT parser path", async () => {
  const source = "HEATHER_DIRECT_COMMAND_FILE_VERSION: 1\n\n=== HEATHER_DIRECT_COMMAND ===\nTITLE: 안내\nTRIGGER: 안내해줘\nRESPONSE:\n고정 안내입니다.\n=== END ===";
  const parsed = await parseBulkDirectCommandFile({ fileType: "txt", bytes: encoder.encode(source) });
  assert.equal(parsed.inputs[0]?.response, "고정 안내입니다.");
});
