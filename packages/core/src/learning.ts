import type {
  GenerativeTool,
  GenerativeToolId,
  MemoryRecord,
  ProjectRecord,
  TeachingRecord
} from "./types";

export const GENERATIVE_TOOLS: GenerativeTool[] = [
  {
    id: "conversation",
    name: "대화 정리",
    description: "일반 요청을 맥락, 판단, 다음 행동으로 정리합니다.",
    keywords: ["대화", "정리", "도와", "생각", "고민", "heather", "헤더"],
    outputContract: ["핵심 이해", "맥락", "판단", "다음 행동"]
  },
  {
    id: "draft_writer",
    name: "문서/글 생성",
    description: "문서, 메시지, 보고서, 제안서, 스크립트 초안을 생성합니다.",
    keywords: ["작성", "초안", "문서", "보고서", "제안서", "글", "메일", "메시지", "스크립트"],
    outputContract: ["목적", "초안", "수정 포인트", "다음 버전 질문"]
  },
  {
    id: "project_planner",
    name: "프로젝트 설계",
    description: "장기 프로젝트를 목표, 현재 상태, 결정, 다음 행동으로 쪼갭니다.",
    keywords: ["프로젝트", "계획", "일정", "우선순위", "마감", "실행", "roadmap", "로드맵"],
    outputContract: ["목표", "현재 상태", "작업 분해", "위험", "다음 행동"]
  },
  {
    id: "relationship_analyst",
    name: "사람/조직 분석",
    description: "권한과 책임, 동기, 위험 신호, 대응 전략을 분석합니다.",
    keywords: ["사람", "관계", "조직", "교수", "친구", "여자친구", "책임", "권한", "전가"],
    outputContract: ["겉 행동", "실제 구조", "가능한 동기", "위험 신호", "대응"]
  },
  {
    id: "decision_comparator",
    name: "의사결정 비교",
    description: "선택지를 비용, 위험, 장기 효과 기준으로 비교합니다.",
    keywords: ["선택", "비교", "결정", "해야 할까", "어느", "장단점", "판단"],
    outputContract: ["선택지", "비교 기준", "추천", "반대 근거", "조건부 결론"]
  },
  {
    id: "prompt_designer",
    name: "프롬프트 설계",
    description: "헤더 또는 다른 AI에게 줄 프롬프트를 목적에 맞게 설계합니다.",
    keywords: ["프롬프트", "prompt", "명령어", "지시문", "역할", "시스템"],
    outputContract: ["목표", "프롬프트", "사용법", "개선 기준"]
  },
  {
    id: "image_prompt",
    name: "이미지 생성 지시",
    description: "이미지 생성 모델에 넣을 장면, 스타일, 품질 지시를 구성합니다.",
    keywords: ["이미지", "그림", "사진", "로고", "일러스트", "생성", "배경", "디자인"],
    outputContract: ["장면", "스타일", "구도", "색감", "negative prompt"]
  }
];

export function selectGenerativeTool(input: string): GenerativeTool {
  const lower = input.toLowerCase();
  const scored = GENERATIVE_TOOLS.map((tool) => ({
    tool,
    score: tool.keywords.reduce((total, keyword) => total + (lower.includes(keyword.toLowerCase()) ? 1 : 0), 0)
  })).sort((a, b) => b.score - a.score);

  return scored[0]?.score ? scored[0].tool : GENERATIVE_TOOLS[0];
}

export function pickRelevantTeachings(input: string, teachings: TeachingRecord[] = []): TeachingRecord[] {
  const terms = tokenize(input);

  return teachings
    .filter((teaching) => teaching.active)
    .map((teaching) => {
      const haystack = `${teaching.type} ${teaching.title} ${teaching.content} ${teaching.tags.join(" ")}`.toLowerCase();
      const score =
        teaching.confidence +
        terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
      return { teaching, score };
    })
    .filter(({ score }) => score >= 0.45)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ teaching }) => teaching);
}

export function buildTeachingContext(teachings: TeachingRecord[] = []): string {
  const active = teachings.filter((teaching) => teaching.active).slice(0, 8);
  if (!active.length) {
    return "헤더 교육 기록: 아직 활성 교육 기록이 없습니다.";
  }

  return [
    "헤더 교육 기록:",
    ...active.map(
      (teaching) =>
        `- ${teaching.type} / ${teaching.title}: ${teaching.content.slice(0, 320)}`
    )
  ].join("\n");
}

export function createGenerativeDraft(params: {
  input: string;
  tool: GenerativeTool;
  teachings?: TeachingRecord[];
  memories?: MemoryRecord[];
  projects?: ProjectRecord[];
}): string {
  const teachingLines = pickRelevantTeachings(params.input, params.teachings)
    .map((teaching) => `- ${teaching.title}: ${teaching.content}`)
    .slice(0, 4);
  const projectLines = (params.projects || [])
    .filter((project) => params.input.toLowerCase().includes(project.title.toLowerCase()))
    .slice(0, 3)
    .map((project) => `- ${project.title}: ${project.status}/${project.priority}`);
  const memoryLines = (params.memories || [])
    .filter((memory) => !memory.archived)
    .slice(0, 3)
    .map((memory) => `- ${memory.content}`);

  return [
    `선택 도구: ${params.tool.name}`,
    `목표: ${params.input.trim()}`,
    "",
    "생성 원칙:",
    ...(teachingLines.length ? teachingLines : ["- 아직 맞춤 교육 기록이 적으므로, 결과를 저장하고 수정하면서 헤더를 훈련시키세요."]),
    "",
    "사용 맥락:",
    ...(projectLines.length ? projectLines : ["- 직접 연결된 프로젝트 없음"]),
    ...(memoryLines.length ? memoryLines : ["- 직접 연결된 장기 기억 없음"]),
    "",
    "초안:",
    ...draftByTool(params.tool.id, params.input),
    "",
    "헤더에게 가르칠 수 있는 피드백:",
    "- 마음에 드는 표현은 교육 기록의 example로 저장하세요.",
    "- 틀린 판단은 correction으로 저장하세요.",
    "- 반복해서 지키길 원하는 기준은 directive나 boundary_rule로 저장하세요."
  ].join("\n");
}

function draftByTool(toolId: GenerativeToolId, input: string): string[] {
  if (toolId === "draft_writer") {
    return [
      "1. 목적: 이 글이 설득, 정리, 요청, 기록 중 무엇을 해야 하는지 먼저 고정합니다.",
      `2. 초안: ${input}에 대해 핵심 주장 1개, 근거 3개, 다음 요청 1개로 구성합니다.`,
      "3. 톤: 헤더답게 차분하지만 결론은 흐리지 않습니다.",
      "4. 다음 버전: 대상 독자와 길이를 알려주면 문장 단위로 다듬습니다."
    ];
  }

  if (toolId === "project_planner") {
    return [
      "1. 목표: 성공 기준을 관찰 가능한 결과로 정의합니다.",
      "2. 현재 상태: 이미 끝난 일, 막힌 일, 모르는 일을 분리합니다.",
      "3. 다음 행동: 30분 안에 가능한 작업 1개와 이번 주 안에 끝낼 작업 1개를 정합니다.",
      "4. 위험: 결정권자, 마감, 책임 범위가 흐려지는 지점을 따로 추적합니다."
    ];
  }

  if (toolId === "relationship_analyst") {
    return [
      "1. 겉 행동과 실제 구조를 분리합니다.",
      "2. 상대의 동기는 단정하지 않고 가능한 가설로 둡니다.",
      "3. 사용자가 맡게 된 역할이 자발적 선택인지, 분위기상 떠밀린 것인지 확인합니다.",
      "4. 권한 없이 책임만 늘어나는 패턴이면 대응 문장을 만들어 재협상합니다."
    ];
  }

  if (toolId === "decision_comparator") {
    return [
      "1. 선택지를 최소 2개 이상 적습니다.",
      "2. 비용, 되돌릴 수 있음, 장기 효과, 관계 영향으로 비교합니다.",
      "3. 지금 당장 결론이 필요한지, 더 모아야 할 정보가 있는지 나눕니다.",
      "4. 추천안과 그 추천이 틀릴 조건을 함께 적습니다."
    ];
  }

  if (toolId === "prompt_designer") {
    return [
      "1. 역할: AI가 맡을 역할을 한 문장으로 지정합니다.",
      "2. 맥락: 사용자의 목표, 제약, 선호를 bullet로 제공합니다.",
      "3. 출력 형식: 섹션명과 판단 기준을 고정합니다.",
      "4. 검증: 불확실한 내용은 질문하거나 추정이라고 표시하게 합니다."
    ];
  }

  if (toolId === "image_prompt") {
    return [
      "1. Subject: 실제로 보여야 할 대상과 상태를 먼저 씁니다.",
      "2. Composition: 카메라 거리, 구도, 배경의 역할을 지정합니다.",
      "3. Style: 매체, 조명, 색감, 질감을 구체화합니다.",
      "4. Negative: 흐림, 잘린 텍스트, 왜곡된 손, 과한 장식을 제외합니다."
    ];
  }

  return [
    "1. 요청을 목표, 맥락, 제약, 결과물로 분해합니다.",
    "2. 저장된 프로젝트와 기억 중 직접 연결되는 항목만 반영합니다.",
    "3. 실행 가능한 다음 행동을 제안합니다.",
    "4. 사용자의 피드백을 교육 기록으로 저장해 다음 응답에 반영합니다."
  ];
}

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[\s,.;:!?()[\]{}"'`~]+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2);
}
