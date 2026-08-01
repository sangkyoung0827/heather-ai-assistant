import assert from "node:assert/strict";
import test from "node:test";
import { parsePersonalMemoIntent } from "../lib/personal-memos/server";

test("classifies persistent memo creation with a title and initial content", () => {
  const intent = parsePersonalMemoIntent("DHA 핵심 아이디어라는 메모를 만들어줘.\n새만금의 핵심 자산은 생산설비가 아니라 장기간 축적되는 배양 데이터다.");
  assert.equal(intent?.action, "create");
  assert.equal(intent?.title, "DHA 핵심 아이디어");
  assert.match(intent?.content || "", /장기간 축적되는 배양 데이터/);
});

test("classifies a same-memo append without inventing a target title", () => {
  const intent = parsePersonalMemoIntent("설비는 노후화되지만 데이터는 시간이 지날수록 가치가 커진다는 내용도 같은 메모에 추가해줘.");
  assert.equal(intent?.action, "append");
  assert.equal(intent?.title, undefined);
  assert.match(intent?.content || "", /설비는 노후화되지만/);
});

test("requires a memo-specific query rather than capturing ordinary diary analysis", () => {
  assert.equal(parsePersonalMemoIntent("개인 메모리에 등록된 일기를 바탕으로 생각의 변화를 분석해줘."), null);
});

test("classifies explicit destructive memo replacements", () => {
  const intent = parsePersonalMemoIntent("DHA 핵심 아이디어 메모 전체를 이 내용으로 바꿔줘. 새 정리본입니다.");
  assert.equal(intent?.action, "replace");
});
