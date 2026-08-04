import assert from "node:assert/strict";
import test from "node:test";
import { findIntentCommandMatch, isAutoPromotionEligible, normalizeIntentText } from "../lib/intent/direct-command-engine";
import { DirectCommandRepository } from "../lib/intent/direct-command-repository";
import { RepeatedQueryLearningService } from "../lib/intent/repeated-query-learning";

const command = { id: "one", canonicalTrigger: "이번 주 프로젝트 진행 상태를 알려줘", triggers: ["프로젝트 진행 상황 알려줘"], response: "고정 응답", enabled: true };
const TEST_OWNER_PROMOTION = "11111111-1111-4111-8111-111111111111";
const TEST_OWNER_LEARNING = "22222222-2222-4222-8222-222222222222";
const TEST_OWNER_NEGATIVE = "33333333-3333-4333-8333-333333333333";

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
  const repository = new DirectCommandRepository(TEST_OWNER_PROMOTION);
  const message = `반복 테스트 안내 ${Date.now()}`;
  const response = "반복해서 사용할 수 있는 고정 안내 응답입니다.";
  assert.equal((await repository.recordFallback(message, response, true)).promoted, false);
  assert.equal((await repository.recordFallback(message, response, true)).promoted, false);
  const promoted = await repository.recordFallback(message, response, true);
  assert.equal(promoted.promoted, true);
  if (promoted.command) await repository.remove(promoted.command.id);
});

test("repeated-query learning promotes only a stable, safe fallback response", async () => {
  const repository = new DirectCommandRepository(TEST_OWNER_LEARNING);
  const learning = new RepeatedQueryLearningService(repository);
  const message = `고정 기능 안내를 설명해줘 ${Date.now()}`;
  const response = "이 기능은 반복 작업에 사용할 수 있는 고정 안내를 제공합니다.";
  await learning.recordSuccessfulFallback({ message, response, messageId: "repeat-one" });
  await learning.recordSuccessfulFallback({ message: `${message}!`, response, messageId: "repeat-two" });
  await learning.recordSuccessfulFallback({ message: ` ${message} `, response, messageId: "repeat-three" });
  const created = (await repository.list()).find((item) => item.response === response);
  assert.ok(created);
  if (created) await repository.remove(created.id);
});

test("dynamic and inconsistent responses never auto-promote", async () => {
  const repository = new DirectCommandRepository(TEST_OWNER_NEGATIVE);
  const learning = new RepeatedQueryLearningService(repository);
  await Promise.all(["one", "two", "three"].map((messageId) => learning.recordSuccessfulFallback({ message: "오늘 날씨 알려줘", response: "맑습니다.", messageId })));
  assert.equal((await repository.find("오늘 날씨 알려줘")), null);
  const question = `응답 일관성 테스트 ${Date.now()}`;
  await learning.recordSuccessfulFallback({ message: question, response: "첫 번째 답변입니다.", messageId: "inconsistent-one" });
  await learning.recordSuccessfulFallback({ message: question, response: "완전히 다른 두 번째 답변입니다.", messageId: "inconsistent-two" });
  await learning.recordSuccessfulFallback({ message: question, response: "세 번째 답변도 다릅니다.", messageId: "inconsistent-three" });
  assert.equal((await repository.find(question)), null);
});
