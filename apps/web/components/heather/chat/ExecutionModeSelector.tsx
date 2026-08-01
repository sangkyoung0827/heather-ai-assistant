"use client";

import type { ChatExecutionMode, ChatType } from "@heather/core";
import { advancedModeDetail, executionModeLabel } from "../../../lib/chat/execution-mode";

export function ExecutionModeSelector({ value, chatType, locale, disabled, onChange }: { value: ChatExecutionMode; chatType: ChatType; locale: "ko" | "en"; disabled: boolean; onChange: (mode: ChatExecutionMode) => void }) {
  const basicDetail = locale === "ko" ? "내장될 로컬 모델로 처리 · 현재 준비 중" : "For Heather's local model · currently preparing";
  return <div className="execution-mode-control" aria-label={locale === "ko" ? "응답 실행 모드" : "Response execution mode"}>
    <div className="execution-mode-segments" role="group" aria-label={locale === "ko" ? "응답 실행 모드 선택" : "Choose response execution mode"}>
      {(["HEATHER_BASIC", "ADVANCED_REASONING"] as const).map((mode) => <button key={mode} type="button" disabled={disabled} aria-pressed={value === mode} className={value === mode ? "is-active" : ""} onClick={() => onChange(mode)}>{executionModeLabel(mode, locale)}</button>)}
    </div>
    <small>{value === "HEATHER_BASIC" ? basicDetail : advancedModeDetail(chatType, locale)}{disabled ? locale === "ko" ? " · 다음 메시지부터 변경할 수 있습니다." : " · Changes apply to the next message." : ""}</small>
  </div>;
}

export function ExecutionBadge({ execution, provider, model, locale }: { execution?: { actualExecutionMode: ChatExecutionMode; localEngineUsed: boolean; externalLlmUsed: boolean; errorCode?: string; durationMs?: number; searchUsed?: boolean }; provider?: string; model?: string; locale: "ko" | "en" }) {
  if (!execution) return null;
  if (execution.actualExecutionMode === "HEATHER_BASIC") return <small className="execution-badge is-basic">{locale === "ko" ? "헤더 기본 엔진 · 준비 중" : "Heather basic engine · preparing"}</small>;
  const duration = execution.durationMs ? ` · ${(execution.durationMs / 1000).toFixed(1)}s` : "";
  const evidence = execution.searchUsed ? locale === "ko" ? " · 검색 근거 사용" : " · search evidence used" : "";
  return <small className="execution-badge">{locale === "ko" ? "고급추론" : "Advanced reasoning"}{provider && model ? ` · ${provider} · ${model}` : ""}{evidence}{duration}</small>;
}
