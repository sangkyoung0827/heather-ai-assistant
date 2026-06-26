import type { ProjectRecord, ProjectSummary } from "./types";

function listOrFallback(items: string[], fallback: string): string {
  const cleanItems = items.map((item) => item.trim()).filter(Boolean);
  return cleanItems.length ? cleanItems.join(", ") : fallback;
}

export function summarizeProject(project: ProjectRecord): ProjectSummary {
  const blocked = project.status === "blocked";
  const urgent = project.priority === "urgent" || project.priority === "high";

  return {
    projectPurpose:
      project.description || `${project.title}의 목적은 아직 한 문장으로 정리되지 않았습니다.`,
    currentProgress: `상태는 ${project.status}, 우선순위는 ${project.priority}입니다. 노트 ${project.notes.length}개와 다음 행동 ${project.next_actions.length}개가 기록되어 있습니다.`,
    keyPeople: listOrFallback(project.related_people, "아직 핵심 인물이 명시되지 않았습니다."),
    keyDecisions: listOrFallback(project.decisions, "아직 고정된 결정사항이 없습니다."),
    problems: blocked
      ? "현재 막힌 상태입니다. 막힌 원인과 의사결정권자를 먼저 분리해야 합니다."
      : "명시적인 문제는 적지만, 책임자/마감/다음 행동이 흐려지면 지연될 수 있습니다.",
    nextActions: listOrFallback(project.next_actions, "다음 행동을 1개 이상 작게 정의해야 합니다."),
    risks: urgent
      ? "우선순위가 높아 일정 압박과 책임 범위 확대 위험이 있습니다."
      : "현재 위험은 낮거나 중간 수준이지만, 맥락이 장기화되면 기억 업데이트가 필요합니다.",
    heatherJudgment:
      "헤더의 판단: 이 프로젝트는 목적, 책임자, 다음 행동을 분리해서 관리할수록 실행력이 올라갑니다. 특히 좋은 기회와 지속적인 업무 전가 사이의 경계를 주기적으로 확인해야 합니다."
  };
}
