"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BrainCircuit,
  Command,
  Database,
  FolderKanban,
  Home,
  Laptop,
  MessageSquare,
  Settings,
  Sparkles
} from "lucide-react";
import type { MemoryRecord, ProjectRecord } from "@heather/core";
import { PLATFORM_CAPABILITIES } from "@heather/core";
import { useHeatherData } from "../../lib/use-heather-data";
import { registerHeatherServiceWorker } from "../../lib/pwa";
import { AnalysisPanel } from "./panels/AnalysisPanel";
import { AutomationPanel } from "./panels/AutomationPanel";
import { BriefingPanel } from "./panels/BriefingPanel";
import { ChatPanel } from "./panels/ChatPanel";
import { DirectCommandRegistrationPanel } from "./panels/DirectCommandRegistrationPanel";
import { LocalControlPanel } from "./panels/LocalControlPanel";
import { MemoryPanel } from "./panels/MemoryPanel";
import { ProjectsPanel } from "./panels/ProjectsPanel";
import { SettingsPanel } from "./panels/SettingsPanel";
import { TrainingPanel } from "./panels/TrainingPanel";

export type HeatherView =
  | "briefing"
  | "chat"
  | "projects"
  | "memory"
  | "automation"
  | "direct_commands"
  | "local_control"
  | "training"
  | "analysis"
  | "settings";

type NeuralNodeId = "dashboard" | "direct" | "chat" | "personal_memory" | "research_memory" | "researcher";

interface NeuralNode {
  id: NeuralNodeId;
  label: string;
  detail: string;
  icon: LucideIcon;
  view: HeatherView;
  x: number;
  y: number;
}

type TauriEventWindow = Window & {
  __TAURI__?: { event?: { listen<T>(event: string, handler: (payload: { payload: T }) => void): Promise<() => void> } };
};

const CORE_POINT = { x: 500, y: 330 };

const NEURAL_NODES: NeuralNode[] = [
  { id: "dashboard", label: "Dashboard", detail: "Overview & insights", icon: Home, view: "briefing", x: 500, y: 88 },
  { id: "direct", label: "Direct Command Registration", detail: "Safe local actions", icon: Command, view: "direct_commands", x: 210, y: 330 },
  { id: "chat", label: "Chat", detail: "Conversation layer", icon: MessageSquare, view: "chat", x: 790, y: 330 },
  { id: "personal_memory", label: "Personal Memory", detail: "Private recall", icon: Database, view: "memory", x: 300, y: 555 },
  { id: "research_memory", label: "Research Memory", detail: "Research context", icon: FolderKanban, view: "memory", x: 700, y: 555 },
  { id: "researcher", label: "Researcher", detail: "Materials & records", icon: BrainCircuit, view: "analysis", x: 500, y: 625 }
];

function nodeForView(view: HeatherView): NeuralNodeId {
  if (view === "chat") return "chat";
  if (view === "memory") return "personal_memory";
  if (view === "training" || view === "analysis" || view === "projects") return "researcher";
  if (view === "automation" || view === "direct_commands" || view === "local_control") return "direct";
  return "dashboard";
}

export function HeatherWorkspace() {
  const data = useHeatherData();
  const [activeView, setActiveView] = useState<HeatherView>("briefing");
  const [activeNode, setActiveNode] = useState<NeuralNodeId>("dashboard");

  useEffect(() => {
    registerHeatherServiceWorker();
  }, []);

  useEffect(() => {
    const listen = (window as TauriEventWindow).__TAURI__?.event?.listen;
    if (!listen) return;
    let unlisten: (() => void) | undefined;
    void listen<string>("heather://open-view", (event) => {
      if (event.payload === "local_control" || event.payload === "settings" || event.payload === "chat") {
        activateView(event.payload);
      }
    }).then((cleanup) => { unlisten = cleanup; });
    return () => unlisten?.();
  }, []);

  const activeNodeData = NEURAL_NODES.find((node) => node.id === activeNode) ?? NEURAL_NODES[0];
  const activeProjects = useMemo(
    () => data.projects.filter((project) => project.status === "active" || project.status === "blocked"),
    [data.projects]
  );
  const activeMemories = data.memories.filter((memory) => !memory.archived);

  function activateView(view: HeatherView, nodeId = nodeForView(view)) {
    setActiveView(view);
    setActiveNode(nodeId);
  }

  return (
    <main className="heather-hud">
      <div className="heather-app-shell">
        <aside className="heather-icon-rail" aria-label="Heather navigation">
          <button type="button" className="rail-brand" onClick={() => activateView("briefing")} aria-label="Heather home"><Sparkles /></button>
          <div className="rail-actions">
            <RailButton icon={Home} label="Dashboard" active={activeView === "briefing"} onClick={() => activateView("briefing")} />
            <RailButton icon={Command} label="Direct commands" active={activeView === "direct_commands"} onClick={() => activateView("direct_commands")} />
            <RailButton icon={MessageSquare} label="Chat" active={activeView === "chat"} onClick={() => activateView("chat")} />
          </div>
          <div className="rail-bottom">
            <RailButton icon={Laptop} label="Local control" active={activeView === "local_control"} onClick={() => activateView("local_control")} />
            <RailButton icon={Settings} label="Settings" active={activeView === "settings"} onClick={() => activateView("settings")} />
          </div>
        </aside>

        <div className="heather-main-column">
          <header className="heather-topbar">
            <div className="heather-title"><Sparkles className="h-4 w-4" /><span>Heather AI</span></div>
            <div className={`heather-ready ${data.ready ? "is-ready" : ""}`}><span />{data.ready ? "Ready" : "Loading"}</div>
          </header>

          <section className="heather-hub-layout">
            <section className="neural-interface" aria-label="Heather neural navigation">
              <NeuralLines />
              <button type="button" className="neural-core" onClick={() => activateView("briefing")} aria-label="Open Dashboard">
                <span className="neural-core-orbit orbit-one" aria-hidden="true" />
                <span className="neural-core-orbit orbit-two" aria-hidden="true" />
                <span className="neural-core-face"><Sparkles className="h-6 w-6" /><strong>Heather</strong><small>AI hub</small></span>
              </button>
              {NEURAL_NODES.map((node) => <NeuralNodeButton key={node.id} node={node} active={activeNode === node.id} onClick={() => activateView(node.view, node.id)} />)}
            </section>
            <HubSummary
              activeNode={activeNodeData}
              activeProjects={activeProjects}
              memories={activeMemories}
              conversations={data.conversations.length}
              onOpenView={activateView}
            />
          </section>

          <section className="heather-workbench" aria-live="polite">
            <div className="workbench-header"><div><p>Workspace</p><h2>{activeNodeData.label}</h2></div><span>{activeNodeData.detail}</span></div>
            <div key={activeView} className="neural-view-stage">
              {!data.ready ? <div className="workbench-loading">Heather 작업공간을 불러오는 중입니다.</div> : <>
                {activeView === "briefing" && <BriefingPanel conversations={data.conversations} memories={data.memories} projects={data.projects} onOpenView={activateView} />}
                {activeView === "chat" && <ChatPanel conversations={data.conversations} memories={data.memories} projects={data.projects} teachings={data.teachings} automationRecipes={data.automationRecipes} settings={data.settings} onSaveConversation={data.saveConversation} onDeleteConversation={data.deleteConversation} onSaveMemory={data.saveMemory} onSaveSettings={data.saveSettings} />}
                {activeView === "projects" && <ProjectsPanel projects={data.projects} onSaveProject={data.saveProject} onDeleteProject={data.deleteProject} />}
                {activeView === "memory" && <MemoryPanel memories={data.memories} onSaveMemory={data.saveMemory} onDeleteMemory={data.deleteMemory} />}
                {activeView === "automation" && <AutomationPanel recipes={data.automationRecipes} onSaveRecipe={data.saveAutomationRecipe} onDeleteRecipe={data.deleteAutomationRecipe} />}
                {activeView === "direct_commands" && <DirectCommandRegistrationPanel />}
                {activeView === "local_control" && <LocalControlPanel settings={data.settings} onSaveSettings={data.saveSettings} />}
                {activeView === "training" && <TrainingPanel teachings={data.teachings} memories={data.memories} projects={data.projects} onSaveTeaching={data.saveTeaching} onDeleteTeaching={data.deleteTeaching} />}
                {activeView === "analysis" && <AnalysisPanel memories={data.memories} onSaveMemory={data.saveMemory} />}
                {activeView === "settings" && <SettingsPanel settings={data.settings} onSaveSettings={data.saveSettings} onClearAll={data.clearAll} />}
              </>}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function NeuralLines() {
  return <svg className="neural-lines" viewBox="0 0 1000 760" aria-hidden="true">
    {NEURAL_NODES.map((node) => <line key={node.id} x1={CORE_POINT.x} y1={CORE_POINT.y} x2={node.x} y2={node.y} />)}
    <circle cx={CORE_POINT.x} cy={CORE_POINT.y} r="126" /><circle cx={CORE_POINT.x} cy={CORE_POINT.y} r="172" className="neural-dash" />
  </svg>;
}

function NeuralNodeButton({ node, active, onClick }: { node: NeuralNode; active: boolean; onClick: () => void }) {
  const Icon = node.icon;
  return <button type="button" onClick={onClick} className={`neural-node ${active ? "is-active" : ""}`} style={{ left: `${node.x / 10}%`, top: `${node.y / 7.6}%` }}>
    <span className="neural-node-dot"><Icon className="h-5 w-5" /></span><span className="neural-node-copy"><strong>{node.label}</strong><small>{node.detail}</small></span>
  </button>;
}

function RailButton({ icon: Icon, label, active, onClick }: { icon: LucideIcon; label: string; active: boolean; onClick: () => void }) {
  return <button type="button" className={active ? "is-active" : ""} onClick={onClick} aria-label={label} title={label}><Icon /></button>;
}

function HubSummary({ activeNode, activeProjects, memories, conversations, onOpenView }: { activeNode: NeuralNode; activeProjects: ProjectRecord[]; memories: MemoryRecord[]; conversations: number; onOpenView: (view: HeatherView) => void }) {
  const ActiveIcon = activeNode.icon;
  const isDashboard = activeNode.id === "dashboard";
  const latestMemory = memories[0]?.content || "Heather will keep useful context here as you work.";
  return <aside className="hub-summary" aria-label={`${activeNode.label} summary`}>
    <div className="summary-title"><div><h2>{activeNode.label}</h2><p>{isDashboard ? "Today, stay focused" : activeNode.detail}</p></div><span className="summary-icon"><ActiveIcon className="h-4 w-4" /></span></div>
    {isDashboard ? <>
      <SummaryCard title="Today’s priorities" count={Math.min(activeProjects.length || 3, 3)}><SummaryRows items={activeProjects.slice(0, 3).map((project) => project.next_actions[0] || project.title)} fallback={["Review your next deadline", "Write the next concrete action", "Check active project context"]} /></SummaryCard>
      <SummaryCard title="Ongoing projects" count={activeProjects.length}><ProjectRows projects={activeProjects.slice(0, 3)} /></SummaryCard>
      <SummaryCard title="Key memory"><p className="summary-copy">{latestMemory}</p><button type="button" className="summary-link" onClick={() => onOpenView("memory")}>Open Memory <span>›</span></button></SummaryCard>
    </> : <>
      <SummaryCard title="Selected area"><p className="summary-copy">{summaryDescription(activeNode.id)}</p></SummaryCard>
      <SummaryCard title="Current context"><SummaryRows items={[`${conversations} saved conversations`, `${memories.length} active memories`, `${activeProjects.length} active projects`]} /></SummaryCard>
      <button type="button" className="summary-primary" onClick={() => onOpenView(activeNode.view)}>Open {activeNode.label}</button>
    </>}
    <p className="summary-footer">Heather is here to help you stay focused.</p>
  </aside>;
}

function SummaryCard({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return <section className="summary-card"><div className="summary-card-title"><h3>{title}</h3>{typeof count === "number" && <span>{count}</span>}</div>{children}</section>;
}

function SummaryRows({ items, fallback = [] }: { items: string[]; fallback?: string[] }) {
  const rows = items.length ? items : fallback;
  return <ul className="summary-rows">{rows.map((item) => <li key={item}><span />{item}</li>)}</ul>;
}

function ProjectRows({ projects }: { projects: ProjectRecord[] }) {
  return <ul className="summary-projects">{projects.length ? projects.map((project) => <li key={project.id}><FolderKanban className="h-4 w-4" /><span>{project.title}</span><small>{project.status}</small></li>) : <li><FolderKanban className="h-4 w-4" /><span>No active projects yet</span></li>}</ul>;
}

function summaryDescription(node: NeuralNodeId) {
  const descriptions: Record<NeuralNodeId, string> = {
    dashboard: "A clear view of the priorities and context that matter right now.",
    direct: "Create safe, reusable responses that Heather matches before using the API.",
    chat: "Keep conversations, decisions, and follow-up work in one calm space.",
    personal_memory: "Review and refine the personal context Heather should remember.",
    research_memory: "Keep durable notes and research context accessible across projects.",
    researcher: "Register materials and turn them into structured research records."
  };
  return descriptions[node];
}
