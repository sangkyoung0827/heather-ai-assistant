"use client";

import { Check, ChevronDown, ChevronUp, Square, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { progressLabel, type ChatProgressEvent } from "../../../lib/chat/progress-events";
import { HeatherOrbitalThinkingIndicator, type OrbitalState } from "./HeatherOrbitalThinkingIndicator";

export function ThinkingStatusPanel({ events, isRunning, locale, onCancel }: { events: ChatProgressEvent[]; isRunning: boolean; locale: "ko" | "en"; onCancel: () => void }) {
  const [expanded, setExpanded] = useState(true);
  useEffect(() => { setExpanded(isRunning); }, [isRunning]);
  const current = events.at(-1);
  const visible = useMemo(() => events.filter((event, index) => event.status !== "skipped" && (event.status !== "active" || !events.slice(index + 1).some((next) => next.stage === event.stage))).slice(-4), [events]);
  const state = orbitalState(current);
  const currentLabel = current ? progressLabel(current.stage, locale) : locale === "ko" ? "요청을 준비하고 있습니다." : "Preparing your request.";
  const completed = events.filter((event) => event.status === "completed").length;
  const summary = isRunning ? currentLabel : locale === "ko" ? `${completed}개 처리 단계를 확인해 답변했습니다.` : `Completed ${completed} processing steps for this response.`;

  return <section className={`thinking-status-panel ${isRunning ? "is-running" : "is-compact"}`} role="status" aria-live="polite">
    <HeatherOrbitalThinkingIndicator state={state} />
    <div className="thinking-status-copy"><strong>{summary}</strong><div className="thinking-progress-track" role="progressbar" aria-label={locale === "ko" ? "Heather 응답 진행 상태" : "Heather response progress"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={current?.progress || 0}><span style={{ width: `${current?.progress || 0}%` }} /></div>{expanded ? <ol>{visible.map((event) => <li key={event.id} className={`is-${event.status}`}>{event.status === "failed" || event.status === "warning" ? <TriangleAlert /> : event.status === "active" ? <span className="thinking-active-mark" aria-hidden="true" /> : <Check />}<span>{progressLabel(event.stage, locale)}</span></li>)}</ol> : null}</div>
    <div className="thinking-status-actions">{isRunning ? <button type="button" onClick={onCancel} title={locale === "ko" ? "응답 중단" : "Stop response"} aria-label={locale === "ko" ? "응답 중단" : "Stop response"}><Square /></button> : <button type="button" onClick={() => setExpanded((open) => !open)} title={locale === "ko" ? "처리 과정 보기" : "Show processing steps"} aria-label={locale === "ko" ? "처리 과정 보기" : "Show processing steps"}>{expanded ? <ChevronUp /> : <ChevronDown />}</button>}</div>
  </section>;
}

function orbitalState(event?: ChatProgressEvent): OrbitalState {
  if (!event) return "analyzing";
  if (event.status === "failed") return "failed";
  if (event.status === "warning") return "warning";
  if (event.status === "cancelled") return "cancelled";
  if (event.stage === "completed") return "completed";
  if (event.stage === "web_search" || event.stage === "source_validation") return "searching";
  if (event.stage === "personal_memory_search" || event.stage === "project_context_resolve") return "connecting";
  if (event.stage === "response_composition" || event.stage === "response_review") return "composing";
  return "analyzing";
}
