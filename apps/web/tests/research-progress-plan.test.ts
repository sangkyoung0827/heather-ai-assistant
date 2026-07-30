import assert from "node:assert/strict";
import test from "node:test";
import { createResearchPlan, providerStage } from "../lib/research/progress-plan";

test("plans only the actual academic route for an explicit paper request", () => {
  const plan = createResearchPlan("Schizochytrium DHA 논문을 찾아 분석해줘", { hasResearchMemories: true, hasRelevantProject: false });
  assert.equal(plan.academic, true);
  assert.equal(plan.usesExternalDiscovery, true);
  assert.equal(plan.stages.includes("openalex_search"), true);
  assert.equal(plan.stages.includes("research_web_search"), false);
  assert.equal(plan.stages.includes("research_memory_search"), true);
});

test("does not invent provider stages for an internal research question", () => {
  const plan = createResearchPlan("등록한 연구 메모에서 온도 변화를 정리해줘", { hasResearchMemories: true, hasRelevantProject: true });
  assert.equal(plan.usesExternalDiscovery, false);
  assert.equal(plan.stages.includes("provider_routing"), false);
  assert.equal(plan.stages.includes("project_context_resolve"), true);
  assert.equal(providerStage("crossref"), "crossref_search");
});
