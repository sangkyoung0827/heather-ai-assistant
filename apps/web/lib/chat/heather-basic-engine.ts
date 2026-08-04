import type { ChatExecutionMetadata, ChatResponsePayload, ChatType } from "@heather/core";
import { generateConversationTitle } from "@heather/core";

const LOCAL_ENGINE_NOT_CONFIGURED = "BROWSER_LOCAL_ENGINE_REQUIRED";

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
      ? "헤더 기본 엔진은 브라우저의 WebGPU에서 실행됩니다. 최신 Chrome 등 WebGPU 지원 브라우저에서 다시 시도해주세요."
      : "Heather Basic runs through WebGPU inside the browser. Try again in a WebGPU-capable browser such as a current version of Chrome.",
    title: generateConversationTitle(message),
    risk: { level: "low", requiresConfirmation: false, reason: "Browser-local engine must run on the client." },
    execution
  };
}

/** Server fallback only. Normal Heather Basic responses run in the browser. */
export function executePersonalHeatherBasic(message: string): ChatResponsePayload {
  return pendingResponse(message, "general");
}

/** Server fallback only. Normal Heather Basic responses run in the browser. */
export function executeResearcherHeatherBasic(message: string): ChatResponsePayload {
  return pendingResponse(message, "research");
}

export { LOCAL_ENGINE_NOT_CONFIGURED };
