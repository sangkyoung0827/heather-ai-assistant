import assert from "node:assert/strict";
import test from "node:test";
import { findIntentCommandMatch, isAutoPromotionEligible, normalizeIntentText } from "../lib/intent/direct-command-engine";
import { DirectCommandRepository } from "../lib/intent/direct-command-repository";

const command = { id: "one", canonicalTrigger: "이번 주 프로젝트 진행 상태를 알려줘", triggers: ["프로젝트 진행 상황 알려줘"], response: "고정 응답", enabled: true };

test("exact, normalized, trigger, and conservative similarity matching", () => {
  assert.equal(findIntentCommandMatch("이번 주 프로젝트 진행 상태를 알려줘", [command])?.kind, "exact");
  assert.equal(findIntentCommandMatch("  헤더, 이번 주 프로젝트 진행 상태를 알려줘! ", [command])?.kind, "normalized");
  assert.equal(findIntentCommandMatch("프로젝트 진행 상황 알려줘", [command])?.kind, "trigger");
  assert.equal(findIntentCommandMatch("이번 주 프로젝트 진행 상태를 알려주", [command])?.kind, "similarity");
  assert.equal(findIntentCommandMatch("프로젝트 삭제해줘", [command]), null);
});

test("disabled commands and unsafe or volatile prompts do not promote", () => {
  assert.equal(findIntentCommandMatch("이번 주 프로젝트 진행 상태를 알려줘", [{ ...command, enabled: false }]), null);
  assert.equal(normalizeIntentText(" Heather,  프로젝트   상태 알려줘! "), "프로젝트 상태 알려줘");
  assert.equal(isAutoPromotionEligible("오늘 날씨 알려줘", "맑음입니다."), false);
  assert.equal(isAutoPromotionEligible("파일을 삭제해줘", "삭제했습니다."), false);
  assert.equal(isAutoPromotionEligible("고정 안내를 알려줘", "이 응답은 고정 안내입니다."), true);
});

test("three successful repeated safe prompts promote one server command", async () => {
  const repository = new DirectCommandRepository();
  const message = `반복 테스트 안내 ${Date.now()}`;
  const response = "반복해서 사용할 수 있는 고정 안내 응답입니다.";
  assert.equal((await repository.recordFallback(message, response, true)).promoted, false);
  assert.equal((await repository.recordFallback(message, response, true)).promoted, false);
  const promoted = await repository.recordFallback(message, response, true);
  assert.equal(promoted.promoted, true);
  if (promoted.command) await repository.remove(promoted.command.id);
});
