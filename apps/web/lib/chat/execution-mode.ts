import type { ChatExecutionMode, ChatType } from "@heather/core";

export const DEFAULT_CHAT_EXECUTION_MODE: ChatExecutionMode = "ADVANCED_REASONING";

export function parseChatExecutionMode(value: unknown): ChatExecutionMode | null {
  return value === "HEATHER_BASIC" || value === "ADVANCED_REASONING" ? value : null;
}

export function executionModeForStoredValue(value: unknown): ChatExecutionMode {
  return parseChatExecutionMode(value) || DEFAULT_CHAT_EXECUTION_MODE;
}

export function isExecutionModeSelectorEnabled(): boolean {
  return process.env.CHAT_EXECUTION_MODE_SELECTOR_ENABLED !== "false";
}

export function isExecutionModeSelectorEnabledInBrowser(): boolean {
  return process.env.CHAT_EXECUTION_MODE_SELECTOR_ENABLED !== "false";
}

export function executionModeLabel(mode: ChatExecutionMode, locale: "ko" | "en"): string {
  if (mode === "HEATHER_BASIC") return locale === "ko" ? "헤더 기본 엔진" : "Heather basic engine";
  return locale === "ko" ? "고급추론" : "Advanced reasoning";
}

export function advancedModeDetail(chatType: ChatType, locale: "ko" | "en"): string {
  if (locale === "en") return chatType === "research" ? "Uses the established research reasoning path." : "Uses the established personal-chat reasoning path.";
  return chatType === "research" ? "현재 연구원 채팅에 고정된 기존 고성능 모델로 처리" : "현재 개인 채팅에 고정된 기존 고성능 모델로 처리";
}
