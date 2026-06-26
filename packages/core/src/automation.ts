import type {
  AutomationAction,
  AutomationActionType,
  AutomationExecutionStep,
  AutomationPlan,
  AutomationRecipe,
  AutomationTriggerType
} from "./types";
import { createId, nowIso } from "./conversation";

const WEB_EXECUTABLE_ACTIONS: AutomationActionType[] = ["open_url", "speak", "clipboard_write"];
const DESKTOP_ACTIONS: AutomationActionType[] = [
  "open_app",
  "focus_app",
  "capture_screen",
  "clipboard_read"
];

export const AUTOMATION_TRIGGER_LABELS: Record<AutomationTriggerType, string> = {
  manual: "수동 실행",
  voice: "음성 호출",
  double_clap: "더블클랩",
  schedule: "예약 실행"
};

export const AUTOMATION_ACTION_LABELS: Record<AutomationActionType, string> = {
  open_url: "웹 주소 열기",
  open_app: "로컬 앱 실행",
  speak: "음성으로 말하기",
  focus_app: "앱 앞으로 가져오기",
  capture_screen: "화면 읽기",
  clipboard_read: "클립보드 읽기",
  clipboard_write: "클립보드 쓰기"
};

export function createAutomationAction(params: {
  type: AutomationActionType;
  label: string;
  value: string;
  enabled?: boolean;
  desktopOnly?: boolean;
  requiresConfirmation?: boolean;
}): AutomationAction {
  const desktopOnly = params.desktopOnly ?? DESKTOP_ACTIONS.includes(params.type);
  return {
    id: createId("action"),
    type: params.type,
    label: params.label,
    value: params.value,
    enabled: params.enabled ?? true,
    desktopOnly,
    requiresConfirmation: params.requiresConfirmation ?? desktopOnly
  };
}

export function createDefaultJarvisRecipe(timestamp = nowIso()): AutomationRecipe {
  return {
    id: "routine_jarvis_morning",
    title: "Jarvis 시작 루틴",
    description:
      "더블클랩으로 데스크톱 작업 환경을 열던 Jarvis 아이디어를 Heather용 안전 루틴으로 옮긴 기본값입니다.",
    trigger: {
      type: "manual",
      label: "지금은 버튼으로 실행",
      phrase: "헤더, 시작 루틴 실행"
    },
    welcomeMessage: "좋아요. 오늘 작업 환경을 열고, 필요한 것부터 차분히 정리해볼게요.",
    actions: [
      createAutomationAction({
        type: "speak",
        label: "환영 멘트 말하기",
        value: "좋아요. 오늘 작업 환경을 열고, 필요한 것부터 차분히 정리해볼게요.",
        requiresConfirmation: false
      }),
      createAutomationAction({
        type: "open_url",
        label: "Claude 열기",
        value: "https://claude.ai",
        requiresConfirmation: false
      }),
      createAutomationAction({
        type: "open_url",
        label: "시장/정보 대시보드 열기",
        value: "https://www.binance.com",
        requiresConfirmation: false
      }),
      createAutomationAction({
        type: "open_url",
        label: "Spotify 열기",
        value: "https://open.spotify.com",
        requiresConfirmation: false
      }),
      createAutomationAction({
        type: "open_app",
        label: "Cursor 실행",
        value: "Cursor",
        desktopOnly: true,
        requiresConfirmation: true
      })
    ],
    enabled: true,
    created_at: timestamp,
    updated_at: timestamp
  };
}

export function createBlankAutomationRecipe(timestamp = nowIso()): AutomationRecipe {
  return {
    id: createId("routine"),
    title: "새 Heather 루틴",
    description: "반복해서 실행할 개인 비서 행동 묶음을 설계하세요.",
    trigger: {
      type: "manual",
      label: AUTOMATION_TRIGGER_LABELS.manual,
      phrase: "헤더, 이 루틴 실행"
    },
    welcomeMessage: "좋아요. 지금부터 순서대로 처리할게요.",
    actions: [
      createAutomationAction({
        type: "speak",
        label: "진행 알림",
        value: "좋아요. 지금부터 순서대로 처리할게요.",
        requiresConfirmation: false
      })
    ],
    enabled: true,
    created_at: timestamp,
    updated_at: timestamp
  };
}

export function planAutomation(recipe: AutomationRecipe): AutomationPlan {
  const steps = recipe.actions.map((action) => describeActionStatus(action));
  const runnableCount = steps.filter((step) => step.status === "webExecutable").length;
  const desktopCount = steps.filter((step) => step.status === "desktopOnly").length;
  const confirmationCount = steps.filter((step) => step.status === "needsConfirmation").length;

  return {
    recipeId: recipe.id,
    title: recipe.title,
    triggerLabel: recipe.trigger.label || AUTOMATION_TRIGGER_LABELS[recipe.trigger.type],
    summary: [
      `${runnableCount}개는 현재 웹에서 실행 가능`,
      desktopCount ? `${desktopCount}개는 데스크톱 브리지 필요` : "",
      confirmationCount ? `${confirmationCount}개는 확인 필요` : ""
    ]
      .filter(Boolean)
      .join(" / "),
    steps
  };
}

export function describeAutomationRecipe(recipe: AutomationRecipe): string {
  const plan = planAutomation(recipe);
  return [
    `${recipe.title}: ${recipe.description}`,
    `트리거: ${plan.triggerLabel}`,
    `환영 멘트: ${recipe.welcomeMessage}`,
    `실행 계획: ${plan.summary}`,
    ...plan.steps.map((step) => `- ${step.label}: ${step.reason}`)
  ].join("\n");
}

export function isWebExecutableAction(action: AutomationAction): boolean {
  return action.enabled && !action.desktopOnly && WEB_EXECUTABLE_ACTIONS.includes(action.type);
}

function describeActionStatus(action: AutomationAction): AutomationExecutionStep {
  if (!action.enabled) {
    return {
      actionId: action.id,
      label: action.label,
      type: action.type,
      status: "disabled",
      reason: "비활성화되어 실행하지 않습니다."
    };
  }

  if (action.desktopOnly) {
    return {
      actionId: action.id,
      label: action.label,
      type: action.type,
      status: "desktopOnly",
      reason: "브라우저가 아닌 데스크톱 앱 권한으로 실행해야 합니다."
    };
  }

  if (action.requiresConfirmation) {
    return {
      actionId: action.id,
      label: action.label,
      type: action.type,
      status: "needsConfirmation",
      reason: "실행 전 사용자 확인이 필요합니다."
    };
  }

  if (WEB_EXECUTABLE_ACTIONS.includes(action.type)) {
    return {
      actionId: action.id,
      label: action.label,
      type: action.type,
      status: "webExecutable",
      reason: "현재 웹앱에서 실행할 수 있습니다."
    };
  }

  return {
    actionId: action.id,
    label: action.label,
    type: action.type,
    status: "ready",
    reason: "지원 어댑터가 연결되면 실행할 수 있습니다."
  };
}
