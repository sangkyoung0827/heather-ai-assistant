"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import type { LucideIcon } from "lucide-react";
import {
  BrainCircuit,
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

  return (
    <main className="min-h-screen bg-mist text-ink">
      <div className="mx-auto flex min-h-screen w-full max-w-[1540px] flex-col gap-4 p-3 lg:flex-row lg:p-4">
        <aside className="flex shrink-0 flex-col gap-3 border-line bg-white p-3 shadow-soft lg:h-[calc(100vh-2rem)] lg:w-72 lg:border lg:rounded-lg">
          <div className="flex items-center gap-3 border-b border-line pb-3">
            <Image src="/icons/heather-icon.svg" alt="" width={44} height={44} className="rounded-lg" />
            <div>
              <p className="text-sm font-semibold text-heather-700">Heather AI Assistant</p>
              <h1 className="text-xl font-semibold">헤더</h1>
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
                  className={`flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium transition lg:justify-start ${
                    selected
                      ? "border-heather-500 bg-heather-50 text-heather-900"
                      : "border-transparent bg-white text-slate-600 hover:border-line hover:bg-slate-50"
                  }`}
                  title={item.label}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="hidden sm:inline lg:inline">{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="mt-auto hidden space-y-2 border-t border-line pt-3 text-sm text-slate-600 lg:block">
            <div className="flex items-center justify-between">
              <span>진행 프로젝트</span>
              <strong className="text-ink">{activeProjectCount}</strong>
            </div>
            <div className="flex items-center justify-between">
              <span>저장 기억</span>
              <strong className="text-ink">{data.memories.filter((memory) => !memory.archived).length}</strong>
            </div>
            <div className="flex items-center justify-between">
              <span>교육 기록</span>
              <strong className="text-ink">{data.teachings.filter((teaching) => teaching.active).length}</strong>
            </div>
            <div className="flex items-center justify-between">
              <span>자동화 루틴</span>
              <strong className="text-ink">{data.automationRecipes.filter((recipe) => recipe.enabled).length}</strong>
            </div>
            <div className="flex items-center justify-between">
              <span>웹 기능</span>
              <strong className="text-ink">{availableCapabilities}</strong>
            </div>
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col border-line bg-white shadow-soft lg:h-[calc(100vh-2rem)] lg:overflow-hidden lg:border lg:rounded-lg">
          <header className="flex flex-col gap-3 border-b border-line p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-medium text-heather-700">오늘은 무엇을 도와주면 좋을까?</p>
              <h2 className="text-2xl font-semibold">
                {NAVIGATION.find((item) => item.id === activeView)?.label}
              </h2>
            </div>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <StatusPill icon={BrainCircuit} label={data.settings.tone} value="말투" />
              <StatusPill icon={Mic} label={data.settings.voiceOutputEnabled ? "on" : "off"} value="음성" />
              <StatusPill icon={ShieldCheck} label="confirm" value="위험 작업" />
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-4 heather-scrollbar">
            {!data.ready ? (
              <div className="flex min-h-[360px] items-center justify-center text-sm text-slate-500">
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
    <div className="flex min-w-0 items-center gap-2 rounded-lg border border-line bg-slate-50 px-3 py-2">
      <Icon className="h-4 w-4 shrink-0 text-heather-700" />
      <span className="hidden text-slate-500 sm:inline">{value}</span>
      <strong className="truncate text-ink">{label}</strong>
    </div>
  );
}
