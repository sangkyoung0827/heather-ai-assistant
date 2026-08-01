export type ChatProgressStage =
  | "request_received"
  | "intent_analysis"
  | "direct_command_check"
  | "quick_link_parse"
  | "quick_link_url_validation"
  | "quick_link_duplicate_check"
  | "quick_link_write"
  | "quick_link_verify"
  | "personal_memory_search"
  | "personal_document_search"
  | "project_context_resolve"
  | "web_search_decision"
  | "web_search"
  | "source_validation"
  | "response_composition"
  | "response_review"
  | "completed"
  | "fallback"
  | "failed"
  | "cancelled";

export type ResearchProgressStage =
  | "research_intent_analysis"
  | "scope_definition"
  | "research_material_search"
  | "research_memory_search"
  | "prior_experiment_search"
  | "internal_evidence_review"
  | "query_generation"
  | "provider_routing"
  | "cache_check"
  | "openalex_search"
  | "crossref_search"
  | "pubmed_search"
  | "europe_pmc_search"
  | "semantic_scholar_search"
  | "unpaywall_check"
  | "research_web_search"
  | "metadata_normalization"
  | "doi_validation"
  | "deduplication"
  | "abstract_verification"
  | "full_text_availability_check"
  | "source_relevance_scoring"
  | "paper_comparison"
  | "evidence_assessment"
  | "contradiction_check"
  | "limitation_analysis"
  | "research_synthesis"
  | "citation_assembly"
  | "research_material_candidate_prepare"
  | "research_memory_candidate_prepare"
  | "next_research_direction_prepare"
  | "experiment_recommendation_prepare"
  | "partial_completed"
  | "experiment_context_load"
  | "simulation_result_review"
  | "previous_experiment_compare"
  | "process_variable_analysis"
  | "production_literature_search"
  | "evidence_alignment";

export type HeatherProgressStage = ChatProgressStage | ResearchProgressStage;

export type ChatProgressStatus = "pending" | "active" | "completed" | "skipped" | "warning" | "failed" | "cancelled";

export type ChatProgressEvent = {
  id: string;
  request_id: string;
  stage: HeatherProgressStage;
  status: ChatProgressStatus;
  progress: number;
  source_type?: "direct_command" | "personal_memory" | "project_context" | "web_search" | "llm" | "cache" | "research_memory" | "research_material" | "research_project" | "academic_search" | "research_analysis" | "process_simulation";
  source_name?: string;
  provider?: string;
  provider_status?: "pending" | "active" | "completed" | "partial" | "limited" | "warning" | "failed" | "skipped";
  project_id?: string;
  project_name?: string;
  query_count?: number;
  candidate_count?: number;
  verified_count?: number;
  duplicate_count?: number;
  abstract_checked_count?: number;
  full_text_checked_count?: number;
  source_count?: number;
  evidence_level?: string;
  detail?: string;
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
};

export type ChatStreamEvent =
  | { type: "progress"; data: ChatProgressEvent }
  | { type: "content_delta"; data: { text: string } }
  | { type: "done"; data: { used_tools: string[]; duration_ms: number; provider?: string; model?: string; cached?: boolean; conversation_id?: string; title?: string } }
  | { type: "error"; data: { user_message: string; recoverable: boolean } };

type ProgressCopy = Record<HeatherProgressStage, string>;

const KO: ProgressCopy = {
  request_received: "요청을 받았습니다.",
  intent_analysis: "요청의 목적을 파악하고 있습니다.",
  direct_command_check: "등록된 직접명령을 확인하고 있습니다.",
  quick_link_parse: "사이트 정보를 정리하고 있습니다.",
  quick_link_url_validation: "주소를 확인하고 있습니다.",
  quick_link_duplicate_check: "중복 링크를 확인하고 있습니다.",
  quick_link_write: "대시보드에 등록하고 있습니다.",
  quick_link_verify: "등록 결과를 확인하고 있습니다.",
  personal_memory_search: "관련 개인 메모리를 찾고 있습니다.",
  personal_document_search: "업로드한 개인 문서 원문을 찾고 있습니다.",
  project_context_resolve: "관련 프로젝트 정보를 연결하고 있습니다.",
  web_search_decision: "최신 정보가 필요한지 판단하고 있습니다.",
  web_search: "신뢰할 수 있는 자료를 검색하고 있습니다.",
  source_validation: "출처와 정보를 확인하고 있습니다.",
  response_composition: "답변을 구성하고 있습니다.",
  response_review: "최종 내용을 정리하고 있습니다.",
  completed: "답변 준비가 완료되었습니다.",
  fallback: "일부 선택적 조회 단계를 건너뛰고 답변을 준비했습니다.",
  failed: "처리 중 일부 기능에서 문제가 발생했습니다.",
  cancelled: "응답 생성을 중단했습니다.",
  research_intent_analysis: "연구 질문의 목적을 파악하고 있습니다.",
  scope_definition: "연구 범위와 핵심 변수를 정리하고 있습니다.",
  research_material_search: "등록된 연구자료를 확인하고 있습니다.",
  research_memory_search: "관련 연구 메모리를 찾고 있습니다.",
  prior_experiment_search: "기존 실험 결과를 확인하고 있습니다.",
  internal_evidence_review: "내부 연구기록의 근거를 검토하고 있습니다.",
  query_generation: "학술 검색어를 구성하고 있습니다.",
  provider_routing: "연구 분야에 적합한 검색 경로를 선택하고 있습니다.",
  cache_check: "기존 검색 결과를 확인하고 있습니다.",
  openalex_search: "OpenAlex에서 관련 논문을 찾고 있습니다.",
  crossref_search: "Crossref에서 DOI와 서지정보를 확인하고 있습니다.",
  pubmed_search: "PubMed에서 생명과학 연구를 검색하고 있습니다.",
  europe_pmc_search: "Europe PMC에서 초록과 공개 자료를 확인하고 있습니다.",
  semantic_scholar_search: "관련 논문과 인용 관계를 확인하고 있습니다.",
  unpaywall_check: "합법적으로 공개된 원문을 확인하고 있습니다.",
  research_web_search: "공식 연구기관과 산업자료를 찾고 있습니다.",
  metadata_normalization: "논문 정보를 표준 형식으로 정리하고 있습니다.",
  doi_validation: "DOI와 서지정보를 검증하고 있습니다.",
  deduplication: "중복된 연구자료를 정리하고 있습니다.",
  abstract_verification: "초록에서 연구 내용과 관련성을 확인하고 있습니다.",
  full_text_availability_check: "검토 가능한 공개 원문을 확인하고 있습니다.",
  source_relevance_scoring: "현재 연구와의 관련성을 평가하고 있습니다.",
  paper_comparison: "논문의 조건과 결과를 비교하고 있습니다.",
  evidence_assessment: "근거 수준과 신뢰도를 평가하고 있습니다.",
  contradiction_check: "연구 결과 사이의 차이와 충돌을 확인하고 있습니다.",
  limitation_analysis: "연구의 한계와 적용 범위를 검토하고 있습니다.",
  research_synthesis: "검증된 자료를 바탕으로 분석을 작성하고 있습니다.",
  citation_assembly: "분석과 출처를 연결하고 있습니다.",
  research_material_candidate_prepare: "연구자료 등록 후보를 준비하고 있습니다.",
  research_memory_candidate_prepare: "연구 메모리 후보를 정리하고 있습니다.",
  next_research_direction_prepare: "다음 연구 방향을 제안하고 있습니다.",
  experiment_recommendation_prepare: "후속 실험 조건을 검토하고 있습니다.",
  partial_completed: "확인 가능한 자료를 바탕으로 분석을 완료했습니다.",
  experiment_context_load: "실험 조건과 결과를 불러오고 있습니다.",
  simulation_result_review: "시뮬레이션 결과를 검토하고 있습니다.",
  previous_experiment_compare: "이전 실험과 차이를 비교하고 있습니다.",
  process_variable_analysis: "공정 변수와 결과의 관계를 분석하고 있습니다.",
  production_literature_search: "유사한 DHA 생산 연구를 찾고 있습니다.",
  evidence_alignment: "실험 결과와 문헌 근거를 비교하고 있습니다."
};

const EN: ProgressCopy = {
  request_received: "Request received.",
  intent_analysis: "Understanding the request.",
  direct_command_check: "Checking saved direct commands.",
  quick_link_parse: "Organizing site information.",
  quick_link_url_validation: "Checking the URL.",
  quick_link_duplicate_check: "Checking duplicate links.",
  quick_link_write: "Adding the link to your dashboard.",
  quick_link_verify: "Checking the saved link.",
  personal_memory_search: "Finding relevant personal memory.",
  personal_document_search: "Finding uploaded personal-document excerpts.",
  project_context_resolve: "Connecting related project context.",
  web_search_decision: "Checking whether current information is needed.",
  web_search: "Searching trusted sources.",
  source_validation: "Checking sources and information.",
  response_composition: "Composing the response.",
  response_review: "Reviewing the final response.",
  completed: "Response is ready.",
  fallback: "Preparing a response without some connections.",
  failed: "Part of the request could not be completed.",
  cancelled: "Response generation was stopped.",
  research_intent_analysis: "Understanding the research objective.",
  scope_definition: "Defining the research scope and key variables.",
  research_material_search: "Checking registered research materials.",
  research_memory_search: "Finding related research memories.",
  prior_experiment_search: "Checking prior experiment results.",
  internal_evidence_review: "Reviewing evidence in internal research records.",
  query_generation: "Building an academic search query.",
  provider_routing: "Selecting suitable research sources.",
  cache_check: "Checking existing search results.",
  openalex_search: "Finding related papers in OpenAlex.",
  crossref_search: "Checking DOI and bibliographic details in Crossref.",
  pubmed_search: "Searching life-science research in PubMed.",
  europe_pmc_search: "Checking abstracts and open material in Europe PMC.",
  semantic_scholar_search: "Checking related papers and citation links.",
  unpaywall_check: "Checking legally open full text.",
  research_web_search: "Finding official research and industry material.",
  metadata_normalization: "Normalizing paper information.",
  doi_validation: "Validating DOI and bibliographic details.",
  deduplication: "Removing duplicate research material.",
  abstract_verification: "Checking abstracts for relevance.",
  full_text_availability_check: "Checking available open full text.",
  source_relevance_scoring: "Assessing relevance to the current research.",
  paper_comparison: "Comparing paper conditions and outcomes.",
  evidence_assessment: "Assessing evidence level and confidence.",
  contradiction_check: "Checking differences and conflicts between findings.",
  limitation_analysis: "Reviewing limitations and applicability.",
  research_synthesis: "Writing an analysis from verified material.",
  citation_assembly: "Connecting the analysis and sources.",
  research_material_candidate_prepare: "Preparing research-material candidates.",
  research_memory_candidate_prepare: "Organizing research-memory candidates.",
  next_research_direction_prepare: "Preparing next research directions.",
  experiment_recommendation_prepare: "Reviewing follow-up experiment conditions.",
  partial_completed: "Completed an analysis with the available material.",
  experiment_context_load: "Loading experiment conditions and results.",
  simulation_result_review: "Reviewing simulation results.",
  previous_experiment_compare: "Comparing previous experiments.",
  process_variable_analysis: "Analyzing relationships between process variables and results.",
  production_literature_search: "Finding similar DHA production research.",
  evidence_alignment: "Comparing experimental results and literature evidence."
};

export function progressLabel(stage: HeatherProgressStage, locale: "ko" | "en") {
  return (locale === "ko" ? KO : EN)[stage];
}

export async function readChatProgressStream(response: Response, onEvent: (event: ChatStreamEvent) => void) {
  if (!response.body) throw new Error("Heather response stream is unavailable.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const records = buffer.split("\n\n");
    buffer = records.pop() || "";
    for (const record of records) {
      const dataLine = record.split("\n").find((line) => line.startsWith("data:"));
      if (!dataLine) continue;
      try {
        onEvent(JSON.parse(dataLine.slice(5).trim()) as ChatStreamEvent);
      } catch {
        // A malformed event is ignored so an otherwise valid response can still finish.
      }
    }
  }
}

export function encodeChatStreamEvent(event: ChatStreamEvent) {
  return `data: ${JSON.stringify(event)}\n\n`;
}
