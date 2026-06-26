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
    <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
      <section className="space-y-4">
        <div className="border-b border-line pb-4">
          <p className="text-sm font-semibold text-heather-700">Heather Briefing</p>
          <h3 className="mt-1 text-3xl font-semibold">오늘의 우선순위</h3>
          <p className="mt-2 max-w-3xl text-slate-600">{briefing.heatherPriority}</p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
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
        </div>
      </section>

      <aside className="space-y-3">
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
    <section className="rounded-lg border border-line bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-heather-700" />
        <h4 className="font-semibold">{title}</h4>
      </div>
      {items.length ? (
        <ul className="space-y-2 text-sm text-slate-700">
          {items.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-heather-500" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">{empty}</p>
      )}
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
      className="flex w-full items-start gap-3 rounded-lg border border-line bg-slate-50 p-4 text-left transition hover:border-heather-300 hover:bg-heather-50"
    >
      <Icon className="mt-1 h-5 w-5 shrink-0 text-heather-700" />
      <span className="min-w-0">
        <span className="block font-semibold">{title}</span>
        <span className="mt-1 block text-sm text-slate-600">{body}</span>
      </span>
      <ArrowRight className="ml-auto mt-1 h-4 w-4 shrink-0 text-slate-400" />
    </button>
  );
}
