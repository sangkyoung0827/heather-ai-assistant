export type ChatProgressStage =
  | "request_received"
  | "intent_analysis"
  | "direct_command_check"
  | "personal_memory_search"
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

export type ChatProgressStatus = "pending" | "active" | "completed" | "skipped" | "warning" | "failed" | "cancelled";

export type ChatProgressEvent = {
  id: string;
  request_id: string;
  stage: ChatProgressStage;
  status: ChatProgressStatus;
  progress: number;
  source_type?: "direct_command" | "personal_memory" | "project_context" | "web_search" | "llm" | "cache";
  source_name?: string;
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
};

export type ChatStreamEvent =
  | { type: "progress"; data: ChatProgressEvent }
  | { type: "content_delta"; data: { text: string } }
  | { type: "done"; data: { used_tools: string[]; duration_ms: number; provider?: string; model?: string; cached?: boolean } }
  | { type: "error"; data: { user_message: string; recoverable: boolean } };

type ProgressCopy = Record<ChatProgressStage, string>;

const KO: ProgressCopy = {
  request_received: "요청을 받았습니다.",
  intent_analysis: "요청의 목적을 파악하고 있습니다.",
  direct_command_check: "등록된 직접명령을 확인하고 있습니다.",
  personal_memory_search: "관련 개인 메모리를 찾고 있습니다.",
  project_context_resolve: "관련 프로젝트 정보를 연결하고 있습니다.",
  web_search_decision: "최신 정보가 필요한지 판단하고 있습니다.",
  web_search: "신뢰할 수 있는 자료를 검색하고 있습니다.",
  source_validation: "출처와 정보를 확인하고 있습니다.",
  response_composition: "답변을 구성하고 있습니다.",
  response_review: "최종 내용을 정리하고 있습니다.",
  completed: "답변 준비가 완료되었습니다.",
  fallback: "일부 연결 없이 답변을 준비했습니다.",
  failed: "처리 중 일부 기능에서 문제가 발생했습니다.",
  cancelled: "응답 생성을 중단했습니다."
};

const EN: ProgressCopy = {
  request_received: "Request received.",
  intent_analysis: "Understanding the request.",
  direct_command_check: "Checking saved direct commands.",
  personal_memory_search: "Finding relevant personal memory.",
  project_context_resolve: "Connecting related project context.",
  web_search_decision: "Checking whether current information is needed.",
  web_search: "Searching trusted sources.",
  source_validation: "Checking sources and information.",
  response_composition: "Composing the response.",
  response_review: "Reviewing the final response.",
  completed: "Response is ready.",
  fallback: "Preparing a response without some connections.",
  failed: "Part of the request could not be completed.",
  cancelled: "Response generation was stopped."
};

export function progressLabel(stage: ChatProgressStage, locale: "ko" | "en") {
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
