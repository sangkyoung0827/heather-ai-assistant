import type { ChatExecutionMetadata, ChatResponsePayload, ChatType } from "@heather/core";
import { generateConversationTitle } from "@heather/core";

const LOCAL_ENGINE_NOT_CONFIGURED = "LOCAL_ENGINE_NOT_CONFIGURED";

function pendingResponse(message: string, chatType: ChatType): ChatResponsePayload {
  const execution: ChatExecutionMetadata = {
    requestedExecutionMode: "HEATHER_BASIC",
    actualExecutionMode: "HEATHER_BASIC",
    chatType,
    localEngineUsed: false,
    externalLlmUsed: false,
    errorCode: LOCAL_ENGINE_NOT_CONFIGURED
  };
  const korean = /[\u3131-\uD79D]/.test(message);
  return {
    message: korean
      ? "헤더 기본 엔진은 현재 연결 준비 중입니다. 고급추론으로 전환하면 기존 모델을 사용할 수 있습니다."
      : "Heather basic engine is being prepared. Switch to Advanced reasoning to use the existing model.",
    title: generateConversationTitle(message),
    risk: { level: "low", requiresConfirmation: false, reason: "Local engine is not configured." },
    execution
  };
}

/** Intentionally isolated from every provider, search, and tool path. */
export function executePersonalHeatherBasic(message: string): ChatResponsePayload {
  return pendingResponse(message, "general");
}

/** Intentionally isolated from every provider, search, and tool path. */
export function executeResearcherHeatherBasic(message: string): ChatResponsePayload {
  return pendingResponse(message, "research");
}

export { LOCAL_ENGINE_NOT_CONFIGURED };
