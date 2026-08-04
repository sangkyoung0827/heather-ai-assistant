import type { ChatExecutionMetadata, ChatResponsePayload, ChatType } from "@heather/core";
import { generateConversationTitle } from "@heather/core";

const EMBEDDED_ENGINE_DESKTOP_REQUIRED = "EMBEDDED_ENGINE_DESKTOP_REQUIRED";

function desktopRequiredResponse(message: string, chatType: ChatType): ChatResponsePayload {
  const execution: ChatExecutionMetadata = {
    requestedExecutionMode: "HEATHER_BASIC",
    actualExecutionMode: "HEATHER_BASIC",
    chatType,
    localEngineUsed: false,
    externalLlmUsed: false,
    errorCode: EMBEDDED_ENGINE_DESKTOP_REQUIRED
  };
  const korean = /[\u3131-\uD79D]/.test(message);
  return {
    message: korean
      ? "헤더 기본 엔진은 Heather 데스크톱 앱에 내장된 로컬 런타임에서만 실행됩니다. 현재 웹 화면에서는 고급추론을 사용하거나 Heather 데스크톱 앱을 실행해주세요."
      : "Heather basic engine runs only inside the local runtime embedded in the Heather desktop app. Use Advanced reasoning here or open the Heather desktop app.",
    title: generateConversationTitle(message),
    risk: { level: "low", requiresConfirmation: false, reason: "The embedded local runtime is only available inside the desktop application." },
    execution
  };
}

/** The Tauri client intercepts HEATHER_BASIC before this server-only fallback. */
export function executePersonalHeatherBasic(message: string): ChatResponsePayload {
  return desktopRequiredResponse(message, "general");
}

/** The Tauri client intercepts HEATHER_BASIC before this server-only fallback. */
export function executeResearcherHeatherBasic(message: string): ChatResponsePayload {
  return desktopRequiredResponse(message, "research");
}

export { EMBEDDED_ENGINE_DESKTOP_REQUIRED };
