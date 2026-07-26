import type { HeatherLanguage } from "@heather/core";

export type HeatherUiLocale = HeatherLanguage;

const messages = {
  ko: {
    rail: {
      dashboard: "대시보드",
      direct: "직접명령 등록",
      chat: "채팅",
      personal: "개인 메모리",
      research: "연구 메모리",
      researcher: "Researcher",
      local: "로컬 제어",
      settings: "설정",
      home: "Heather 홈"
    },
    dashboard: {
      brand: "Heather AI Assistant",
      tagline: "일상과 연구를 함께하는 파트너",
      avatar: "Heather 얼굴",
      avatarHint: "선택한 얼굴은 Heather가 표시되는 모든 화면에 적용됩니다.",
      faces: ["헤더 기본", "헤더 연구형", "헤더 친근형", "헤더 미래형"],
      accent: "강조 색상",
      language: "언어",
      saved: "설정은 이 기기에 저장됩니다.",
      workspace: "오늘의 작업 공간",
      ask: "Heather에게 요청하기",
      connected: "연결됨",
      direct: "직접명령",
      manage: "관리",
      directDetail: "반복 작업 설정",
      personal: "개인 메모리",
      personalDetail: "저장된 개인 맥락",
      personalEmpty: "저장된 메모리가 없습니다",
      research: "연구 메모리",
      researchDetail: "연구 컨텍스트 사용 가능",
      researchEmpty: "저장된 연구 메모리가 없습니다",
      conversations: "최근 대화",
      continue: "대화 이어가기",
      conversationsEmpty: "아직 저장된 대화가 없습니다",
      priorities: "우선 작업",
      openProjects: "프로젝트 열기",
      noProjects: "아직 등록된 프로젝트가 없습니다.",
      nextAction: "다음 작업이 없습니다.",
      researchStatus: "연구 상태",
      openResearcher: "Researcher 열기",
      noResearch: "최근 연구자료와 공정 데이터가 없습니다.",
      researchMemory: "연구 메모리",
      quickAccess: "빠른 진입",
      all: "전체 보기"
    }
  },
  en: {
    rail: {
      dashboard: "Dashboard",
      direct: "Direct Commands",
      chat: "Chat",
      personal: "Personal Memory",
      research: "Research Memory",
      researcher: "Researcher",
      local: "Local Control",
      settings: "Settings",
      home: "Heather home"
    },
    dashboard: {
      brand: "Heather AI Assistant",
      tagline: "A partner for everyday life and research",
      avatar: "Heather avatar",
      avatarHint: "Your selection is used anywhere Heather appears.",
      faces: ["Heather Classic", "Heather Research", "Heather Friendly", "Heather Future"],
      accent: "Accent color",
      language: "Language",
      saved: "Settings are saved on this device.",
      workspace: "Today’s workspace",
      ask: "Ask Heather",
      connected: "Connected",
      direct: "Direct commands",
      manage: "Manage",
      directDetail: "Configure recurring work",
      personal: "Personal memory",
      personalDetail: "Saved personal context",
      personalEmpty: "No saved memories yet",
      research: "Research memory",
      researchDetail: "Research context available",
      researchEmpty: "No saved research memories yet",
      conversations: "Recent chats",
      continue: "Continue a conversation",
      conversationsEmpty: "No saved conversations yet",
      priorities: "Priority work",
      openProjects: "Open projects",
      noProjects: "No projects have been added yet.",
      nextAction: "No next action yet.",
      researchStatus: "Research status",
      openResearcher: "Open Researcher",
      noResearch: "No recent research material or process data.",
      researchMemory: "Research memory",
      quickAccess: "Quick access",
      all: "View all"
    }
  }
} as const;

export function getHeatherMessages(locale: HeatherUiLocale) {
  return messages[locale] ?? messages.ko;
}
