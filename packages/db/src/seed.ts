import { createId, nowIso } from "@heather/core";
import type { HeatherSettings, MemoryRecord, ProjectRecord } from "@heather/core";

export function createDefaultSettings(): HeatherSettings {
  return {
    tone: "analytical",
    aiMode: "local_only",
    allowPaidApiCalls: false,
    monthlyApiCallLimit: 0,
    apiCallsThisMonth: 0,
    apiUsageMonth: new Date().toISOString().slice(0, 7),
    cacheResponses: true,
    voiceOutputEnabled: true,
    voiceName: "Heather 기본 음성",
    memoryEnabled: true,
    projectMemoryEnabled: true,
    confirmRiskyActions: true
  };
}

function project(params: {
  title: string;
  description: string;
  priority: ProjectRecord["priority"];
  notes?: string[];
  nextActions?: string[];
  relatedPeople?: string[];
}): ProjectRecord {
  const timestamp = nowIso();
  return {
    id: createId("project"),
    title: params.title,
    description: params.description,
    status: "active",
    priority: params.priority,
    related_people: params.relatedPeople || [],
    key_links: [],
    notes: params.notes || [],
    decisions: [],
    next_actions: params.nextActions || [],
    created_at: timestamp,
    updated_at: timestamp
  };
}

export function createSeedProjects(): ProjectRecord[] {
  return [
    project({
      title: "ECC",
      description: "국제 교류 활동과 신청/운영 흐름을 정리하는 프로젝트.",
      priority: "high",
      notes: ["행사 신청, 참가자 관리, 운영자 확인 흐름을 기억해야 함."],
      nextActions: ["최근 신청 흐름 점검", "운영자 화면에서 누락된 상태 확인"]
    }),
    project({
      title: "한활",
      description: "한국 문화/활동 관련 프로젝트를 장기적으로 관리.",
      priority: "medium",
      notes: ["콘텐츠, 참가자, 제출 흐름이 함께 얽힘."],
      nextActions: ["현재 공개 페이지와 신청 흐름 정리"]
    }),
    project({
      title: "Xstudy Universe",
      description: "학습/캐릭터/세계관 기반 프로젝트.",
      priority: "medium",
      nextActions: ["핵심 사용자 경험을 한 문장으로 재정의"]
    }),
    project({
      title: "K_LINE",
      description: "K_LINE 웹사이트와 관련 활동을 운영하는 프로젝트.",
      priority: "high",
      nextActions: ["배포 상태와 관리자 기능 확인"]
    }),
    project({
      title: "유튜브 채널",
      description: "콘텐츠 기획, 업로드, 채널 브랜딩을 정리.",
      priority: "medium",
      nextActions: ["다음 영상 주제 3개 도출"]
    }),
    project({
      title: "창업 지원사업",
      description: "지원사업 문서, 일정, 제출 자료를 관리.",
      priority: "urgent",
      nextActions: ["마감 일정 확인", "제출 서류 체크리스트 작성"]
    }),
    project({
      title: "여자친구 한국 입국/여행",
      description: "입국, 여행 동선, 일정, 관계적 배려 사항을 관리.",
      priority: "high",
      nextActions: ["입국 일정 기준으로 해야 할 일 정리"]
    }),
    project({
      title: "주변인 프로파일링 보고서",
      description: "사람/조직의 행동 패턴과 책임 구조를 분석.",
      priority: "medium",
      notes: ["좋은 기회와 업무 전가의 경계를 분명히 기록해야 함."],
      nextActions: ["분석 대상별 관찰 사실과 추정을 분리"]
    })
  ];
}

export function createSeedMemories(): MemoryRecord[] {
  const timestamp = nowIso();
  return [
    {
      id: createId("memory"),
      type: "decision_rule",
      content:
        "사용자는 좋은 기회와 지속적인 업무 전가 사이의 경계가 흐려지는 상황을 특히 정확하게 분석하길 원한다.",
      source: "initial_requirements",
      confidence: 0.92,
      tags: ["relationship-analysis", "boundary", "workload"],
      created_at: timestamp,
      updated_at: timestamp,
      archived: false
    },
    {
      id: createId("memory"),
      type: "writing_preference",
      content: "헤더의 말투는 기계적이기보다 함께 브레인스토밍하는 사람처럼 논리적이고 차분해야 한다.",
      source: "initial_requirements",
      confidence: 0.86,
      tags: ["persona", "tone"],
      created_at: timestamp,
      updated_at: timestamp,
      archived: false
    }
  ];
}
