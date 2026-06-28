"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BrainCircuit,
  Cpu,
  Database,
  FolderKanban,
  Home,
  Laptop,
  MessageSquare,
  Mic,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  Zap
} from "lucide-react";
import { PLATFORM_CAPABILITIES } from "@heather/core";
import { useHeatherData } from "../../lib/use-heather-data";
import { registerHeatherServiceWorker } from "../../lib/pwa";
import { AnalysisPanel } from "./panels/AnalysisPanel";
import { AutomationPanel } from "./panels/AutomationPanel";
import { BriefingPanel } from "./panels/BriefingPanel";
import { ChatPanel } from "./panels/ChatPanel";
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
  | "local_control"
  | "training"
  | "analysis"
  | "settings";

interface NavigationItem {
  id: HeatherView;
  label: string;
  icon: LucideIcon;
}

type TauriEventWindow = Window & {
  __TAURI__?: {
    event?: {
      listen<T>(event: string, handler: (payload: { payload: T }) => void): Promise<() => void>;
    };
  };
};

const NAVIGATION: NavigationItem[] = [
  { id: "briefing", label: "브리핑", icon: Home },
  { id: "chat", label: "채팅", icon: MessageSquare },
  { id: "projects", label: "프로젝트", icon: FolderKanban },
  { id: "memory", label: "메모리", icon: Database },
  { id: "automation", label: "Jarvis 루틴", icon: Zap },
  { id: "local_control", label: "Local Control", icon: Laptop },
  { id: "training", label: "학습/생성", icon: Sparkles },
  { id: "analysis", label: "사람/조직 분석", icon: Users },
  { id: "settings", label: "설정", icon: Settings }
];

export function HeatherWorkspace() {
  const data = useHeatherData();
  const [activeView, setActiveView] = useState<HeatherView>("briefing");

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
        setActiveView(event.payload);
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

  const availableCapabilities = PLATFORM_CAPABILITIES.filter(
    (capability) => capability.status === "available"
  ).length;
  const activeLabel = NAVIGATION.find((item) => item.id === activeView)?.label || "브리핑";

  return (
    <main className="heather-hud min-h-screen overflow-hidden bg-[#01060d] text-cyan-50">
      <div className="mx-auto flex min-h-screen w-full max-w-[1740px] flex-col gap-4 p-3 lg:flex-row lg:p-4">
        <aside className="hud-sidebar flex shrink-0 flex-col gap-4 p-4 lg:h-[calc(100vh-2rem)] lg:w-[300px]">
          <div className="hud-profile flex items-center gap-3 pb-4">
            <div className="hud-avatar-shell">
              <Image src="/icons/heather-avatar.png" alt="" width={86} height={86} className="hud-avatar-img" unoptimized />
            </div>
            <div>
              <p className="text-sm font-semibold text-cyan-200">Heather AI Assistant</p>
              <h1 className="text-2xl font-semibold tracking-normal text-white">헤더</h1>
            </div>
          </div>

          <nav className="grid grid-cols-3 gap-2 lg:grid-cols-1">
            {NAVIGATION.map((item) => {
              const Icon = item.icon;
              const selected = activeView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveView(item.id)}
                  className={`hud-nav-item flex min-h-12 items-center justify-center gap-3 px-3 text-sm font-medium transition lg:justify-start ${
                    selected
                      ? "hud-nav-item-active text-white"
                      : "text-cyan-100/70 hover:text-white"
                  }`}
                  title={item.label}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="hidden sm:inline lg:inline">{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="hud-mini-panel mt-auto hidden space-y-3 p-4 text-sm text-cyan-100/75 lg:block">
            <div className="flex items-center justify-between">
              <span>진행 프로젝트</span>
              <strong className="text-white">{activeProjectCount}</strong>
            </div>
            <div className="flex items-center justify-between">
              <span>저장 기억</span>
              <strong className="text-white">{data.memories.filter((memory) => !memory.archived).length}</strong>
            </div>
            <div className="flex items-center justify-between">
              <span>교육 기록</span>
              <strong className="text-white">{data.teachings.filter((teaching) => teaching.active).length}</strong>
            </div>
            <div className="flex items-center justify-between">
              <span>자동화 루틴</span>
              <strong className="text-white">{data.automationRecipes.filter((recipe) => recipe.enabled).length}</strong>
            </div>
            <div className="flex items-center justify-between">
              <span>웹 기능</span>
              <strong className="text-white">{availableCapabilities}</strong>
            </div>
          </div>

          <div className="hud-system-status hidden p-4 lg:block">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200/70">System Status</p>
            <p className="mt-2 text-sm font-semibold text-cyan-200">ONLINE</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-cyan-950">
              <div className="h-full w-[86%] bg-cyan-300 shadow-[0_0_18px_rgba(34,211,238,0.95)]" />
            </div>
          </div>
        </aside>

        <section className="hud-main-panel flex min-w-0 flex-1 flex-col lg:h-[calc(100vh-2rem)] lg:overflow-hidden">
          <header className="hud-topbar flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-cyan-200">오늘은 무엇을 도와주면 좋을까?</p>
              <h2 className="mt-1 text-3xl font-semibold text-white">{activeLabel}</h2>
            </div>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <StatusPill icon={BrainCircuit} label={data.settings.tone} value="말투" />
              <StatusPill icon={Mic} label={data.settings.voiceOutputEnabled ? "on" : "off"} value="음성" />
              <StatusPill icon={ShieldCheck} label="confirm" value="위험 작업" />
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-4 heather-scrollbar md:p-5">
            {!data.ready ? (
              <div className="flex min-h-[360px] items-center justify-center text-sm text-cyan-100/70">
                Heather 작업공간을 불러오는 중입니다.
              </div>
            ) : (
              <>
                {activeView === "briefing" && (
                  <BriefingPanel
                    conversations={data.conversations}
                    memories={data.memories}
                    projects={data.projects}
                    onOpenView={setActiveView}
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

        <aside className="hud-right-rail hidden shrink-0 flex-col gap-5 p-4 2xl:flex 2xl:h-[calc(100vh-2rem)] 2xl:w-[178px]">
          <div className="hud-clock">
            <p className="font-mono text-lg text-cyan-100">19:40:21</p>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-300/70">Local Core</p>
          </div>

          <div className="hud-core-orb" aria-hidden="true" />

          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-cyan-200/60">AI Core</p>
            <p className="mt-1 text-sm font-semibold text-cyan-300">ACTIVE</p>
            <div className="hud-equalizer mt-3" aria-hidden="true">
              {Array.from({ length: 26 }).map((_, index) => (
                <span key={index} />
              ))}
            </div>
          </div>

          <div className="hud-rail-metric">
            <Activity className="h-4 w-4 text-cyan-300" />
            <p className="mt-2 text-xs uppercase tracking-[0.14em] text-cyan-200/60">Neural Network</p>
            <p className="mt-1 font-mono text-2xl text-cyan-100">98.7%</p>
          </div>

          <div className="hud-rail-metric mt-auto">
            <Cpu className="h-4 w-4 text-cyan-300" />
            <p className="mt-2 text-xs uppercase tracking-[0.14em] text-cyan-200/60">Bridge</p>
            <p className="mt-1 text-sm font-semibold text-cyan-100">TAURI READY</p>
          </div>
        </aside>
      </div>
    </main>
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
    <div className="hud-status-chip flex min-w-0 items-center gap-3 px-3 py-2">
      <Icon className="h-4 w-4 shrink-0 text-cyan-300" />
      <span className="hidden text-cyan-100/55 sm:inline">{value}</span>
      <strong className="truncate text-white">{label}</strong>
    </div>
  );
}
