import type {
  HeatherAction,
  HeatherActionName,
  HeatherActionRiskLevel
} from "./types";
import { createId } from "./conversation";

export const ALLOWED_HEATHER_ACTIONS: Array<{
  name: HeatherActionName;
  description: string;
  riskLevel: HeatherActionRiskLevel;
  requiresConfirmation: boolean;
}> = [
  {
    name: "check_ollama_status",
    description: "로컬 Ollama 서버 연결 상태와 선택 모델을 확인합니다.",
    riskLevel: "low",
    requiresConfirmation: false
  },
  {
    name: "get_system_info",
    description: "운영체제와 앱 버전 같은 안전한 시스템 정보를 확인합니다.",
    riskLevel: "low",
    requiresConfirmation: false
  },
  {
    name: "open_external_url",
    description: "http/https URL만 기본 브라우저로 엽니다.",
    riskLevel: "medium",
    requiresConfirmation: true
  },
  {
    name: "choose_directory",
    description: "사용자가 직접 폴더를 선택해 접근 허용 목록에 추가합니다.",
    riskLevel: "medium",
    requiresConfirmation: true
  },
  {
    name: "list_directory",
    description: "사용자가 허용한 폴더의 파일명, 확장자, 크기, 수정일만 조회합니다.",
    riskLevel: "medium",
    requiresConfirmation: true
  },
  {
    name: "search_files",
    description: "사용자가 허용한 폴더 내부에서 허용 확장자만 검색합니다.",
    riskLevel: "medium",
    requiresConfirmation: true
  },
  {
    name: "read_text_file",
    description: "사용자가 허용한 폴더 안의 안전한 텍스트 파일만 크기 제한 내에서 읽습니다.",
    riskLevel: "high",
    requiresConfirmation: true
  },
  {
    name: "get_clipboard_text",
    description: "사용자 확인 후 클립보드를 읽고 비밀번호나 토큰처럼 보이는 값은 마스킹합니다.",
    riskLevel: "high",
    requiresConfirmation: true
  },
  {
    name: "set_clipboard_text",
    description: "사용자 확인 후 지정한 텍스트를 클립보드에 넣습니다.",
    riskLevel: "medium",
    requiresConfirmation: true
  },
  {
    name: "capture_screen",
    description: "사용자 확인 후 화면 캡처 미리보기를 만들고 승인 후 분석 단계로 넘깁니다.",
    riskLevel: "high",
    requiresConfirmation: true
  },
  {
    name: "open_app",
    description: "허용 목록에 있는 앱만 실행합니다. Terminal은 열 수 있지만 command 실행은 금지합니다.",
    riskLevel: "high",
    requiresConfirmation: true
  }
];

export const FORBIDDEN_LOCAL_ACTIONS = [
  "파일 삭제",
  "파일 덮어쓰기",
  "폴더 전체 이동",
  "shell command 자동 실행",
  "이메일 자동 전송",
  "결제/구매",
  "비밀번호/토큰 읽기",
  "브라우저 쿠키 접근",
  "전체 디스크 스캔",
  "사용자 확인 없는 스크린샷",
  "사용자 확인 없는 클립보드 읽기"
];

const CRITICAL_PATTERNS = [
  /rm\s+-rf|shell|terminal.*command|명령어.*실행|터미널.*명령/i,
  /delete|삭제|덮어쓰기|overwrite|move.*folder|폴더.*이동/i,
  /password|비밀번호|token|토큰|cookie|쿠키/i,
  /결제|구매|송금|이체|payment|purchase/i,
  /send.*email|email.*send|메일.*보내/i,
  /전체.*디스크|full.*disk|entire.*disk/i
];

export function isForbiddenLocalAction(input: string): boolean {
  return CRITICAL_PATTERNS.some((pattern) => pattern.test(input));
}

export function createActionPlanFromRequest(input: string): HeatherAction[] {
  if (isForbiddenLocalAction(input)) {
    return [
      createAction({
        name: "get_system_info",
        description:
          "요청 안에 1차 버전 금지 작업이 포함되어 실행하지 않습니다. 대신 안전 정책만 확인합니다.",
        riskLevel: "critical",
        requiresConfirmation: false,
        args: {
          blocked: true,
          reason: "forbidden_local_action"
        }
      })
    ];
  }

  const lower = input.toLowerCase();
  const actions: HeatherAction[] = [];

  if (/ollama|올라마|로컬 ai|로컬 모델|model|모델/.test(lower)) {
    actions.push(createAction({ name: "check_ollama_status" }));
  }

  if (/컴퓨터 정보|시스템 정보|system info|os|운영체제/.test(lower)) {
    actions.push(createAction({ name: "get_system_info" }));
  }

  if (/폴더|folder|directory|디렉토리/.test(lower)) {
    actions.push(createAction({ name: "choose_directory" }));

    if (/pdf|파일.*찾|검색|search/.test(lower)) {
      actions.push(
        createAction({
          name: "search_files",
          args: {
            extensions: inferExtensions(input),
            query: inferSearchQuery(input)
          }
        })
      );
    } else if (/목록|list|조회/.test(lower)) {
      actions.push(createAction({ name: "list_directory" }));
    }

    if (/읽|요약|summar/i.test(input)) {
      actions.push(
        createAction({
          name: "read_text_file",
          args: {
            extensions: inferExtensions(input)
          }
        })
      );
    }
  }

  const url = input.match(/https?:\/\/[^\s)"']+/)?.[0];
  if (url || /링크.*열|url.*open|open.*url|사이트.*열/.test(lower)) {
    actions.push(
      createAction({
        name: "open_external_url",
        args: {
          url: url || ""
        }
      })
    );
  }

  if (/스크린샷|화면.*캡처|capture.*screen|screenshot/.test(lower)) {
    actions.push(createAction({ name: "capture_screen" }));
  }

  if (/클립보드.*읽|clipboard.*read|pasteboard.*read/.test(lower)) {
    actions.push(createAction({ name: "get_clipboard_text" }));
  }

  if (/클립보드.*넣|클립보드.*복사|clipboard.*write|copy.*clipboard/.test(lower)) {
    actions.push(createAction({ name: "set_clipboard_text" }));
  }

  const app = inferAppName(input);
  if (app) {
    actions.push(
      createAction({
        name: "open_app",
        args: {
          appName: app
        }
      })
    );
  }

  return dedupeActions(actions.length ? actions : [createAction({ name: "check_ollama_status" })]);
}

function createAction(params: {
  name: HeatherActionName;
  description?: string;
  riskLevel?: HeatherActionRiskLevel;
  requiresConfirmation?: boolean;
  args?: Record<string, unknown>;
}): HeatherAction {
  const definition = ALLOWED_HEATHER_ACTIONS.find((action) => action.name === params.name);
  return {
    id: createId("action"),
    name: params.name,
    description: params.description || definition?.description || params.name,
    riskLevel: params.riskLevel || definition?.riskLevel || "medium",
    requiresConfirmation: params.requiresConfirmation ?? definition?.requiresConfirmation ?? true,
    args: params.args || {}
  };
}

function dedupeActions(actions: HeatherAction[]): HeatherAction[] {
  const seen = new Set<string>();
  return actions.filter((action) => {
    if (seen.has(action.name)) return false;
    seen.add(action.name);
    return true;
  });
}

function inferExtensions(input: string): string[] {
  const allowed = ["pdf", "docx", "txt", "md", "png", "jpg", "csv", "json"];
  const lower = input.toLowerCase();
  const picked = allowed.filter((extension) => lower.includes(extension));
  return picked.length ? picked : ["pdf", "docx", "txt", "md", "png", "jpg"];
}

function inferSearchQuery(input: string): string {
  const quoted = input.match(/["“](.+?)["”]/)?.[1];
  if (quoted) return quoted.slice(0, 80);
  return "";
}

function inferAppName(input: string): string | null {
  const appMap: Array<[RegExp, string]> = [
    [/chrome|크롬/i, "Chrome"],
    [/safari|사파리/i, "Safari"],
    [/finder|파인더/i, "Finder"],
    [/vs code|vscode|visual studio code/i, "VS Code"],
    [/terminal|터미널/i, "Terminal"]
  ];

  return appMap.find(([pattern]) => pattern.test(input))?.[1] || null;
}
