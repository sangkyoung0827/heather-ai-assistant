"use client";

import { Check, ChevronDown, ChevronUp, Square, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { progressLabel, type ChatProgressEvent } from "../../../lib/chat/progress-events";
import { HeatherOrbitalThinkingIndicator, type OrbitalState } from "./HeatherOrbitalThinkingIndicator";

export function ThinkingStatusPanel({ events, isRunning, locale, onCancel, mode = "personal" }: { events: ChatProgressEvent[]; isRunning: boolean; locale: "ko" | "en"; onCancel: () => void; mode?: "personal" | "research" }) {
  const [expanded, setExpanded] = useState(true);
  useEffect(() => { setExpanded(isRunning); }, [isRunning]);
  const current = events.at(-1);
  const visible = useMemo(() => events.filter((event, index) => event.status !== "skipped" && (event.status !== "active" || !events.slice(index + 1).some((next) => next.stage === event.stage))).slice(mode === "research" ? -10 : -4), [events, mode]);
  const state = orbitalState(current);
  const currentLabel = current ? progressLabel(current.stage, locale) : locale === "ko" ? "요청을 준비하고 있습니다." : "Preparing your request.";
  const completed = events.filter((event) => event.status === "completed").length;
  const sourceCount = latestCount(events, "source_count");
  const candidateCount = latestCount(events, "candidate_count");
  const summary = isRunning
    ? currentLabel
    : mode === "research"
      ? researchSummary(locale, completed, sourceCount, candidateCount)
      : locale === "ko" ? `${completed}개 처리 단계를 확인해 답변했습니다.` : `Completed ${completed} processing steps for this response.`;

  return <section className={`thinking-status-panel ${isRunning ? "is-running" : "is-compact"} is-${mode}`} role="status" aria-live="polite">
    <HeatherOrbitalThinkingIndicator state={state} mode={mode} candidateCount={candidateCount || sourceCount || 0} />
    <div className="thinking-status-copy"><strong>{summary}</strong><div className="thinking-progress-track" role="progressbar" aria-label={locale === "ko" ? "Heather 응답 진행 상태" : "Heather response progress"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={current?.progress || 0}><span style={{ width: `${current?.progress || 0}%` }} /></div>{mode === "research" ? <ToolStatusSummary events={events} locale={locale} /> : null}{expanded ? <ol>{visible.map((event) => <li key={event.id} className={`is-${event.status}`}>{event.status === "failed" || event.status === "warning" ? <TriangleAlert /> : event.status === "active" ? <span className="thinking-active-mark" aria-hidden="true" /> : <Check />}<span>{progressLabel(event.stage, locale)}{event.detail ? <small>{event.detail}</small> : null}</span></li>)}</ol> : null}</div>
    <div className="thinking-status-actions">{isRunning ? <button type="button" onClick={onCancel} title={locale === "ko" ? "응답 중단" : "Stop response"} aria-label={locale === "ko" ? "응답 중단" : "Stop response"}><Square /></button> : <button type="button" onClick={() => setExpanded((open) => !open)} title={locale === "ko" ? "처리 과정 보기" : "Show processing steps"} aria-label={locale === "ko" ? "처리 과정 보기" : "Show processing steps"}>{expanded ? <ChevronUp /> : <ChevronDown />}</button>}</div>
  </section>;
}

export function ToolStatusSummary({ events, locale }: { events: ChatProgressEvent[]; locale: "ko" | "en" }) {
  const providers = useMemo(() => {
    const byProvider = new Map<string, ChatProgressEvent>();
    events.forEach((event) => { if (event.provider) byProvider.set(event.provider, event); });
    return [...byProvider.entries()].slice(-4);
  }, [events]);
  const sourceCount = latestCount(events, "source_count");
  const abstractCount = latestCount(events, "abstract_checked_count");
  const verifiedCount = latestCount(events, "verified_count");
  if (!providers.length && !sourceCount && !abstractCount && !verifiedCount) return null;
  return <div className="tool-status-summary" aria-label={locale === "ko" ? "연구 도구 상태" : "Research tool status"}>
    {providers.map(([provider, event]) => <span key={provider} className={`is-${event.provider_status || event.status}`}>{providerLabel(provider)} · {providerStatusLabel(event, locale)}</span>)}
    {sourceCount ? <small>{locale === "ko" ? `확인 출처 ${sourceCount}건` : `${sourceCount} sources checked`}</small> : null}
    {verifiedCount ? <small>{locale === "ko" ? `DOI 식별 ${verifiedCount}건` : `${verifiedCount} DOI identifiers`}</small> : null}
    {abstractCount ? <small>{locale === "ko" ? `초록 검토 ${abstractCount}건` : `${abstractCount} abstracts reviewed`}</small> : null}
  </div>;
}

function orbitalState(event?: ChatProgressEvent): OrbitalState {
  if (!event) return "analyzing";
  if (event.status === "failed") return "failed";
  if (event.status === "warning") return "warning";
  if (event.status === "cancelled") return "cancelled";
  if (event.stage === "completed") return "completed";
  if (["web_search", "source_validation", "openalex_search", "crossref_search", "pubmed_search", "europe_pmc_search", "semantic_scholar_search", "unpaywall_check", "research_web_search", "production_literature_search"].includes(event.stage)) return "searching";
  if (["metadata_normalization", "doi_validation", "deduplication", "abstract_verification", "full_text_availability_check", "source_relevance_scoring", "evidence_assessment", "evidence_alignment"].includes(event.stage)) return "validating";
  if (["paper_comparison", "contradiction_check", "previous_experiment_compare", "process_variable_analysis"].includes(event.stage)) return "comparing";
  if (["research_synthesis", "citation_assembly", "limitation_analysis"].includes(event.stage)) return "synthesizing";
  if (["research_material_candidate_prepare", "research_memory_candidate_prepare", "next_research_direction_prepare", "experiment_recommendation_prepare"].includes(event.stage)) return "candidate_preparation";
  if (event.stage === "personal_memory_search" || event.stage === "research_memory_search" || event.stage === "research_material_search" || event.stage === "project_context_resolve" || event.stage === "experiment_context_load") return "connecting";
  if (event.stage === "response_composition" || event.stage === "response_review") return "composing";
  return "analyzing";
}

function latestCount(events: ChatProgressEvent[], field: "source_count" | "candidate_count" | "verified_count" | "abstract_checked_count") {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const value = events[index]?.[field];
    if (typeof value === "number") return value;
  }
  return 0;
}

function providerLabel(provider: string) {
  return provider === "europe_pmc" ? "Europe PMC" : provider === "semantic_scholar" ? "Semantic Scholar" : provider === "searxng" ? "Web discovery" : provider;
}

function providerStatusLabel(event: ChatProgressEvent, locale: "ko" | "en") {
  if (event.provider_status === "active") return locale === "ko" ? "검색 중" : "Searching";
  if (event.provider_status === "partial") return locale === "ko" ? "일부 완료" : "Partial";
  if (event.provider_status === "warning" || event.status === "warning") return locale === "ko" ? "제한됨" : "Limited";
  if (event.provider_status === "failed" || event.status === "failed") return locale === "ko" ? "실패" : "Failed";
  return locale === "ko" ? "완료" : "Complete";
}

function researchSummary(locale: "ko" | "en", completed: number, sourceCount: number, candidateCount: number) {
  const count = sourceCount || candidateCount;
  if (locale === "ko") return count ? `확인된 출처 ${count}건을 바탕으로 연구 분석을 완료했습니다.` : `${completed}개 연구 단계를 확인해 분석했습니다.`;
  return count ? `Completed the research analysis using ${count} checked source${count === 1 ? "" : "s"}.` : `Completed ${completed} research steps for this analysis.`;
}
