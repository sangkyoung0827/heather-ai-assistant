"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import type { LucideIcon } from "lucide-react";
import {
  BrainCircuit,
  Command,
  Database,
  FolderKanban,
  Home,
  Laptop,
  MessageSquare,
  Mic,
  Settings,
  ShieldCheck,
  Sparkles,
  Users
} from "lucide-react";
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

type NeuralNodeId =
  | "dashboard"
  | "direct"
  | "chat"
  | "memory"
  | "personal_memory"
  | "research_memory"
  | "researcher"
  | "research_materials"
  | "research_records";

interface NeuralNode {
  id: NeuralNodeId;
  label: string;
  detail: string;
  icon: LucideIcon;
  view: HeatherView;
  x: number;
  y: number;
  branch?: "memory" | "researcher";
}

type TauriEventWindow = Window & {
  __TAURI__?: {
    event?: {
      listen<T>(event: string, handler: (payload: { payload: T }) => void): Promise<() => void>;
    };
  };
};

const CORE_POINT = { x: 500, y: 302 };

const PRIMARY_NODES: NeuralNode[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    detail: "today and system overview",
    icon: Home,
    view: "briefing",
    x: 500,
    y: 72
  },
  {
    id: "direct",
    label: "Direct Command Registration",
    detail: "safe local actions",
    icon: Command,
    view: "direct_commands",
    x: 182,
    y: 302
  },
  {
    id: "chat",
    label: "Chat",
    detail: "conversation layer",
    icon: MessageSquare,
    view: "chat",
    x: 818,
    y: 302
  },
  {
    id: "memory",
    label: "Memory",
    detail: "personal context",
    icon: Database,
    view: "memory",
    x: 500,
    y: 446,
    branch: "memory"
  },
  {
    id: "researcher",
    label: "Researcher",
    detail: "materials and records",
    icon: BrainCircuit,
    view: "analysis",
    x: 500,
    y: 560,
    branch: "researcher"
  }
];

const MEMORY_CHILD_NODES: NeuralNode[] = [
  {
    id: "personal_memory",
    label: "Personal Memory",
    detail: "private recall",
    icon: Database,
    view: "memory",
    x: 285,
    y: 446
  },
  {
    id: "research_memory",
    label: "Research Memory",
    detail: "research context",
    icon: FolderKanban,
    view: "memory",
    x: 715,
    y: 446
  }
];

const RESEARCH_CHILD_NODES: NeuralNode[] = [
  {
    id: "research_materials",
    label: "Research Material Registration",
    detail: "teach Heather",
    icon: Sparkles,
    view: "training",
    x: 255,
    y: 560
  },
  {
    id: "research_records",
    label: "Research Records",
    detail: "project archive",
    icon: FolderKanban,
    view: "projects",
    x: 745,
    y: 560
  }
];

const ALL_GRAPH_NODES = [...PRIMARY_NODES, ...MEMORY_CHILD_NODES, ...RESEARCH_CHILD_NODES];

function nodeForView(view: HeatherView): NeuralNodeId {
  if (view === "briefing") return "dashboard";
  if (view === "chat") return "chat";
  if (view === "memory") return "memory";
  if (view === "training") return "research_materials";
  if (view === "projects") return "research_records";
  if (view === "analysis") return "researcher";
  if (view === "automation" || view === "direct_commands" || view === "local_control") return "direct";
  return "dashboard";
}

export function HeatherWorkspace() {
  const data = useHeatherData();
  const [activeView, setActiveView] = useState<HeatherView>("briefing");
  const [activeNode, setActiveNode] = useState<NeuralNodeId>("dashboard");
  const [memoryExpanded, setMemoryExpanded] = useState(false);
  const [researcherExpanded, setResearcherExpanded] = useState(false);

  useEffect(() => {
    registerHeatherServiceWorker();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const listen = (window as TauriEventWindow).__TAURI__?.event?.listen;
    if (!listen) return;

    let unlisten: (() => void) | null = null;
    void listen<string>("heather://open-view", (event) => {
      if (event.payload === "local_control" || event.payload === "settings" || event.payload === "chat") {
        activateView(event.payload, nodeForView(event.payload));
      }
    }).then((nextUnlisten) => {
      unlisten = nextUnlisten;
    });

    return () => {
      unlisten?.();
    };
  }, []);

  const activeProjectCount = useMemo(
    () => data.projects.filter((project) => project.status === "active" || project.status === "blocked").length,
    [data.projects]
  );

  const activeMemoryCount = data.memories.filter((memory) => !memory.archived).length;
  const activeTeachingCount = data.teachings.filter((teaching) => teaching.active).length;
  const availableCapabilities = PLATFORM_CAPABILITIES.filter(
    (capability) => capability.status === "available"
  ).length;
  const activeLabel = ALL_GRAPH_NODES.find((item) => item.id === activeNode)?.label || "Dashboard";

  function activateView(view: HeatherView, nodeId: NeuralNodeId) {
    setActiveView(view);
    setActiveNode(nodeId);
    if (nodeId === "memory" || nodeId === "personal_memory" || nodeId === "research_memory") {
      setMemoryExpanded(true);
    }
    if (nodeId === "researcher" || nodeId === "research_materials" || nodeId === "research_records") {
      setResearcherExpanded(true);
    }
  }

  function activateNode(node: NeuralNode) {
    if (node.branch === "memory") {
      setMemoryExpanded((expanded) => !expanded);
    }
    if (node.branch === "researcher") {
      setResearcherExpanded((expanded) => !expanded);
    }
    activateView(node.view, node.id);
  }

  return (
    <main className="heather-hud min-h-screen overflow-hidden">
      <div className="heather-os-shell mx-auto flex min-h-screen w-full max-w-[1500px] flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="heather-os-header">
          <div>
            <p className="heather-os-kicker">Heather AI Operating System</p>
            <h1>Neural Interface</h1>
          </div>
          <div className="heather-os-utilities" aria-label="System utilities">
            <button type="button" onClick={() => activateView("local_control", "direct")}>
              <Laptop className="h-4 w-4" />
              Local Control
            </button>
            <button type="button" onClick={() => activateView("settings", "dashboard")}>
              <Settings className="h-4 w-4" />
              Settings
            </button>
          </div>
        </header>

        <section className="neural-interface" aria-label="Heather neural navigation">
          <NeuralLines memoryExpanded={memoryExpanded} researcherExpanded={researcherExpanded} />

          <button
            type="button"
            className="neural-core"
            onClick={() => activateView("briefing", "dashboard")}
            aria-label="Open Dashboard"
          >
            <span className="neural-core-ring" aria-hidden="true" />
            <span className="neural-core-image">
              <Image
                src="/icons/heather-avatar.png"
                alt=""
                width={112}
                height={112}
                priority
                unoptimized
              />
            </span>
            <span className="neural-core-label">Heather</span>
          </button>

          {PRIMARY_NODES.map((node) => (
            <NeuralNodeButton
              key={node.id}
              node={node}
              active={activeNode === node.id}
              visible
              expanded={
                (node.branch === "memory" && memoryExpanded) ||
                (node.branch === "researcher" && researcherExpanded)
              }
              onClick={() => activateNode(node)}
            />
          ))}

          {MEMORY_CHILD_NODES.map((node) => (
            <NeuralNodeButton
              key={node.id}
              node={node}
              active={activeNode === node.id}
              visible={memoryExpanded}
              onClick={() => activateView(node.view, node.id)}
            />
          ))}

          {RESEARCH_CHILD_NODES.map((node) => (
            <NeuralNodeButton
              key={node.id}
              node={node}
              active={activeNode === node.id}
              visible={researcherExpanded}
              onClick={() => activateView(node.view, node.id)}
            />
          ))}
        </section>

        <section className="heather-os-status" aria-label="Heather status">
          <StatusPill icon={BrainCircuit} label={data.settings.tone} value="Tone" />
          <StatusPill icon={Mic} label={data.settings.voiceOutputEnabled ? "on" : "off"} value="Voice" />
          <StatusPill icon={ShieldCheck} label="confirm" value="Risk" />
          <StatusPill icon={Database} label={String(activeMemoryCount)} value="Memory" />
          <StatusPill icon={Sparkles} label={String(activeTeachingCount)} value="Teaching" />
          <StatusPill icon={FolderKanban} label={String(activeProjectCount)} value="Projects" />
          <StatusPill icon={Laptop} label={String(availableCapabilities)} value="Tools" />
        </section>

        <section className="heather-os-workspace" aria-live="polite">
          <div className="heather-os-workspace-head">
            <div>
              <p>Selected node</p>
              <h2>{activeLabel}</h2>
            </div>
            <span>{data.ready ? "Ready" : "Loading"}</span>
          </div>

          <div key={activeView} className="neural-view-stage">
            {!data.ready ? (
              <div className="flex min-h-[300px] items-center justify-center text-sm text-slate-500">
                Heather 작업공간을 불러오는 중입니다.
              </div>
            ) : (
              <>
                {activeView === "briefing" && (
                  <BriefingPanel
                    conversations={data.conversations}
                    memories={data.memories}
                    projects={data.projects}
                    onOpenView={(view) => activateView(view, nodeForView(view))}
                  />
                )}
                {activeView === "chat" && (
                  <ChatPanel
                    conversations={data.conversations}
                    memories={data.memories}
                    projects={data.projects}
                    teachings={data.teachings}
                    automationRecipes={data.automationRecipes}
                    settings={data.settings}
                    onSaveConversation={data.saveConversation}
                    onDeleteConversation={data.deleteConversation}
                    onSaveMemory={data.saveMemory}
                    onSaveSettings={data.saveSettings}
                  />
                )}
                {activeView === "projects" && (
                  <ProjectsPanel
                    projects={data.projects}
                    onSaveProject={data.saveProject}
                    onDeleteProject={data.deleteProject}
                  />
                )}
                {activeView === "memory" && (
                  <MemoryPanel
                    memories={data.memories}
                    onSaveMemory={data.saveMemory}
                    onDeleteMemory={data.deleteMemory}
                  />
                )}
                {activeView === "automation" && (
                  <AutomationPanel
                    recipes={data.automationRecipes}
                    onSaveRecipe={data.saveAutomationRecipe}
                    onDeleteRecipe={data.deleteAutomationRecipe}
                  />
                )}
                {activeView === "direct_commands" && <DirectCommandRegistrationPanel />}
                {activeView === "local_control" && (
                  <LocalControlPanel
                    settings={data.settings}
                    onSaveSettings={data.saveSettings}
                  />
                )}
                {activeView === "training" && (
                  <TrainingPanel
                    teachings={data.teachings}
                    memories={data.memories}
                    projects={data.projects}
                    onSaveTeaching={data.saveTeaching}
                    onDeleteTeaching={data.deleteTeaching}
                  />
                )}
                {activeView === "analysis" && (
                  <AnalysisPanel memories={data.memories} onSaveMemory={data.saveMemory} />
                )}
                {activeView === "settings" && (
                  <SettingsPanel
                    settings={data.settings}
                    onSaveSettings={data.saveSettings}
                    onClearAll={data.clearAll}
                  />
                )}
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function NeuralLines({
  memoryExpanded,
  researcherExpanded
}: {
  memoryExpanded: boolean;
  researcherExpanded: boolean;
}) {
  return (
    <svg className="neural-lines" viewBox="0 0 1000 640" aria-hidden="true">
      <line x1={CORE_POINT.x} y1={CORE_POINT.y} x2="500" y2="72" />
      <line x1={CORE_POINT.x} y1={CORE_POINT.y} x2="182" y2="302" />
      <line x1={CORE_POINT.x} y1={CORE_POINT.y} x2="818" y2="302" />
      <line x1={CORE_POINT.x} y1={CORE_POINT.y} x2="500" y2="446" />
      <line x1="500" y1="446" x2="500" y2="560" />
      <line className={memoryExpanded ? "is-visible" : ""} x1="500" y1="446" x2="285" y2="446" />
      <line className={memoryExpanded ? "is-visible" : ""} x1="500" y1="446" x2="715" y2="446" />
      <line className={researcherExpanded ? "is-visible" : ""} x1="500" y1="560" x2="255" y2="560" />
      <line className={researcherExpanded ? "is-visible" : ""} x1="500" y1="560" x2="745" y2="560" />
    </svg>
  );
}

function NeuralNodeButton({
  node,
  active,
  visible,
  expanded,
  onClick
}: {
  node: NeuralNode;
  active: boolean;
  visible: boolean;
  expanded?: boolean;
  onClick: () => void;
}) {
  const Icon = node.icon;
  return (
    <button
      type="button"
      aria-expanded={node.branch ? Boolean(expanded) : undefined}
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      onClick={onClick}
      className={`neural-node ${active ? "is-active" : ""} ${visible ? "is-visible" : "is-hidden"}`}
      style={{
        left: `${node.x / 10}%`,
        top: `${node.y / 6.4}%`
      }}
    >
      <span className="neural-node-dot">
        <Icon className="h-4 w-4" />
      </span>
      <span className="neural-node-copy">
        <strong>{node.label}</strong>
        <small>{node.detail}</small>
      </span>
    </button>
  );
}

function StatusPill({
  icon: Icon,
  label,
  value
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="heather-os-pill">
      <Icon className="h-4 w-4 shrink-0" />
      <span>{value}</span>
      <strong>{label}</strong>
    </div>
  );
}
