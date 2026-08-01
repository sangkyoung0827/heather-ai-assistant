import assert from "node:assert/strict";
import test from "node:test";
import { executePersonalHeatherBasic, executeResearcherHeatherBasic, LOCAL_ENGINE_NOT_CONFIGURED } from "../lib/chat/heather-basic-engine";
import { DEFAULT_CHAT_EXECUTION_MODE, executionModeForStoredValue, parseChatExecutionMode } from "../lib/chat/execution-mode";
import { NVIDIA_GENERAL_MODEL, NVIDIA_RESEARCH_MODEL, resolveModelProfile } from "../lib/llm/config";

test("execution mode accepts only the two supported values and defaults legacy data to advanced reasoning", () => {
  assert.equal(parseChatExecutionMode("HEATHER_BASIC"), "HEATHER_BASIC");
  assert.equal(parseChatExecutionMode("ADVANCED_REASONING"), "ADVANCED_REASONING");
  assert.equal(parseChatExecutionMode("AUTO"), null);
  assert.equal(executionModeForStoredValue(undefined), DEFAULT_CHAT_EXECUTION_MODE);
});

test("Heather basic engine does not claim a local or external model was used", () => {
  for (const response of [executePersonalHeatherBasic("기본 엔진으로 답해줘"), executeResearcherHeatherBasic("Use the basic engine")]) {
    assert.equal(response.provider, undefined);
    assert.equal(response.model, undefined);
    assert.equal(response.execution?.actualExecutionMode, "HEATHER_BASIC");
    assert.equal(response.execution?.localEngineUsed, false);
    assert.equal(response.execution?.externalLlmUsed, false);
    assert.equal(response.execution?.errorCode, LOCAL_ENGINE_NOT_CONFIGURED);
  }
});

test("advanced reasoning keeps the established personal and research model mapping", () => {
  assert.equal(resolveModelProfile("general").modelId, NVIDIA_GENERAL_MODEL);
  assert.equal(resolveModelProfile("research").modelId, NVIDIA_RESEARCH_MODEL);
});
