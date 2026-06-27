import type {
  HeatherAction,
  HeatherActionName,
  HeatherActionRiskLevel
} from "./types";
import {
  buildServiceUrl,
  inferCalendarRange,
  parseCalendarEventDraft,
  routeAccountProfile
} from "./account-profiles";
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
    name: "connect_google_calendar",
    description: "work 계정으로 Google Calendar OAuth 연결을 준비합니다. 비밀번호는 저장하지 않습니다.",
    riskLevel: "medium",
    requiresConfirmation: true
  },
  {
    name: "calendar_read_events",
    description: "work 계정의 Google Calendar 일정을 조회합니다.",
    riskLevel: "low",
    requiresConfirmation: true
  },
  {
    name: "calendar_create_event",
    description: "work 계정 Google Calendar에 일정 생성을 제안하고 확인 후 실행합니다.",
    riskLevel: "medium",
    requiresConfirmation: true
  },
  {
    name: "calendar_update_event",
    description: "work 계정 Google Calendar 일정을 수정합니다.",
    riskLevel: "medium",
    requiresConfirmation: true
  },
  {
    name: "calendar_delete_event",
    description: "work 계정 Google Calendar 일정을 삭제합니다. 명시 확인이 필요합니다.",
    riskLevel: "high",
    requiresConfirmation: true
  },
  {
    name: "media_play",
    description: "허용된 미디어 사이트에서 재생을 시도합니다.",
    riskLevel: "low",
    requiresConfirmation: true
  },
  {
    name: "media_pause",
    description: "허용된 미디어 사이트에서 일시정지를 시도합니다.",
    riskLevel: "low",
    requiresConfirmation: true
  },
  {
    name: "media_next",
    description: "허용된 미디어 사이트에서 다음 항목으로 이동을 시도합니다.",
    riskLevel: "low",
    requiresConfirmation: true
  },
  {
    name: "media_previous",
    description: "허용된 미디어 사이트에서 이전 항목으로 이동을 시도합니다.",
    riskLevel: "low",
    requiresConfirmation: true
  },
  {
    name: "open_url",
    description: "http/https URL만 기본 브라우저로 엽니다.",
    riskLevel: "medium",
    requiresConfirmation: true
  },
  {
    name: "open_external_url",
    description: "http/https URL만 기본 브라우저로 엽니다.",
    riskLevel: "medium",
    requiresConfirmation: true
  },
  {
    name: "search_web",
    description: "기본 웹 검색 URL을 열어 사용자의 검색어를 찾습니다.",
    riskLevel: "medium",
    requiresConfirmation: true
  },
  {
    name: "search_youtube",
    description: "YouTube 검색 결과 페이지를 엽니다. 자동 재생은 하지 않습니다.",
    riskLevel: "medium",
    requiresConfirmation: true
  },
  {
    name: "search_youtube_music",
    description: "YouTube Music 검색 결과 페이지를 엽니다. 자동 재생은 하지 않습니다.",
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
  },
  {
    name: "focus_app",
    description: "허용 목록에 있는 앱 창을 앞으로 가져옵니다.",
    riskLevel: "low",
    requiresConfirmation: true
  },
  {
    name: "close_window",
    description: "현재 창 닫기를 제안합니다. 항상 확인이 필요합니다.",
    riskLevel: "medium",
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
  const accountRoute = routeAccountProfile(input);

  if (/ollama|올라마|로컬 ai|로컬 모델|model|모델/.test(lower)) {
    actions.push(createAction({ name: "check_ollama_status" }));
  }

  if (/컴퓨터 정보|시스템 정보|system info|os|운영체제/.test(lower)) {
    actions.push(createAction({ name: "get_system_info" }));
  }

  if (/calendar|캘린더|일정|회의|미팅|스케줄/.test(lower)) {
    if (/연결|connect|oauth/i.test(input)) {
      actions.push(
        createAction({
          name: "connect_google_calendar",
          args: {
            accountProfileId: "work",
            service: "google_calendar",
            email: "waterfallingsound0827@gmail.com"
          }
        })
      );
    } else if (/삭제|지워|delete/i.test(input)) {
      actions.push(
        createAction({
          name: "calendar_delete_event",
          args: {
            accountProfileId: "work",
            service: "google_calendar",
            range: inferCalendarRange(input)
          }
        })
      );
    } else if (/수정|변경|update/i.test(input)) {
      actions.push(
        createAction({
          name: "calendar_update_event",
          args: {
            accountProfileId: "work",
            service: "google_calendar",
            draft: parseCalendarEventDraft(input)
          }
        })
      );
    } else if (/등록|추가|만들|create|add/i.test(input)) {
      actions.push(
        createAction({
          name: "calendar_create_event",
          args: {
            accountProfileId: "work",
            service: "google_calendar",
            draft: parseCalendarEventDraft(input)
          }
        })
      );
    } else {
      actions.push(
        createAction({
          name: "calendar_read_events",
          args: {
            accountProfileId: "work",
            service: "google_calendar",
            range: inferCalendarRange(input)
          }
        })
      );
    }
  }

  const musicQuery = inferYouTubeMusicQuery(input);
  if (musicQuery) {
    actions.push(
      createAction({
        name: "search_youtube_music",
        description: `YouTube Music에서 "${musicQuery}" 검색 페이지를 엽니다. 자동 재생은 하지 않습니다.`,
        args: {
          intent: /재생|틀어|play/i.test(input) ? "play_music" : "music_search",
          accountProfileId: "media",
          service: "youtube_music",
          query: musicQuery,
          url: buildSearchUrl("youtube_music", musicQuery)
        }
      })
    );
  } else if (/youtube|유튜브/.test(lower)) {
    const query = inferServiceQuery(input, ["youtube", "유튜브"]);
    actions.push(
      createAction({
        name: "search_youtube",
        args: {
          intent: "video_search",
          accountProfileId: "media",
          service: "youtube",
          query,
          url: buildSearchUrl("youtube", query)
        }
      })
    );
  } else if (/검색|search|찾아봐|찾아 줘|찾아줘/.test(lower) && !/파일|folder|directory|폴더/.test(lower)) {
    const query = inferServiceQuery(input, ["검색", "search", "찾아봐", "찾아 줘", "찾아줘"]);
    actions.push(
      createAction({
        name: "search_web",
        args: {
          intent: "web_search",
          accountProfileId: accountRoute.profileId,
          service: "web",
          query,
          url: buildSearchUrl("web", query)
        }
      })
    );
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
        name: "open_url",
        args: {
          accountProfileId: accountRoute.profileId,
          service: accountRoute.service,
          url: url || ""
        }
      })
    );
  }

  if (/gmail|지메일/.test(lower)) {
    actions.push(
      createAction({
        name: "open_url",
        description: "work 계정용 Gmail URL을 엽니다. 올바른 브라우저 세션인지 사용자가 확인해야 합니다.",
        args: {
          accountProfileId: "work",
          service: "gmail",
          url: buildServiceUrl("gmail")
        }
      })
    );
  }

  if (/netflix|넷플릭스/.test(lower)) {
    actions.push(
      createAction({
        name: "open_url",
        description: "media 계정용 Netflix URL을 엽니다. 올바른 브라우저 세션인지 사용자가 확인해야 합니다.",
        args: {
          accountProfileId: "media",
          service: "netflix",
          url: buildServiceUrl("netflix")
        }
      })
    );
  }

  if (/유튜브\s*뮤직\s*열|youtube music.*open|open.*youtube music/i.test(input)) {
    actions.push(
      createAction({
        name: "open_url",
        args: {
          accountProfileId: "media",
          service: "youtube_music",
          url: buildServiceUrl("youtube_music")
        }
      })
    );
  }

  if (/음악\s*(꺼|중지)|일시정지|pause/i.test(input)) {
    actions.push(
      createAction({
        name: "media_pause",
        args: {
          accountProfileId: "media",
          service: "youtube_music",
          driver: "youtube_music"
        }
      })
    );
  }

  if (/다시\s*재생|재생해줘|play/i.test(input) && !musicQuery) {
    actions.push(
      createAction({
        name: "media_play",
        args: {
          accountProfileId: "media",
          service: "youtube_music",
          driver: "youtube_music"
        }
      })
    );
  }

  if (/다음\s*곡|next/i.test(input)) {
    actions.push(
      createAction({
        name: "media_next",
        args: {
          accountProfileId: "media",
          service: "youtube_music",
          driver: "youtube_music"
        }
      })
    );
  }

  if (/이전\s*곡|previous|prev/i.test(input)) {
    actions.push(
      createAction({
        name: "media_previous",
        args: {
          accountProfileId: "media",
          service: "youtube_music",
          driver: "youtube_music"
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
        name: /focus|앞으로|활성화|포커스/i.test(input) ? "focus_app" : "open_app",
        args: {
          accountProfileId: accountRoute.profileId,
          appName: app
        }
      })
    );
  }

  if (/창\s*닫|close window|window close/i.test(input)) {
    actions.push(
      createAction({
        name: "close_window",
        args: {
          accountProfileId: accountRoute.profileId
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
  return picked.length ? picked : ["pdf", "docx", "txt", "md", "csv", "json", "png", "jpg"];
}

function inferSearchQuery(input: string): string {
  const quoted = input.match(/["“](.+?)["”]/)?.[1];
  if (quoted) return quoted.slice(0, 80);
  return "";
}

function inferYouTubeMusicQuery(input: string): string | null {
  const lower = input.toLowerCase();
  if (!/youtube music|유튜브 뮤직|유튜브뮤직|music youtube/.test(lower)) return null;

  return inferServiceQuery(input, ["유튜브 뮤직에서", "유튜브뮤직에서", "youtube music", "music youtube"]);
}

function inferServiceQuery(input: string, markers: string[]): string {
  const quoted = input.match(/["“](.+?)["”]/)?.[1];
  if (quoted) return quoted.trim().slice(0, 120);

  let query = input.trim();
  for (const marker of markers) {
    const index = query.toLowerCase().indexOf(marker.toLowerCase());
    if (index >= 0) {
      query = query.slice(index + marker.length).trim();
      break;
    }
  }

  query = query
    .replace(/^(에서|로|에|을|를|좀|please)\s*/i, "")
    .replace(/\s*(재생해줘|재생해 줘|틀어줘|틀어 줘|검색해줘|검색해 줘|찾아줘|찾아 줘|open|play|search)\s*$/i, "")
    .trim();

  return query.slice(0, 120);
}

function buildSearchUrl(service: "web" | "youtube" | "youtube_music", query: string): string {
  const encoded = encodeURIComponent(query);
  if (service === "youtube_music") return `https://music.youtube.com/search?q=${encoded}`;
  if (service === "youtube") return `https://www.youtube.com/results?search_query=${encoded}`;
  return `https://www.google.com/search?q=${encoded}`;
}

function inferAppName(input: string): string | null {
  const appMap: Array<[RegExp, string]> = [
    [/chrome|크롬|google chrome/i, "Google Chrome"],
    [/safari|사파리/i, "Safari"],
    [/finder|파인더/i, "Finder"],
    [/cursor|커서/i, "Cursor"],
    [/vs code|vscode|visual studio code/i, "VS Code"],
    [/notes|메모/i, "Notes"],
    [/calendar|캘린더/i, "Calendar"],
    [/music|음악/i, "Music"],
    [/zoom|줌/i, "Zoom"],
    [/terminal|터미널/i, "Terminal"]
  ];

  return appMap.find(([pattern]) => pattern.test(input))?.[1] || null;
}
