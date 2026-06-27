"use client";

import { ArrowRight, CheckCircle2, Database, FolderKanban, MessageSquare, Sparkles } from "lucide-react";
import { buildDailyBriefing } from "@heather/core";
import type { Conversation, MemoryRecord, ProjectRecord } from "@heather/core";
import type { HeatherView } from "../HeatherWorkspace";

interface BriefingPanelProps {
  conversations: Conversation[];
  memories: MemoryRecord[];
  projects: ProjectRecord[];
  onOpenView: (view: HeatherView) => void;
}

export function BriefingPanel({ conversations, memories, projects, onOpenView }: BriefingPanelProps) {
  const briefing = buildDailyBriefing({ conversations, memories, projects });

  return (
    <div className="space-y-4">
      <section className="hud-briefing-hero relative overflow-hidden p-6">
        <div className="relative z-10 max-w-3xl">
          <p className="text-sm font-semibold text-cyan-200">Heather Briefing</p>
          <h3 className="mt-2 text-4xl font-semibold text-white">오늘의 우선순위</h3>
          <p className="mt-4 max-w-3xl text-cyan-50/78">{briefing.heatherPriority}</p>
        </div>
        <div className="hud-hero-radar" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </section>

      <section className="grid gap-3 xl:grid-cols-2">
        <BriefingList
          title="오늘 해야 할 일"
          icon={CheckCircle2}
          items={briefing.todayTasks}
          empty="아직 오늘 할 일이 없습니다. 프로젝트 탭에서 다음 행동을 추가하세요."
        />
        <BriefingList
          title="최근 대화 후속 작업"
          icon={MessageSquare}
          items={briefing.conversationFollowUps}
          empty="저장된 대화가 생기면 이어서 할 일이 여기에 표시됩니다."
        />
        <BriefingList
          title="진행 중인 프로젝트"
          icon={FolderKanban}
          items={briefing.activeProjects}
          empty="활성 프로젝트가 없습니다."
        />
        <BriefingList
          title="중요 기억"
          icon={Database}
          items={briefing.importantItems}
          empty="높은 신뢰도의 기억이 아직 없습니다."
        />
      </section>

      <aside className="grid gap-3 xl:grid-cols-3">
        <QuickAction
          icon={MessageSquare}
          title="헤더에게 바로 묻기"
          body="고민, 일정, 사람 관계, 문서 초안을 대화로 정리합니다."
          onClick={() => onOpenView("chat")}
        />
        <QuickAction
          icon={FolderKanban}
          title="프로젝트 메모리 정리"
          body="ECC, 한활, K_LINE 같은 장기 프로젝트의 다음 행동을 고정합니다."
          onClick={() => onOpenView("projects")}
        />
        <QuickAction
          icon={Sparkles}
          title="사람/조직 분석"
          body="기회와 업무 전가의 경계처럼 애매한 구조를 분해합니다."
          onClick={() => onOpenView("analysis")}
        />
      </aside>
    </div>
  );
}

function BriefingList({
  title,
  icon: Icon,
  items,
  empty
}: {
  title: string;
  icon: typeof CheckCircle2;
  items: string[];
  empty: string;
}) {
  return (
    <section className="hud-card relative min-h-[210px] overflow-hidden p-5">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-cyan-300" />
        <h4 className="font-semibold text-white">{title}</h4>
      </div>
      {items.length ? (
        <ul className="relative z-10 space-y-2 text-sm text-cyan-50/78">
          {items.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.95)]" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="relative z-10 text-sm text-cyan-100/55">{empty}</p>
      )}
      <div className="hud-card-orbit" aria-hidden="true" />
    </section>
  );
}

function QuickAction({
  icon: Icon,
  title,
  body,
  onClick
}: {
  icon: typeof MessageSquare;
  title: string;
  body: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hud-quick-action flex w-full items-start gap-3 p-4 text-left transition"
    >
      <span className="hud-quick-icon">
        <Icon className="h-5 w-5 text-cyan-200" />
      </span>
      <span className="min-w-0">
        <span className="block font-semibold text-white">{title}</span>
        <span className="mt-1 block text-sm text-cyan-100/65">{body}</span>
      </span>
      <ArrowRight className="ml-auto mt-1 h-4 w-4 shrink-0 text-cyan-300" />
    </button>
  );
}
