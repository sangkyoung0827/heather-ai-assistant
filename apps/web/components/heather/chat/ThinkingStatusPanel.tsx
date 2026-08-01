"use client";

import { BrainCircuit, CheckCircle2, ChevronDown, ChevronUp, Command, Database, FilePenLine, FolderKanban, Inbox, Search, ShieldCheck, Square, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { progressLabel, type ChatProgressEvent } from "../../../lib/chat/progress-events";

export function ThinkingStatusPanel({ events, isRunning, locale, onCancel, mode = "personal" }: { events: ChatProgressEvent[]; isRunning: boolean; locale: "ko" | "en"; onCancel: () => void; mode?: "personal" | "research" }) {
  const [expanded, setExpanded] = useState(true);
  useEffect(() => { setExpanded(isRunning); }, [isRunning]);
  const current = events.at(-1);
  const visible = useMemo(() => latestStepEvents(events), [events]);
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
    <div className="thinking-status-copy"><strong>{summary}</strong><div className="thinking-progress-track" role="progressbar" aria-label={locale === "ko" ? "Heather 응답 진행 상태" : "Heather response progress"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={current?.progress || 0}><span style={{ width: `${current?.progress || 0}%` }} /></div>{mode === "research" ? <ToolStatusSummary events={events} locale={locale} /> : null}{expanded ? <ol>{visible.map((event) => <ActivityRow key={event.id} event={event} locale={locale} />)}</ol> : null}</div>
    <div className="thinking-status-actions">{isRunning ? <button type="button" onClick={onCancel} title={locale === "ko" ? "응답 중단" : "Stop response"} aria-label={locale === "ko" ? "응답 중단" : "Stop response"}><Square /></button> : <button type="button" onClick={() => setExpanded((open) => !open)} title={locale === "ko" ? "처리 과정 보기" : "Show processing steps"} aria-label={locale === "ko" ? "처리 과정 보기" : "Show processing steps"}>{expanded ? <ChevronUp /> : <ChevronDown />}</button>}</div>
  </section>;
}

function ActivityRow({ event, locale }: { event: ChatProgressEvent; locale: "ko" | "en" }) {
  const Icon = activityIcon(event);
  const status = event.status === "warning" || event.status === "failed" ? "warning" : event.status === "active" ? "active" : "completed";
  return <li className={`is-${status}`}><span className="thinking-step-icon"><Icon /></span><span><b>{activityLabel(event, locale)}</b>{event.detail || event.source_name ? <small>{event.detail || event.source_name}</small> : null}</span>{status === "completed" ? <CheckCircle2 className="thinking-step-complete" aria-label={locale === "ko" ? "완료" : "Completed"} /> : null}</li>;
}

function latestStepEvents(events: ChatProgressEvent[]) {
  const indices = new Map<ChatProgressEvent["stage"], number>();
  events.forEach((event, index) => { if (event.status !== "skipped") indices.set(event.stage, index); });
  return events.filter((event, index) => event.status !== "skipped" && indices.get(event.stage) === index);
}

function activityIcon(event: ChatProgressEvent) {
  if (event.status === "warning" || event.status === "failed") return TriangleAlert;
  if (event.stage === "request_received") return Inbox;
  if (event.stage === "execution_mode_check" || event.stage === "local_engine_status") return BrainCircuit;
  if (event.stage === "intent_analysis" || event.stage === "research_intent_analysis" || event.stage === "scope_definition") return BrainCircuit;
  if (event.stage === "direct_command_check") return Command;
  if (["quick_link_parse", "quick_link_url_validation", "quick_link_duplicate_check", "quick_link_write", "quick_link_verify"].includes(event.stage)) return FilePenLine;
  if (["personal_memory_search", "personal_document_search", "personal_memo_request", "personal_memo_target", "personal_memo_read", "personal_memo_write", "personal_memo_summary", "personal_memo_verify", "research_memory_search", "research_material_search", "experiment_context_load"].includes(event.stage)) return Database;
  if (event.stage === "project_context_resolve") return FolderKanban;
  if (["web_search_decision", "web_search", "source_validation", "query_generation", "provider_routing", "cache_check", "openalex_search", "crossref_search", "pubmed_search", "europe_pmc_search", "semantic_scholar_search", "unpaywall_check", "research_web_search", "production_literature_search"].includes(event.stage)) return Search;
  if (["response_review", "metadata_normalization", "doi_validation", "deduplication", "abstract_verification", "full_text_availability_check", "source_relevance_scoring", "evidence_assessment", "contradiction_check", "limitation_analysis", "citation_assembly"].includes(event.stage)) return ShieldCheck;
  if (event.stage === "completed") return CheckCircle2;
  return FilePenLine;
}

function activityLabel(event: ChatProgressEvent, locale: "ko" | "en") {
  if (event.status === "active") return progressLabel(event.stage, locale);
  if (event.status === "warning" || event.status === "failed") return progressLabel(event.stage, locale);
  const ko: Partial<Record<ChatProgressEvent["stage"], string>> = {
    request_received: "요청 확인함", execution_mode_check: "응답 방식 확인함", local_engine_status: "로컬 엔진 상태 확인함", intent_analysis: "요청 목적 확인함", research_intent_analysis: "연구 요청 목적 확인함", scope_definition: "연구 범위 정리함", direct_command_check: "직접명령 확인함", quick_link_parse: "사이트 정보 정리함", quick_link_url_validation: "주소 확인함", quick_link_duplicate_check: "중복 링크 확인함", quick_link_write: "대시보드 링크 저장함", quick_link_verify: "등록 결과 확인함", personal_memory_search: "개인 메모리 조회함", personal_document_search: "업로드 개인 문서 원문 조회함", research_memory_search: "연구 메모리 조회함", research_material_search: "연구자료 조회함", project_context_resolve: "프로젝트 정보 연결함", web_search_decision: "검색 필요 여부 확인함", web_search: "외부 자료 검색함", source_validation: "출처 확인함", query_generation: "학술 검색어 구성함", provider_routing: "검색 경로 선택함", cache_check: "기존 검색 결과 확인함", response_composition: "답변 작성함", research_synthesis: "연구 분석 작성함", response_review: "답변 검토함", citation_assembly: "출처 연결함", completed: "답변 준비 완료"
  };
  const en: Partial<Record<ChatProgressEvent["stage"], string>> = {
    request_received: "Request checked", execution_mode_check: "Response mode checked", local_engine_status: "Local engine status checked", intent_analysis: "Request intent checked", research_intent_analysis: "Research intent checked", scope_definition: "Research scope organized", direct_command_check: "Saved commands checked", quick_link_parse: "Site information organized", quick_link_url_validation: "URL checked", quick_link_duplicate_check: "Duplicate links checked", quick_link_write: "Dashboard link saved", quick_link_verify: "Saved link verified", personal_memory_search: "Personal memory checked", personal_document_search: "Uploaded personal-document excerpts checked", research_memory_search: "Research memory checked", research_material_search: "Research material checked", project_context_resolve: "Project context connected", web_search_decision: "Search need checked", web_search: "External sources searched", source_validation: "Sources checked", query_generation: "Academic query prepared", provider_routing: "Search route selected", cache_check: "Existing results checked", response_composition: "Response drafted", research_synthesis: "Research analysis drafted", response_review: "Response reviewed", citation_assembly: "Sources linked", completed: "Response ready"
  };
  return (locale === "ko" ? ko : en)[event.stage] || progressLabel(event.stage, locale);
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
