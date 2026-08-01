"use client";

import { useEffect, useMemo, type CSSProperties, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import type { LucideIcon } from "lucide-react";
import { Bell, BookOpen, BrainCircuit, Check, Command, Database, Factory, FolderKanban, Home, Laptop, MessageSquare, Palette, PlugZap, Settings, ShieldCheck } from "lucide-react";
import type { HeatherAvatarVariant, MemoryRecord, ProjectRecord } from "@heather/core";
import { useHeatherData } from "../../lib/use-heather-data";
import { getHeatherMessages } from "../../lib/i18n";
import { registerHeatherServiceWorker } from "../../lib/pwa";
import { ChatPanel } from "./panels/ChatPanel";
import { DirectCommandRegistrationPanel } from "./panels/DirectCommandRegistrationPanel";
import { BulkDirectCommandImportPanel } from "./panels/BulkDirectCommandImportPanel";
import { LocalControlPanel } from "./panels/LocalControlPanel";
import { MemoryPanel as BaseMemoryPanel } from "./panels/MemoryPanel";
import { SettingsPanel } from "./panels/SettingsPanel";
import { ProcessPanel } from "./panels/ProcessPanel";
import { ResearchChatPanel } from "./panels/ResearchChatPanel";
import { ResearchMaterialsPanel } from "./panels/ResearchMaterialsPanel";
import { ResearchMemoryPanel } from "./panels/ResearchMemoryPanel";
import { ContextControlPanel } from "./panels/ContextControlPanel";
import { QuickAccessPanel } from "./dashboard/QuickAccessPanel";
import { HEATHER_AVATARS, HeatherAvatar } from "./HeatherAvatar";

type WorkspaceId = "dashboard" | "chat" | "direct" | "personal" | "researcher" | "projects" | "connections" | "approvals" | "contextImport" | "sensitive" | "local" | "settings";
export type HeatherView = "briefing" | "chat" | "projects" | "memory" | "automation" | "direct_commands" | "local_control" | "training" | "analysis" | "settings";
type Node = { id: WorkspaceId; label: string; detail: string; icon: LucideIcon; x: number; y: number; path: string };

const NODES: Node[] = [
  { id: "dashboard", label: "Dashboard", detail: "Overview & insights", icon: Home, x: 500, y: 88, path: "/dashboard" },
  { id: "direct", label: "Direct Command Registration", detail: "Safe local actions", icon: Command, x: 210, y: 330, path: "/direct-commands" },
  { id: "chat", label: "Chat", detail: "Conversation layer", icon: MessageSquare, x: 790, y: 330, path: "/chat" },
  { id: "personal", label: "Personal Memory", detail: "Private recall", icon: Database, x: 300, y: 555, path: "/memory/personal" },
  { id: "researcher", label: "Researcher", detail: "Materials & records", icon: BrainCircuit, x: 500, y: 625, path: "/researcher/chat" }
];

function workspaceForPath(pathname: string): WorkspaceId {
  if (pathname.startsWith("/chat")) return "chat";
  if (pathname.startsWith("/direct-commands")) return "direct";
  if (pathname.startsWith("/memory/personal")) return "personal";
  if (pathname.startsWith("/memory/context-import")) return "contextImport";
  if (pathname.startsWith("/memory/sensitive")) return "sensitive";
  if (pathname.startsWith("/researcher")) return "researcher";
  if (pathname.startsWith("/projects")) return "projects";
  if (pathname.startsWith("/connections")) return "connections";
  if (pathname.startsWith("/approvals")) return "approvals";
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
  useEffect(() => { document.documentElement.lang = data.settings.defaultLanguage; }, [data.settings.defaultLanguage]);
  const navigate = (path: string) => router.push(path);

  const theme = ACCENT_THEMES[data.settings.accentColor] || ACCENT_THEMES.violet;
  return <main className="heather-hud" style={{ "--heather-accent": theme.accent, "--heather-accent-strong": theme.strong, "--heather-accent-soft": theme.soft, "--heather-accent-border": theme.border } as CSSProperties}><div className="heather-app-shell">
    <GlobalRail active={workspace} onNavigate={navigate} settings={data.settings} />
    <div className="heather-main-column">
      {workspace === "dashboard" ? <DashboardHome node={activeNode} projects={activeProjects} memories={activeMemories} conversations={data.conversations.length} onNavigate={navigate} settings={data.settings} onSaveSettings={data.saveSettings} auth={data.auth} /> : <WorkspacePage workspace={workspace} pathname={pathname} node={activeNode} data={data} onNavigate={navigate} />}
    </div>
  </div></main>;
}

function GlobalRail({ active, onNavigate, settings }: { active: WorkspaceId; onNavigate: (path: string) => void; settings: ReturnType<typeof useHeatherData>["settings"] }) {
  const t = getHeatherMessages(settings.defaultLanguage).rail;
  return <aside className="heather-icon-rail" aria-label="Heather navigation"><button type="button" className="rail-brand" onClick={() => onNavigate("/dashboard")} aria-label={t.home}><HeatherAvatar settings={settings} size="small" /></button><div className="rail-actions">{NODES.map((node) => <RailButton key={node.id} icon={node.icon} label={railLabel(node.id, t)} active={active === node.id} onClick={() => onNavigate(node.path)} />)}</div><div className="rail-bottom"><RailButton icon={Laptop} label={t.local} active={active === "local"} onClick={() => onNavigate("/local-control")} /><RailButton icon={Settings} label={t.settings} active={active === "settings"} onClick={() => onNavigate("/settings")} /></div></aside>;
}

function DashboardHome({ projects, memories, conversations, onNavigate, settings, onSaveSettings, auth }: { node: Node; projects: ProjectRecord[]; memories: MemoryRecord[]; conversations: number; onNavigate: (path: string) => void; settings: ReturnType<typeof useHeatherData>["settings"]; onSaveSettings: ReturnType<typeof useHeatherData>["saveSettings"]; auth: ReturnType<typeof useHeatherData>["auth"] }) {
  const researchMemories = memories.filter((memory) => memory.type === "project_context" || memory.source.startsWith("research"));
  const personalMemories = memories.length - researchMemories.length;
  const t = getHeatherMessages(settings.defaultLanguage).dashboard;
  const today = new Intl.DateTimeFormat(settings.defaultLanguage === "ko" ? "ko-KR" : "en-US", { month: "long", day: "numeric", weekday: "short" }).format(new Date());
  const saveAvatar = (avatarVariant: HeatherAvatarVariant) => void onSaveSettings({ ...settings, avatarVariant, iconStyle: "avatar" });
  const loginLabel = settings.defaultLanguage === "ko" ? "Google로 로그인" : "Sign in with Google";
  const accountLabel = auth.user?.email || (settings.defaultLanguage === "ko" ? "로그인됨" : "Signed in");

  return <section className="dashboard-layout"><aside className="dashboard-brand-panel"><HeatherAvatar settings={settings} size="large" /><div><p className="dashboard-eyebrow">{t.brand}</p><h1>Heather</h1><p>{t.tagline}</p></div><div className="brand-control"><div><strong>{t.avatar}</strong></div><p className="brand-control-hint">{t.avatarHint}</p><div className="avatar-picker" role="radiogroup" aria-label={t.avatar}>{HEATHER_AVATARS.map((avatar, index) => <button key={avatar.id} type="button" role="radio" aria-checked={settings.avatarVariant === avatar.id} aria-label={t.faces[index]} title={t.faces[index]} className={settings.avatarVariant === avatar.id ? "is-active" : ""} onClick={() => saveAvatar(avatar.id)}><Image src={avatar.src} alt="" width={96} height={96} sizes="64px" /><span className="sr-only">{t.faces[index]}</span>{settings.avatarVariant === avatar.id ? <Check aria-hidden="true" /> : null}</button>)}</div></div><div className="brand-control"><div><strong>{t.accent}</strong><Palette className="h-4 w-4" /></div><div className="accent-picker">{Object.entries(ACCENT_THEMES).map(([name, theme]) => <button key={name} type="button" title={name} aria-label={name} className={settings.accentColor === name ? "is-active" : ""} style={{ "--swatch": theme.accent } as CSSProperties} onClick={() => void onSaveSettings({ ...settings, accentColor: name as keyof typeof ACCENT_THEMES })}><span />{settings.accentColor === name ? <Check aria-hidden="true" /> : null}</button>)}</div></div><div className="brand-control"><div><strong>{t.language}</strong></div><div className="language-picker" role="radiogroup" aria-label={t.language}>{(["ko", "en"] as const).map((locale) => <button key={locale} type="button" role="radio" aria-checked={settings.defaultLanguage === locale} className={settings.defaultLanguage === locale ? "is-active" : ""} onClick={() => void onSaveSettings({ ...settings, defaultLanguage: locale })}>{locale === "ko" ? "한국어" : "English"}</button>)}</div></div><small className="brand-note">{t.saved}</small></aside><section className="dashboard-workspace"><header className="dashboard-header"><div><p className="dashboard-eyebrow">{today}</p><h2>{t.workspace}</h2></div><div>{auth.ready && !auth.user && auth.configured ? <button type="button" className="dashboard-login" onClick={() => void auth.signInWithGoogle()}>{loginLabel}</button> : null}{auth.ready && auth.user ? <span className="dashboard-account" title={accountLabel}>{accountLabel}</span> : null}<button type="button" className="dashboard-command" onClick={() => onNavigate("/chat")}>{t.ask}</button><span className="dashboard-connection"><Bell className="h-3.5 w-3.5" /> {t.connected}</span></div></header><div className="dashboard-metrics"><DashboardMetric icon={Command} label={t.direct} value={t.manage} detail={t.directDetail} onClick={() => onNavigate("/direct-commands")} /><DashboardMetric icon={Database} label={t.personal} value={String(personalMemories)} detail={personalMemories ? t.personalDetail : t.personalEmpty} onClick={() => onNavigate("/memory/personal")} /><DashboardMetric icon={BrainCircuit} label={t.research} value={String(researchMemories.length)} detail={researchMemories.length ? t.researchDetail : t.researchEmpty} onClick={() => onNavigate("/researcher/memory")} /><DashboardMetric icon={MessageSquare} label={t.conversations} value={String(conversations)} detail={conversations ? t.continue : t.conversationsEmpty} onClick={() => onNavigate("/chat")} /></div><div className="dashboard-columns"><DashboardPanel title={t.priorities} action={t.openProjects} onAction={() => onNavigate("/researcher")}>{projects.length ? <ul>{projects.slice(0, 4).map((project) => <li key={project.id}><span /><div><strong>{project.title}</strong><small>{project.next_actions[0] || t.nextAction}</small></div><em>{project.status}</em></li>)}</ul> : <EmptyState text={t.noProjects} />}</DashboardPanel><DashboardPanel title={t.researchStatus} action={t.openResearcher} onAction={() => onNavigate("/researcher")}>{researchMemories.length ? <ul>{researchMemories.slice(0, 4).map((memory) => <li key={memory.id}><span className="research-dot" /><div><strong>{memory.source || t.researchMemory}</strong><small>{memory.content.slice(0, 65)}</small></div></li>)}</ul> : <EmptyState text={t.noResearch} />}</DashboardPanel><QuickAccessPanel locale={settings.defaultLanguage} auth={auth}><DashboardControlLinks onNavigate={onNavigate} /></QuickAccessPanel></div></section></section>;
}

const ACCENT_THEMES = { violet: { accent: "#a78bfa", strong: "#7c5ce6", soft: "rgba(167,139,250,.15)", border: "rgba(167,139,250,.48)" }, blue: { accent: "#60a5fa", strong: "#3b82f6", soft: "rgba(96,165,250,.15)", border: "rgba(96,165,250,.48)" }, cyan: { accent: "#22d3ee", strong: "#0891b2", soft: "rgba(34,211,238,.14)", border: "rgba(34,211,238,.45)" }, emerald: { accent: "#34d399", strong: "#059669", soft: "rgba(52,211,153,.14)", border: "rgba(52,211,153,.45)" }, amber: { accent: "#fbbf24", strong: "#d97706", soft: "rgba(251,191,36,.14)", border: "rgba(251,191,36,.45)" }, slate: { accent: "#94a3b8", strong: "#64748b", soft: "rgba(148,163,184,.15)", border: "rgba(148,163,184,.45)" } };
function DashboardMetric({ icon: Icon, label, value, detail, onClick }: { icon: LucideIcon; label: string; value: string; detail: string; onClick: () => void }) { return <button type="button" onClick={onClick} className="dashboard-metric"><span><Icon className="h-4 w-4" />{label}</span><strong>{value}</strong><small>{detail}</small></button>; }
function DashboardPanel({ title, action, onAction, children }: { title: string; action: string; onAction: () => void; children: ReactNode }) { return <section className="dashboard-panel"><header><h3>{title}</h3><button type="button" onClick={onAction}>{action} ›</button></header>{children}</section>; }
function EmptyState({ text }: { text: string }) { return <p className="dashboard-empty">{text}</p>; }
function DashboardControlLinks({ onNavigate }: { onNavigate: (path: string) => void }) { const items = [{ label: "Projects", icon: FolderKanban, path: "/projects" }, { label: "Connections", icon: PlugZap, path: "/connections" }, { label: "Approval center", icon: ShieldCheck, path: "/approvals" }]; return <div className="dashboard-control-links"><span>Control center</span><div>{items.map((item) => { const Icon = item.icon; return <button key={item.path} type="button" onClick={() => onNavigate(item.path)}><Icon className="h-4 w-4" />{item.label}</button>; })}</div></div>; }

function railLabel(id: WorkspaceId, rail: ReturnType<typeof getHeatherMessages>["rail"]) {
  if (id === "projects") return "Projects";
  if (id === "connections") return "Connections";
  if (id === "approvals") return "Approvals";
  if (id === "contextImport") return "Context import";
  if (id === "sensitive") return "Sensitive memory";
  return rail[id === "direct" ? "direct" : id];
}

function WorkspacePage({ workspace, pathname, node, data, onNavigate }: { workspace: WorkspaceId; pathname: string; node: Node; data: ReturnType<typeof useHeatherData>; onNavigate: (path: string) => void }) {
  const meta: Record<WorkspaceId, [string, string]> = { dashboard: ["Dashboard", "Heather의 전체 구조와 최근 활동을 확인하세요."], chat: ["채팅", "Heather와 대화하며 작업을 요청하세요."], direct: ["직접명령 등록", "반복되는 질문과 응답을 저장하고 관리하세요."], personal: ["개인 메모리", "개인 정보, 관계, 선호와 결정을 관리하세요."], researcher: ["Researcher", "연구자료 등록과 연구 기록을 관리하세요."], projects: ["프로젝트", "프로젝트, 별칭, 리소스를 안전하게 관리하세요."], connections: ["연결", "권한이 필요한 외부 연결을 확인하세요."], approvals: ["승인 센터", "실행 전 확인과 감사 기록을 관리하세요."], contextImport: ["개인 컨텍스트 가져오기", "검토한 seed 항목만 저장합니다."], sensitive: ["민감 메모리", "일반 채팅과 분리된 민감 컨텍스트입니다."], local: ["Local Control", "안전한 로컬 기능을 관리하세요."], settings: ["Settings", "Heather 환경을 설정하세요."] };
  const isEnglish = data.settings.defaultLanguage === "en";
  const [defaultTitle, defaultDescription] = workspace === "direct" && isEnglish ? ["Direct Command", "Create and manage reusable fixed responses."] : meta[workspace];
  const isBulkImport = pathname.startsWith("/direct-commands/bulk-import");
  const researcherMode = pathname.startsWith("/researcher/materials") ? "materials" : pathname.startsWith("/researcher/memory") ? "memory" : pathname.startsWith("/researcher/process") ? "process" : "chat";
  const researcherMeta: Record<typeof researcherMode, [string, string]> = { chat: ["Heather Researcher", "연구 자료와 기록을 근거로 분석을 진행하세요."], materials: ["연구자료", "RAG 연구자료 연결은 준비 중입니다."], memory: ["연구 메모리", "검증된 연구 맥락과 기록을 분리해 관리하세요."], process: ["생산 공정", "수동 기록과 분석만 허용되는 안전한 공정 작업 공간입니다."] };
  const [title, description] = isBulkImport ? (isEnglish ? ["Bulk Import", "Review TXT, Markdown, JSON, CSV, PDF, or DOCX command files before registration."] : ["직접명령 대량 등록", "TXT, Markdown, JSON, CSV, PDF, DOCX 명령 파일을 검수 후 등록합니다."]) : workspace === "researcher" ? researcherMeta[researcherMode] : [defaultTitle, defaultDescription];
  const researcherItems = isEnglish ? [{ id: "chat", label: "Research chat", path: "/researcher/chat", icon: MessageSquare }, { id: "materials", label: "Research materials", path: "/researcher/materials", icon: BookOpen }, { id: "memory", label: "Research memory", path: "/researcher/memory", icon: Database }, { id: "process", label: "Process management", path: "/researcher/process", icon: Factory }] : [{ id: "chat", label: "연구원 채팅", path: "/researcher/chat", icon: MessageSquare }, { id: "materials", label: "연구자료", path: "/researcher/materials", icon: BookOpen }, { id: "memory", label: "연구 메모리", path: "/researcher/memory", icon: Database }, { id: "process", label: "생산 공정관리", path: "/researcher/process", icon: Factory }];
  return <div className={workspace === "researcher" ? "researcher-page" : undefined}>{workspace === "researcher" ? <header className="researcher-shell-header"><div><span>Heather Researcher</span><h1>{isEnglish ? "A research partner for experiments, analysis, and production data" : "연구와 실험, 생산 데이터를 함께 분석하는 연구 파트너"}</h1></div><nav className="researcher-tabs" aria-label="Researcher navigation">{researcherItems.map((item) => { const Icon = item.icon; return <button key={item.id} type="button" onClick={() => onNavigate(item.path)} className={researcherMode === item.id ? "is-active" : ""}><Icon />{item.label}</button>; })}</nav></header> : <header className="workspace-topbar"><button type="button" className="workspace-breadcrumb" onClick={() => onNavigate("/dashboard")}><Home className="h-4 w-4" /> Dashboard</button><div><h1>{title}</h1><p>{description}</p></div></header>}<section className={`workspace-canvas ${workspace === "researcher" ? "researcher-canvas" : ""}`}>{!data.ready ? <div className="workbench-loading">Heather 작업공간을 불러오는 중입니다.</div> : <>{workspace === "chat" && <ChatPanel conversations={data.conversations} memories={data.memories} projects={data.projects} teachings={data.teachings} automationRecipes={data.automationRecipes} settings={data.settings} onSaveConversation={data.saveConversation} onDeleteConversation={data.deleteConversation} onMergeConversations={data.mergeConversations} onSaveMemory={data.saveMemory} onSaveSettings={data.saveSettings} />}{workspace === "direct" && (isBulkImport ? <BulkDirectCommandImportPanel locale={data.settings.defaultLanguage} /> : <DirectCommandRegistrationPanel locale={data.settings.defaultLanguage} />)}{workspace === "personal" && <MemoryPanel variant="personal" locale={data.settings.defaultLanguage} memories={data.memories} onSaveMemory={data.saveMemory} onDeleteMemory={data.deleteMemory} auth={data.auth} />}{workspace === "researcher" && researcherMode === "chat" && <ResearchChatPanel memories={data.memories} projects={data.projects} settings={data.settings} />}{workspace === "researcher" && researcherMode === "memory" && <MemoryPanel variant="research" locale={data.settings.defaultLanguage} memories={data.memories} onSaveMemory={data.saveMemory} onDeleteMemory={data.deleteMemory} auth={data.auth} />}{workspace === "researcher" && researcherMode === "materials" && <ResearchMaterialsPanel locale={data.settings.defaultLanguage} />}{workspace === "researcher" && researcherMode === "process" && <ProcessPanel />}{workspace === "projects" && <ContextControlPanel mode="projects" />}{workspace === "connections" && <ContextControlPanel mode="connections" />}{workspace === "approvals" && <ContextControlPanel mode="approvals" />}{workspace === "contextImport" && <ContextControlPanel mode="import" />}{workspace === "sensitive" && <ContextControlPanel mode="sensitive" />}{workspace === "local" && <LocalControlPanel settings={data.settings} onSaveSettings={data.saveSettings} />}{workspace === "settings" && <SettingsPanel settings={data.settings} onSaveSettings={data.saveSettings} onClearAll={data.clearAll} />}</>}</section></div>;
}

function ResearchEmptyPanel({ title, description }: { title: string; description: string }) { return <div className="workspace-empty"><strong>{title}</strong><p>{description}</p></div>; }

function MemoryPanel(props: React.ComponentProps<typeof BaseMemoryPanel>) {
  if (props.variant === "research" && props.auth) return <ResearchMemoryPanel locale={props.locale || "ko"} memories={props.memories} auth={props.auth} onSaveMemory={props.onSaveMemory} onDeleteMemory={props.onDeleteMemory} />;
  return <BaseMemoryPanel {...props} />;
}

function NeuralLines() { return <svg className="neural-lines" viewBox="0 0 1000 760" aria-hidden="true">{NODES.map((node) => <line key={node.id} x1="500" y1="330" x2={node.x} y2={node.y} />)}<circle cx="500" cy="330" r="126" /><circle cx="500" cy="330" r="172" className="neural-dash" /></svg>; }
function NodeButton({ node, active, onClick }: { node: Node; active: boolean; onClick: () => void }) { const Icon = node.icon; return <button type="button" onClick={onClick} className={`neural-node ${active ? "is-active" : ""}`} style={{ left: `${node.x / 10}%`, top: `${node.y / 7.6}%` }}><span className="neural-node-dot"><Icon className="h-5 w-5" /></span><span className="neural-node-copy"><strong>{node.label}</strong><small>{node.detail}</small></span></button>; }
function RailButton({ icon: Icon, label, active, onClick }: { icon: LucideIcon; label: string; active: boolean; onClick: () => void }) { return <button type="button" className={active ? "is-active" : ""} onClick={onClick} aria-label={label} title={label}><Icon /></button>; }
function DashboardSummary({ projects, memories, conversations, onNavigate }: { projects: ProjectRecord[]; memories: MemoryRecord[]; conversations: number; onNavigate: (path: string) => void }) { return <aside className="hub-summary"><div className="summary-title"><div><h2>Dashboard</h2><p>Today, stay focused</p></div><span className="summary-icon"><Home className="h-4 w-4" /></span></div><SummaryCard title="Today’s priorities" count={Math.min(projects.length || 3, 3)}><SummaryRows items={projects.slice(0, 3).map((project) => project.next_actions[0] || project.title)} fallback={["Review your next deadline", "Write the next concrete action", "Check active project context"]} /></SummaryCard><SummaryCard title="Ongoing projects" count={projects.length}><ul className="summary-projects">{projects.slice(0, 3).map((project) => <li key={project.id}><FolderKanban className="h-4 w-4" /><span>{project.title}</span><small>{project.status}</small></li>)}</ul></SummaryCard><SummaryCard title="Key memory"><p className="summary-copy">{memories[0]?.content || "Heather will keep useful context here as you work."}</p><button type="button" className="summary-link" onClick={() => onNavigate("/memory/personal")}>Open Memory <span>›</span></button></SummaryCard><p className="summary-footer">{conversations} saved conversations</p></aside>; }
function SummaryCard({ title, count, children }: { title: string; count?: number; children: ReactNode }) { return <section className="summary-card"><div className="summary-card-title"><h3>{title}</h3>{typeof count === "number" && <span>{count}</span>}</div>{children}</section>; }
function SummaryRows({ items, fallback }: { items: string[]; fallback: string[] }) { return <ul className="summary-rows">{(items.length ? items : fallback).map((item) => <li key={item}><span />{item}</li>)}</ul>; }
