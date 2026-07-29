"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ExternalLink, FolderKanban, Github, Import, KeyRound, Plus, RefreshCw, ShieldCheck } from "lucide-react";
import { getSupabaseBrowserClient } from "../../../lib/supabase-client";

type JsonRecord = Record<string, unknown>;
type Mode = "projects" | "import" | "sensitive" | "connections" | "approvals";

const modeCopy: Record<Mode, { title: string; description: string }> = {
  projects: { title: "프로젝트", description: "개인 프로젝트와 연결된 리소스를 한곳에서 관리합니다." },
  import: { title: "개인 컨텍스트 가져오기", description: "seed 내용을 먼저 검토한 뒤 선택한 항목만 저장합니다." },
  sensitive: { title: "민감 메모리", description: "민감한 메모리는 일반 채팅 컨텍스트와 분리되어 있습니다." },
  connections: { title: "연결", description: "연결 상태와 허용된 읽기 기능을 확인합니다." },
  approvals: { title: "승인 센터", description: "실행 전 확인이 필요한 제안과 안전한 감사 기록을 관리합니다." }
};

export function ContextControlPanel({ mode }: { mode: Mode }) {
  const [overview, setOverview] = useState<JsonRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<JsonRecord | null>(null);
  const [preview, setPreview] = useState<JsonRecord | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [working, setWorking] = useState(false);

  const call = useCallback(async (method: "GET" | "POST", suffix = "", body?: JsonRecord) => {
    const session = await getSupabaseBrowserClient()?.auth.getSession();
    const token = session?.data.session?.access_token;
    if (!token) throw new Error("이 기능을 사용하려면 로그인하세요.");
    const response = await fetch(`/api/context-control${suffix}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await response.json() as JsonRecord;
    if (!response.ok || typeof data.error === "string") throw new Error(String(data.error || "요청을 완료하지 못했습니다."));
    return data;
  }, []);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try { setOverview(await call("GET")); setNotice(null); }
    catch (error) { setNotice(error instanceof Error ? error.message : "컨텍스트 저장소를 불러오지 못했습니다."); }
    finally { setLoading(false); }
  }, [call]);

  useEffect(() => { void loadOverview(); }, [loadOverview]);

  const projects = array(overview?.projects);
  const connectors = array(overview?.connectors);
  const approvals = array(overview?.approvals);
  const auditLogs = array(overview?.auditLogs);
  const memoryCounts = record(overview?.memoryCounts);

  async function loadProject(id: string) {
    try { setSelectedProject(await call("GET", `?view=project&id=${encodeURIComponent(id)}`)); }
    catch (error) { setNotice(error instanceof Error ? error.message : "프로젝트를 불러오지 못했습니다."); }
  }
  async function startPreview() {
    setWorking(true);
    try {
      const next = await call("POST", "", { action: "seed-preview" });
      setPreview(next);
      setSelectedItems(new Set(array(next.items).filter((item) => item.recommended_action === "import").map((item) => String(item.id))));
      setNotice(null);
    } catch (error) { setNotice(error instanceof Error ? error.message : "미리보기를 만들지 못했습니다."); }
    finally { setWorking(false); }
  }
  async function commitPreview() {
    const batchId = record(preview?.batch).id;
    if (typeof batchId !== "string") return;
    setWorking(true);
    try {
      const result = await call("POST", "", { action: "seed-commit", batchId, selectedItemIds: [...selectedItems] });
      setNotice(`가져오기 완료: ${result.imported || 0}개 저장, ${result.skipped || 0}개 제외, ${result.failed || 0}개 실패`);
      setPreview(null);
      await loadOverview();
    } catch (error) { setNotice(error instanceof Error ? error.message : "가져오기를 완료하지 못했습니다."); }
    finally { setWorking(false); }
  }
  async function decideApproval(id: string, status: "approved" | "rejected") {
    setWorking(true);
    try { await call("POST", "", { action: "approval-update", approvalId: id, status }); await loadOverview(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "승인 상태를 바꾸지 못했습니다."); }
    finally { setWorking(false); }
  }

  if (loading) return <div className="workspace-empty"><strong>개인 컨텍스트를 불러오는 중입니다.</strong></div>;
  return <div className="context-control-page">
    {notice ? <div className="workspace-notice"><span>{notice}</span><button type="button" onClick={() => setNotice(null)}>닫기</button></div> : null}
    {mode === "projects" && <ProjectsView projects={projects} selectedProject={selectedProject} onOpen={loadProject} />}
    {mode === "import" && <ImportView preview={preview} selected={selectedItems} working={working} counts={memoryCounts} onStart={() => void startPreview()} onToggle={(id) => setSelectedItems((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; })} onCommit={() => void commitPreview()} />}
    {mode === "sensitive" && <SensitiveView count={number(memoryCounts.sensitive)} onImport={() => { window.location.href = "/memory/context-import"; }} />}
    {mode === "connections" && <ConnectionsView connectors={connectors} />}
    {mode === "approvals" && <ApprovalsView approvals={approvals} auditLogs={auditLogs} working={working} onDecide={decideApproval} />}
  </div>;
}

function ProjectsView({ projects, selectedProject, onOpen }: { projects: JsonRecord[]; selectedProject: JsonRecord | null; onOpen: (id: string) => void }) {
  return <div className="context-two-column"><section className="context-section"><header><div><p>Project Registry</p><h2>프로젝트</h2></div><span>{projects.length}</span></header>{projects.length ? <div className="context-list">{projects.map((project) => <button type="button" className="context-row" key={String(project.id)} onClick={() => onOpen(String(project.id))}><FolderKanban /><span><strong>{String(project.name)}</strong><small>{String(project.status)} · {String(project.priority)}</small></span><em>{array(project.project_resources).length} resources</em></button>)}</div> : <Empty text="아직 등록된 프로젝트가 없습니다. 컨텍스트 가져오기에서 검토 후 등록할 수 있습니다." />}</section><section className="context-section context-detail"><header><div><p>Selected project</p><h2>{selectedProject ? String(selectedProject.name) : "프로젝트 선택"}</h2></div></header>{selectedProject ? <ProjectDetail project={selectedProject} /> : <Empty text="프로젝트를 선택하면 별칭, 리소스, 최신 프로젝트 컨텍스트를 확인합니다." />}</section></div>;
}

function ProjectDetail({ project }: { project: JsonRecord }) {
  const resources = array(project.project_resources);
  const aliases = array(project.context_project_aliases);
  const memories = array(project.project_context_memories);
  return <div className="context-detail-body"><p>{String(project.description || "설명이 없습니다.")}</p><div className="context-chip-row">{aliases.map((alias) => <span key={String(alias.id || alias.alias)}>{String(alias.alias)}</span>)}</div><h3>리소스</h3>{resources.length ? resources.map((resource) => <a key={String(resource.id)} href={String(resource.url)} target="_blank" rel="noreferrer" className="context-resource"><span><strong>{String(resource.label)}</strong><small>{String(resource.resource_type)} · {String(resource.health_status)}</small></span><ExternalLink /></a>) : <Empty text="등록된 리소스가 없습니다." />}<h3>프로젝트 컨텍스트</h3>{memories.length ? memories.slice(0, 5).map((memory) => <article key={String(memory.id)} className="context-memory"><strong>{String(memory.title)}</strong><p>{String(memory.content)}</p></article>) : <Empty text="가져온 프로젝트 컨텍스트가 없습니다." />}</div>;
}

function ImportView({ preview, selected, working, counts, onStart, onToggle, onCommit }: { preview: JsonRecord | null; selected: Set<string>; working: boolean; counts: JsonRecord; onStart: () => void; onToggle: (id: string) => void; onCommit: () => void }) {
  const items = array(preview?.items);
  if (!preview) return <section className="context-section"><header><div><p>Preview first</p><h2>개인 컨텍스트 seed</h2></div><Import /></header><p className="context-intro">기존 저장 데이터는 변경하지 않습니다. seed 항목을 미리 보고, 선택한 항목만 새로운 분리 저장소에 가져옵니다. 민감 항목은 기본으로 선택되지 않습니다.</p><div className="context-stat-grid">{["identity", "preference", "project", "operational", "sensitive"].map((key) => <div key={key}><span>{key}</span><strong>{number(counts[key])}</strong></div>)}</div><button type="button" className="workspace-primary-button" disabled={working} onClick={onStart}><Import /> {working ? "미리보기 준비 중" : "seed 미리보기"}</button></section>;
  return <section className="context-section"><header><div><p>Review before saving</p><h2>가져올 항목 선택</h2></div><span>{selected.size} selected</span></header><div className="context-import-list">{items.map((item) => { const id = String(item.id); const isSelected = selected.has(id); return <label key={id} className={`context-import-row ${isSelected ? "is-selected" : ""}`}><input type="checkbox" checked={isSelected} onChange={() => onToggle(id)} /><span><strong>{String(record(item.payload).title || item.item_type)}</strong><small>{String(item.item_type)} · 권장: {String(item.recommended_action)}</small></span>{isSelected ? <Check /> : null}</label>; })}</div><div className="context-actions"><button type="button" className="workspace-primary-button" disabled={working || selected.size === 0} onClick={onCommit}>{working ? "저장 중" : `${selected.size}개 저장`}</button></div></section>;
}

function SensitiveView({ count, onImport }: { count: number; onImport: () => void }) { return <section className="context-section"><header><div><p>Isolated storage</p><h2>민감 메모리</h2></div><KeyRound /></header><p className="context-intro">현재 {count}개의 민감 메모리가 별도 저장소에 있습니다. 이 데이터는 일반 프로젝트 resolver나 채팅 프롬프트에 자동 주입되지 않습니다.</p><button type="button" className="workspace-secondary-button" onClick={onImport}>검토할 항목 열기</button></section>; }
function ConnectionsView({ connectors }: { connectors: JsonRecord[] }) { const defaults = connectors.length ? connectors : [{ connector_type: "public_web", display_name: "Public Web", status: "not_connected", scopes: ["safe public read"] }, { connector_type: "github", display_name: "GitHub", status: "not_connected", scopes: ["public repository read"] }, { connector_type: "vercel", display_name: "Vercel", status: "not_connected", scopes: [] }, { connector_type: "supabase", display_name: "Supabase", status: "not_connected", scopes: [] }, { connector_type: "google", display_name: "Google", status: "not_connected", scopes: [] }, { connector_type: "youtube", display_name: "YouTube", status: "not_connected", scopes: [] }]; return <section className="context-section"><header><div><p>Connector registry</p><h2>연결 상태</h2></div><RefreshCw /></header><div className="context-connector-grid">{defaults.map((connector) => <article key={String(connector.connector_type)}><span className={`context-status is-${String(connector.status)}`} /><div><strong>{String(connector.display_name)}</strong><small>{String(connector.status)}</small></div><em>{array(connector.scopes).join(", ") || "No delegated access"}</em></article>)}</div><p className="context-footnote">OAuth 토큰과 API 키는 이 레지스트리에 저장하지 않습니다. 연결 기능은 별도 승인 흐름을 거쳐 추가됩니다.</p></section>; }
function ApprovalsView({ approvals, auditLogs, working, onDecide }: { approvals: JsonRecord[]; auditLogs: JsonRecord[]; working: boolean; onDecide: (id: string, status: "approved" | "rejected") => void }) { return <div className="context-two-column"><section className="context-section"><header><div><p>Approval required</p><h2>대기 중인 승인</h2></div><ShieldCheck /></header>{approvals.length ? <div className="context-list">{approvals.map((approval) => <article className="context-approval" key={String(approval.id)}><strong>{String(approval.action_summary)}</strong><small>{String(approval.capability)} · {String(approval.permission_level)}</small>{approval.status === "pending" ? <div><button type="button" className="workspace-primary-button" disabled={working} onClick={() => onDecide(String(approval.id), "approved")}>승인</button><button type="button" className="workspace-secondary-button" disabled={working} onClick={() => onDecide(String(approval.id), "rejected")}>거절</button></div> : <em>{String(approval.status)}</em>}</article>)}</div> : <Empty text="현재 사용자의 확인을 기다리는 작업이 없습니다." />}</section><section className="context-section"><header><div><p>Safe audit trail</p><h2>최근 감사 로그</h2></div></header>{auditLogs.length ? <div className="context-list">{auditLogs.map((entry) => <article className="context-audit" key={String(entry.id)}><strong>{String(entry.action_summary)}</strong><small>{String(entry.capability)} · {formatDate(entry.created_at)}</small><em>{String(entry.status)}</em></article>)}</div> : <Empty text="아직 기록된 실행 로그가 없습니다." />}</section></div>; }
function Empty({ text }: { text: string }) { return <div className="workspace-empty"><p>{text}</p></div>; }
function array(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter((item): item is JsonRecord => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : []; }
function record(value: unknown): JsonRecord { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {}; }
function number(value: unknown) { return typeof value === "number" ? value : 0; }
function formatDate(value: unknown) { return typeof value === "string" ? new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric" }).format(new Date(value)) : ""; }
