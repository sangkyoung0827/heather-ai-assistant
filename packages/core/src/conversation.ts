import type {
  ChatRequestPayload,
  ChatResponsePayload,
  Conversation,
  ConversationMessage,
  HeatherSettings,
  MemoryRecord,
  ProjectRecord
} from "./types";
import { classifyActionRisk } from "./safety";

export function createId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${random}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function createMessage(
  role: ConversationMessage["role"],
  content: string,
  source: ConversationMessage["source"] = "text"
): ConversationMessage {
  return {
    id: createId("msg"),
    role,
    content,
    source,
    createdAt: nowIso()
  };
}

export function createConversation(firstMessage?: string): Conversation {
  const timestamp = nowIso();
  return {
    id: createId("convo"),
    title: firstMessage ? generateConversationTitle(firstMessage) : "새 대화",
    messages: firstMessage ? [createMessage("user", firstMessage)] : [],
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function generateConversationTitle(input: string): string {
  const normalized = input.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "새 대화";
  }

  const title = normalized.slice(0, 34);
  return normalized.length > 34 ? `${title}...` : title;
}

function toneLead(settings: HeatherSettings): string {
  if (settings.tone === "soft") {
    return "좋아, 내가 차분하게 정리해볼게.";
  }

  if (settings.tone === "direct") {
    return "핵심부터 말할게.";
  }

  return "분석적으로 보면 이렇게 나뉩니다.";
}

function pickRelevantMemories(message: string, memories: MemoryRecord[]): MemoryRecord[] {
  const terms = message
    .toLowerCase()
    .split(/[\s,.;:!?()[\]{}"'`~]+/)
    .filter((term) => term.length >= 2);

  return memories
    .filter((memory) => !memory.archived)
    .map((memory) => {
      const haystack = `${memory.content} ${memory.tags.join(" ")}`.toLowerCase();
      const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
      return { memory, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ memory }) => memory);
}

function pickRelevantProjects(message: string, projects: ProjectRecord[]): ProjectRecord[] {
  const lower = message.toLowerCase();
  return projects
    .filter((project) => {
      const haystack = [
        project.title,
        project.description,
        ...project.related_people,
        ...project.notes,
        ...project.next_actions
      ]
        .join(" ")
        .toLowerCase();
      return lower.includes(project.title.toLowerCase()) || haystack.includes(lower.slice(0, 16));
    })
    .slice(0, 3);
}

function buildContextLine(memories: MemoryRecord[], projects: ProjectRecord[]): string {
  const memoryLine = memories.length
    ? `기억 맥락: ${memories.map((memory) => memory.content).join(" / ")}`
    : "기억 맥락: 아직 직접 연결되는 장기 기억은 많지 않음";

  const projectLine = projects.length
    ? `프로젝트 맥락: ${projects.map((project) => `${project.title}(${project.status})`).join(", ")}`
    : "프로젝트 맥락: 특정 프로젝트로 고정되지 않음";

  return `${memoryLine}\n${projectLine}`;
}

export function createLocalHeatherResponse(payload: ChatRequestPayload): ChatResponsePayload {
  const risk = classifyActionRisk(payload.message);
  const relevantMemories = payload.settings.memoryEnabled
    ? pickRelevantMemories(payload.message, payload.memories)
    : [];
  const relevantProjects = payload.settings.projectMemoryEnabled
    ? pickRelevantProjects(payload.message, payload.projects)
    : [];
  const contextLine = buildContextLine(relevantMemories, relevantProjects);

  const confirmation = risk.requiresConfirmation
    ? "\n\n이 요청에는 확인이 필요한 작업이 섞여 있을 수 있어요. 실제 실행 단계로 넘어가기 전에 범위와 되돌릴 방법을 먼저 확정하겠습니다."
    : "";

  const content = [
    toneLead(payload.settings),
    "",
    contextLine,
    "",
    "내 판단:",
    `- 지금 요청의 핵심은 "${payload.message.trim()}"를 실행 가능한 구조로 바꾸는 것입니다.`,
    "- 먼저 목표, 제약, 다음 행동을 분리하고, 이미 저장된 프로젝트/기억과 충돌하는 지점을 확인하는 편이 좋습니다.",
    "- 제가 바로 도울 수 있는 부분은 대화 정리, 프로젝트 메모리 갱신, 사람/조직 분석, 문서 초안, 오늘의 우선순위 재정렬입니다.",
    "",
    "다음 행동:",
    "1. 원하는 결과물을 한 문장으로 확정합니다.",
    "2. 관련 프로젝트나 사람을 연결합니다.",
    "3. 실행이 필요한 작업은 위험도를 확인한 뒤 단계별로 진행합니다.",
    confirmation
  ]
    .filter(Boolean)
    .join("\n");

  return {
    message: content,
    title: generateConversationTitle(payload.message),
    risk,
    memorySuggestion: payload.settings.memoryEnabled
      ? {
          type: "important_fact",
          content: `사용자는 "${payload.message.slice(0, 80)}"에 대해 헤더와 이어서 다루고 싶어함.`,
          source: "chat",
          confidence: 0.56,
          tags: ["chat", "follow-up"]
        }
      : undefined
  };
}
