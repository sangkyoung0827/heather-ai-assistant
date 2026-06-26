import type { Briefing, Conversation, MemoryRecord, ProjectRecord } from "./types";

export function buildDailyBriefing(params: {
  conversations: Conversation[];
  memories: MemoryRecord[];
  projects: ProjectRecord[];
}): Briefing {
  const activeProjects = params.projects
    .filter((project) => project.status === "active" || project.status === "blocked")
    .sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority))
    .slice(0, 5);

  const recentConversations = [...params.conversations]
    .filter((conversation) => !conversation.archived)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 3);

  const importantMemories = params.memories
    .filter((memory) => !memory.archived && memory.confidence >= 0.7)
    .slice(0, 4);

  return {
    todayTasks: activeProjects.flatMap((project) => project.next_actions.slice(0, 2)).slice(0, 6),
    conversationFollowUps: recentConversations.map((conversation) => conversation.title),
    activeProjects: activeProjects.map(
      (project) => `${project.title} · ${project.status} · ${project.priority}`
    ),
    importantItems: importantMemories.map((memory) => memory.content),
    heatherPriority: activeProjects.length
      ? `${activeProjects[0].title}의 다음 행동을 하나 끝내는 것이 오늘의 최우선입니다.`
      : "오늘은 새 프로젝트를 만들기보다 기존 메모리와 대화를 정리하는 편이 좋습니다."
  };
}

function priorityRank(priority: ProjectRecord["priority"]): number {
  if (priority === "urgent") return 4;
  if (priority === "high") return 3;
  if (priority === "medium") return 2;
  return 1;
}
