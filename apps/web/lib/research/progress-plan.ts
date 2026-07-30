import type { ChatProgressStage, HeatherProgressStage } from "../chat/progress-events";

export type ResearchPlan = {
  stages: HeatherProgressStage[];
  academic: boolean;
  usesExternalDiscovery: boolean;
  requestsMaterialCandidate: boolean;
  requestsMemoryCandidate: boolean;
};

const ACADEMIC_TERMS = ["paper", "papers", "doi", "citation", "journal", "study", "논문", "인용", "학술", "연구 결과"];
const DISCOVERY_TERMS = ["search", "find", "latest", "source", "sources", "paper", "papers", "doi", "citation", "검색", "찾아", "최신", "출처", "논문", "인용"];
const BIOLOGY_TERMS = ["pubmed", "clinical", "medical", "medicine", "gene", "protein", "cancer", "disease", "biolog", "의학", "임상", "유전자", "단백질", "질병", "실험"];

export function createResearchPlan(message: string, options: { hasResearchMemories: boolean; hasRelevantProject: boolean }): ResearchPlan {
  const normalized = message.toLowerCase();
  const academic = containsAny(normalized, ACADEMIC_TERMS);
  const usesExternalDiscovery = containsAny(normalized, DISCOVERY_TERMS);
  const stages: HeatherProgressStage[] = ["request_received", "research_intent_analysis"];

  if (options.hasRelevantProject) stages.push("project_context_resolve");
  stages.push("scope_definition");
  if (options.hasResearchMemories) stages.push("research_memory_search");

  if (usesExternalDiscovery) {
    stages.push("query_generation", "provider_routing", "cache_check");
    stages.push(academic ? expectedAcademicProviderStage(normalized) : "research_web_search");
    stages.push("metadata_normalization", "deduplication", "source_relevance_scoring");
  }

  stages.push("research_synthesis", "citation_assembly", "response_review");
  if (isMaterialCandidateRequest(normalized)) stages.push("research_material_candidate_prepare");
  if (isMemoryCandidateRequest(normalized)) stages.push("research_memory_candidate_prepare");
  stages.push("completed");

  return {
    stages: unique(stages),
    academic,
    usesExternalDiscovery,
    requestsMaterialCandidate: isMaterialCandidateRequest(normalized),
    requestsMemoryCandidate: isMemoryCandidateRequest(normalized)
  };
}

export function expectedAcademicProviderStage(message: string): Extract<HeatherProgressStage, "openalex_search" | "europe_pmc_search"> {
  return containsAny(message, BIOLOGY_TERMS) ? "europe_pmc_search" : "openalex_search";
}

export function providerStage(provider?: string): HeatherProgressStage | null {
  const stages: Record<string, HeatherProgressStage> = {
    searxng: "research_web_search",
    openalex: "openalex_search",
    crossref: "crossref_search",
    pubmed: "pubmed_search",
    europe_pmc: "europe_pmc_search",
    "semantic_scholar": "semantic_scholar_search",
    unpaywall: "unpaywall_check"
  };
  return provider ? stages[provider] || null : null;
}

export function isResearchProgressStage(stage: HeatherProgressStage): stage is Exclude<HeatherProgressStage, ChatProgressStage> {
  return stage !== "request_received" && stage !== "project_context_resolve" && stage !== "response_review" && stage !== "completed" && stage !== "fallback" && stage !== "failed" && stage !== "cancelled";
}

function containsAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
}

function isMaterialCandidateRequest(value: string) {
  return (value.includes("등록") || value.includes("register")) && (value.includes("논문") || value.includes("paper") || value.includes("연구자료") || value.includes("material"));
}

function isMemoryCandidateRequest(value: string) {
  return (value.includes("메모리") || value.includes("memory") || value.includes("메모")) && (value.includes("저장") || value.includes("save") || value.includes("후보") || value.includes("candidate"));
}

function unique<T>(items: T[]) {
  return [...new Set(items)];
}
