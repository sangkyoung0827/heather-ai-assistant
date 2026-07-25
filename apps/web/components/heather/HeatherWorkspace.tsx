"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { BookOpen, BrainCircuit, Command, Database, Factory, FolderKanban, Home, Laptop, MessageSquare, Settings, Sparkles } from "lucide-react";
import type { MemoryRecord, ProjectRecord } from "@heather/core";
import { useHeatherData } from "../../lib/use-heather-data";
import { registerHeatherServiceWorker } from "../../lib/pwa";
import { AnalysisPanel } from "./panels/AnalysisPanel";
import { BriefingPanel } from "./panels/BriefingPanel";
import { ChatPanel } from "./panels/ChatPanel";
import { DirectCommandRegistrationPanel } from "./panels/DirectCommandRegistrationPanel";
import { BulkDirectCommandImportPanel } from "./panels/BulkDirectCommandImportPanel";
import { LocalControlPanel } from "./panels/LocalControlPanel";
import { MemoryPanel } from "./panels/MemoryPanel";
import { SettingsPanel } from "./panels/SettingsPanel";
import { ProcessPanel } from "./panels/ProcessPanel";
import { ResearchChatPanel } from "./panels/ResearchChatPanel";

type WorkspaceId = "dashboard" | "chat" | "direct" | "personal" | "research" | "researcher" | "local" | "settings";
export type HeatherView = "briefing" | "chat" | "projects" | "memory" | "automation" | "direct_commands" | "local_control" | "training" | "analysis" | "settings";
type Node = { id: WorkspaceId; label: string; detail: string; icon: LucideIcon; x: number; y: number; path: string };

const NODES: Node[] = [
  { id: "dashboard", label: "Dashboard", detail: "Overview & insights", icon: Home, x: 500, y: 88, path: "/dashboard" },
  { id: "direct", label: "Direct Command Registration", detail: "Safe local actions", icon: Command, x: 210, y: 330, path: "/direct-commands" },
  { id: "chat", label: "Chat", detail: "Conversation layer", icon: MessageSquare, x: 790, y: 330, path: "/chat" },
  { id: "personal", label: "Personal Memory", detail: "Private recall", icon: Database, x: 300, y: 555, path: "/memory/personal" },
  { id: "research", label: "Research Memory", detail: "Research context", icon: FolderKanban, x: 700, y: 555, path: "/memory/research" },
  { id: "researcher", label: "Researcher", detail: "Materials & records", icon: BrainCircuit, x: 500, y: 625, path: "/researcher" }
];

function workspaceForPath(pathname: string): WorkspaceId {
  if (pathname.startsWith("/chat")) return "chat";
  if (pathname.startsWith("/direct-commands")) return "direct";
  if (pathname.startsWith("/memory/research")) return "research";
  if (pathname.startsWith("/memory/personal")) return "personal";
  if (pathname.startsWith("/researcher")) return "researcher";
  if (pathname.startsWith("/local-control")) return "local";
  if (pathname.startsWith("/settings")) return "settings";
  return "dashboard";
}

export function HeatherWorkspace() {
  const data = useHeatherData();
  const pathname = usePathname();
  const router = useRouter();
  const workspace = workspaceForPath(pathname);
  const activeNode = NODES.find((node) => node.id === workspace) ?? NODES[0];
  const activeProjects = useMemo(() => data.projects.filter((project) => project.status === "active" || project.status === "blocked"), [data.projects]);
  const activeMemories = data.memories.filter((memory) => !memory.archived);
  useEffect(() => { registerHeatherServiceWorker(); }, []);
  const navigate = (path: string) => router.push(path);

  return <main className="heather-hud"><div className="heather-app-shell">
    <GlobalRail active={workspace} onNavigate={navigate} />
    <div className="heather-main-column">
      {workspace === "dashboard" ? <DashboardHome node={activeNode} projects={activeProjects} memories={activeMemories} conversations={data.conversations.length} onNavigate={navigate} /> : <WorkspacePage workspace={workspace} pathname={pathname} node={activeNode} data={data} onNavigate={navigate} />}
    </div>
  </div></main>;
}

function GlobalRail({ active, onNavigate }: { active: WorkspaceId; onNavigate: (path: string) => void }) {
  return <aside className="heather-icon-rail" aria-label="Heather navigation"><button type="button" className="rail-brand" onClick={() => onNavigate("/dashboard")} aria-label="Heather home"><Sparkles /></button><div className="rail-actions">{NODES.map((node) => <RailButton key={node.id} icon={node.icon} label={node.label} active={active === node.id} onClick={() => onNavigate(node.path)} />)}</div><div className="rail-bottom"><RailButton icon={Laptop} label="Local control" active={active === "local"} onClick={() => onNavigate("/local-control")} /><RailButton icon={Settings} label="Settings" active={active === "settings"} onClick={() => onNavigate("/settings")} /></div></aside>;
}

function DashboardHome({ node, projects, memories, conversations, onNavigate }: { node: Node; projects: ProjectRecord[]; memories: MemoryRecord[]; conversations: number; onNavigate: (path: string) => void }) {
  return <><header className="heather-topbar"><div className="heather-title"><Sparkles className="h-4 w-4" /><span>Heather AI</span></div><div className="heather-ready is-ready"><span />Ready</div></header><section className="heather-hub-layout"><section className="neural-interface" aria-label="Heather neural navigation"><NeuralLines /> <button type="button" className="neural-core" onClick={() => onNavigate("/dashboard")}><span className="neural-core-orbit orbit-one" /><span className="neural-core-orbit orbit-two" /><span className="neural-core-face"><Sparkles className="h-6 w-6" /><strong>Heather</strong><small>AI hub</small></span></button>{NODES.map((item) => <NodeButton key={item.id} node={item} active={item.id === node.id} onClick={() => onNavigate(item.path)} />)}</section><DashboardSummary projects={projects} memories={memories} conversations={conversations} onNavigate={onNavigate} /></section></>;
}

function WorkspacePage({ workspace, pathname, node, data, onNavigate }: { workspace: WorkspaceId; pathname: string; node: Node; data: ReturnType<typeof useHeatherData>; onNavigate: (path: string) => void }) {
  const meta: Record<WorkspaceId, [string, string]> = { dashboard: ["Dashboard", "Heather의 전체 구조와 최근 활동을 확인하세요."], chat: ["채팅", "Heather와 대화하며 작업을 요청하세요."], direct: ["직접명령 등록", "반복되는 질문과 응답을 저장하고 관리하세요."], personal: ["개인 메모리", "개인 정보, 관계, 선호와 결정을 관리하세요."], research: ["연구 메모리", "연구 맥락과 기록을 분리해 관리하세요."], researcher: ["Researcher", "연구자료 등록과 연구 기록을 관리하세요."], local: ["Local Control", "안전한 로컬 기능을 관리하세요."], settings: ["Settings", "Heather 환경을 설정하세요."] };
  const [defaultTitle, defaultDescription] = meta[workspace];
  const isBulkImport = pathname.startsWith("/direct-commands/bulk-import");
  const researcherMode = pathname.startsWith("/researcher/chat") ? "chat" : pathname.startsWith("/researcher/materials") ? "materials" : pathname.startsWith("/researcher/memory") ? "memory" : pathname.startsWith("/researcher/process") ? "process" : "home";
  const researcherMeta: Record<typeof researcherMode, [string, string]> = { home: ["Heather Researcher", "연구자료, 실험 기록과 생산 공정을 분석하는 전문 작업 공간입니다."], chat: ["Heather Researcher", "연구 자료와 기록을 근거로 분석을 진행하세요."], materials: ["연구자료", "RAG 연구자료 연결은 준비 중입니다."], memory: ["연구 메모리", "검증된 연구 맥락과 기록을 분리해 관리하세요."], process: ["생산 공정", "수동 기록과 분석만 허용되는 안전한 공정 작업 공간입니다."] };
  const [title, description] = isBulkImport ? ["직접명령 대량 등록", "Heather 표준 TXT 파일을 업로드하여 다수의 명령을 한 번에 등록합니다."] : workspace === "researcher" ? researcherMeta[researcherMode] : [defaultTitle, defaultDescription];
  return <><header className="workspace-topbar"><button type="button" className="workspace-breadcrumb" onClick={() => onNavigate("/dashboard")}><Home className="h-4 w-4" /> Dashboard</button><div><h1>{title}</h1><p>{description}</p></div></header>{workspace === "researcher" && <nav className="flex flex-wrap gap-2 border-b border-line px-6 py-3" aria-label="Researcher navigation">{[{ id: "home", label: "연구원 홈", path: "/researcher", icon: BrainCircuit }, { id: "chat", label: "연구원 채팅", path: "/researcher/chat", icon: MessageSquare }, { id: "materials", label: "연구자료", path: "/researcher/materials", icon: BookOpen }, { id: "memory", label: "연구 메모리", path: "/researcher/memory", icon: Database }, { id: "process", label: "생산 공정", path: "/researcher/process", icon: Factory }].map((item) => { const Icon = item.icon; return <button key={item.id} type="button" onClick={() => onNavigate(item.path)} className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold ${researcherMode === item.id ? "bg-heather-700 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}><Icon className="h-4 w-4" />{item.label}</button>; })}</nav>}<section className="workspace-canvas">{!data.ready ? <div className="workbench-loading">Heather 작업공간을 불러오는 중입니다.</div> : <>{workspace === "chat" && <ChatPanel conversations={data.conversations} memories={data.memories} projects={data.projects} teachings={data.teachings} automationRecipes={data.automationRecipes} settings={data.settings} onSaveConversation={data.saveConversation} onDeleteConversation={data.deleteConversation} onSaveMemory={data.saveMemory} onSaveSettings={data.saveSettings} />}{workspace === "direct" && (isBulkImport ? <BulkDirectCommandImportPanel /> : <DirectCommandRegistrationPanel />)}{workspace === "personal" && <MemoryPanel variant="personal" memories={data.memories} onSaveMemory={data.saveMemory} onDeleteMemory={data.deleteMemory} />}{workspace === "research" && <MemoryPanel variant="research" memories={data.memories} onSaveMemory={data.saveMemory} onDeleteMemory={data.deleteMemory} />}{workspace === "researcher" && researcherMode === "home" && <AnalysisPanel memories={data.memories} onSaveMemory={data.saveMemory} />}{workspace === "researcher" && researcherMode === "chat" && <ResearchChatPanel memories={data.memories} projects={data.projects} settings={data.settings} />}{workspace === "researcher" && researcherMode === "memory" && <MemoryPanel variant="research" memories={data.memories} onSaveMemory={data.saveMemory} onDeleteMemory={data.deleteMemory} />}{workspace === "researcher" && researcherMode === "materials" && <ResearchEmptyPanel title="연구자료 연결 준비 중" description="RAG 연결 전에는 연구자료를 자동으로 찾거나 분석했다고 주장하지 않습니다." />}{workspace === "researcher" && researcherMode === "process" && <ProcessPanel />}{workspace === "local" && <LocalControlPanel settings={data.settings} onSaveSettings={data.saveSettings} />}{workspace === "settings" && <SettingsPanel settings={data.settings} onSaveSettings={data.saveSettings} onClearAll={data.clearAll} />}</>}</section></>;
}

function ResearchEmptyPanel({ title, description }: { title: string; description: string }) { return <div className="workspace-empty"><strong>{title}</strong><p>{description}</p></div>; }

function NeuralLines() { return <svg className="neural-lines" viewBox="0 0 1000 760" aria-hidden="true">{NODES.map((node) => <line key={node.id} x1="500" y1="330" x2={node.x} y2={node.y} />)}<circle cx="500" cy="330" r="126" /><circle cx="500" cy="330" r="172" className="neural-dash" /></svg>; }
function NodeButton({ node, active, onClick }: { node: Node; active: boolean; onClick: () => void }) { const Icon = node.icon; return <button type="button" onClick={onClick} className={`neural-node ${active ? "is-active" : ""}`} style={{ left: `${node.x / 10}%`, top: `${node.y / 7.6}%` }}><span className="neural-node-dot"><Icon className="h-5 w-5" /></span><span className="neural-node-copy"><strong>{node.label}</strong><small>{node.detail}</small></span></button>; }
function RailButton({ icon: Icon, label, active, onClick }: { icon: LucideIcon; label: string; active: boolean; onClick: () => void }) { return <button type="button" className={active ? "is-active" : ""} onClick={onClick} aria-label={label} title={label}><Icon /></button>; }
function DashboardSummary({ projects, memories, conversations, onNavigate }: { projects: ProjectRecord[]; memories: MemoryRecord[]; conversations: number; onNavigate: (path: string) => void }) { return <aside className="hub-summary"><div className="summary-title"><div><h2>Dashboard</h2><p>Today, stay focused</p></div><span className="summary-icon"><Home className="h-4 w-4" /></span></div><SummaryCard title="Today’s priorities" count={Math.min(projects.length || 3, 3)}><SummaryRows items={projects.slice(0, 3).map((project) => project.next_actions[0] || project.title)} fallback={["Review your next deadline", "Write the next concrete action", "Check active project context"]} /></SummaryCard><SummaryCard title="Ongoing projects" count={projects.length}><ul className="summary-projects">{projects.slice(0, 3).map((project) => <li key={project.id}><FolderKanban className="h-4 w-4" /><span>{project.title}</span><small>{project.status}</small></li>)}</ul></SummaryCard><SummaryCard title="Key memory"><p className="summary-copy">{memories[0]?.content || "Heather will keep useful context here as you work."}</p><button type="button" className="summary-link" onClick={() => onNavigate("/memory/personal")}>Open Memory <span>›</span></button></SummaryCard><p className="summary-footer">{conversations} saved conversations</p></aside>; }
function SummaryCard({ title, count, children }: { title: string; count?: number; children: ReactNode }) { return <section className="summary-card"><div className="summary-card-title"><h3>{title}</h3>{typeof count === "number" && <span>{count}</span>}</div>{children}</section>; }
function SummaryRows({ items, fallback }: { items: string[]; fallback: string[] }) { return <ul className="summary-rows">{(items.length ? items : fallback).map((item) => <li key={item}><span />{item}</li>)}</ul>; }
