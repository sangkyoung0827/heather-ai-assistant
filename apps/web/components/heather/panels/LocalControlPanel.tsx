"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Clipboard,
  Cpu,
  FolderOpen,
  HardDrive,
  Link,
  ListChecks,
  Mic,
  MicOff,
  Monitor,
  Play,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  X
} from "lucide-react";
import {
  ALLOWED_HEATHER_ACTIONS,
  ACCOUNT_PROFILES,
  createActionPlanFromRequest,
  getAccountProfile,
  nowIso
} from "@heather/core";
import type {
  ActionLogRecord,
  ActionResult,
  AccountProfileId,
  AccountServiceId,
  HeatherAction,
  HeatherActionName,
  HeatherSettings
} from "@heather/core";
import {
  DESKTOP_APP_ALLOWLIST,
  TauriDesktopPlatformAdapter,
  invokeTauriCommand,
  isTauriRuntime
} from "@heather/platform";
import type { AllowedDirectory, FileItem, SystemInfo } from "@heather/platform";

interface LocalControlPanelProps {
  settings: HeatherSettings;
  onSaveSettings: (settings: HeatherSettings) => Promise<void>;
}

type OllamaStatus = {
  available: boolean;
  baseUrl: string;
  configuredModel?: string;
  model: string;
  models?: string[];
  message: string;
};

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type WindowWithSpeechRecognition = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

const DEFAULT_REQUEST = "헤더, Ollama 연결 상태 확인해줘.";
const TEST_ACTIONS: Array<{
  label: string;
  request: string;
  actionName: HeatherActionName;
}> = [
  {
    label: "Test System Info",
    request: "헤더, 내 컴퓨터 정보를 확인해줘.",
    actionName: "get_system_info"
  },
  {
    label: "Test Open URL",
    request: "헤더, https://heather-ai-assistant.vercel.app 링크 열어줘.",
    actionName: "open_url"
  },
  {
    label: "Test YouTube Music",
    request: "헤더, 유튜브 뮤직에서 Living on a Prayer 재생해줘.",
    actionName: "search_youtube_music"
  },
  {
    label: "Test Calendar Read",
    request: "헤더, 오늘 일정 알려줘.",
    actionName: "calendar_read_events"
  },
  {
    label: "Test Calendar Create",
    request: "헤더, 내일 오후 3시에 창업 미팅 일정 등록해줘.",
    actionName: "calendar_create_event"
  },
  {
    label: "Test Gmail",
    request: "헤더, Gmail 열어줘.",
    actionName: "open_url"
  },
  {
    label: "Test Cursor",
    request: "헤더, Cursor 열어줘.",
    actionName: "open_app"
  },
  {
    label: "Test Pick Folder",
    request: "헤더, 내가 선택한 폴더를 허용해줘.",
    actionName: "choose_directory"
  },
  {
    label: "Test Search Files",
    request: "헤더, 내가 선택한 폴더 안의 pdf md csv json 파일을 찾아줘.",
    actionName: "search_files"
  },
  {
    label: "Test Read Text File",
    request: "헤더, 이 폴더 안의 md 파일을 읽고 요약해줘.",
    actionName: "read_text_file"
  },
  {
    label: "Test Action Log",
    request: "헤더, Ollama 연결 상태 확인해줘.",
    actionName: "check_ollama_status"
  }
];

export function LocalControlPanel({ settings, onSaveSettings }: LocalControlPanelProps) {
  const desktopAdapter = useMemo(
    () => (typeof window !== "undefined" && isTauriRuntime() ? new TauriDesktopPlatformAdapter() : null),
    []
  );
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null);
  const [bridgeStatus, setBridgeStatus] = useState<"확인 전" | "연결됨" | "웹 환경" | "오류">("확인 전");
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [allowedFolders, setAllowedFolders] = useState<AllowedDirectory[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState("");
  const [files, setFiles] = useState<FileItem[]>([]);
  const [request, setRequest] = useState(DEFAULT_REQUEST);
  const [plannedActions, setPlannedActions] = useState<HeatherAction[]>([]);
  const [pendingAction, setPendingAction] = useState<HeatherAction | null>(null);
  const [actionLogs, setActionLogs] = useState<ActionLogRecord[]>([]);
  const [calendarLogs, setCalendarLogs] = useState<ActionLogRecord[]>([]);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [clipboardEnabled, setClipboardEnabled] = useState(false);
  const [screenshotEnabled, setScreenshotEnabled] = useState(false);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    setClipboardEnabled(window.localStorage.getItem("heather.local.clipboard") === "true");
    setScreenshotEnabled(window.localStorage.getItem("heather.local.screenshot") === "true");
    const storedLogs = window.localStorage.getItem("heather.local.actionLogs");
    if (storedLogs) {
      try {
        setActionLogs(JSON.parse(storedLogs) as ActionLogRecord[]);
      } catch {
        setActionLogs([]);
      }
    }
    const storedCalendarLogs = window.localStorage.getItem("heather.local.calendarLogs");
    if (storedCalendarLogs) {
      try {
        setCalendarLogs(JSON.parse(storedCalendarLogs) as ActionLogRecord[]);
      } catch {
        setCalendarLogs([]);
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("heather.local.clipboard", String(clipboardEnabled));
  }, [clipboardEnabled]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("heather.local.screenshot", String(screenshotEnabled));
  }, [screenshotEnabled]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("heather.local.actionLogs", JSON.stringify(actionLogs.slice(0, 40)));
  }, [actionLogs]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("heather.local.calendarLogs", JSON.stringify(calendarLogs.slice(0, 40)));
  }, [calendarLogs]);

  async function updateSettings(partial: Partial<HeatherSettings>) {
    await onSaveSettings({
      ...settings,
      ...partial
    });
  }

  async function checkOllamaStatus() {
    setNotice("");
    try {
      const data = desktopAdapter
        ? await invokeTauriCommand<OllamaStatus>("ollama_status", {
            baseUrl: settings.ollamaBaseUrl,
            model: settings.ollamaModel
          })
        : await requestOllamaStatus(settings.ollamaBaseUrl, settings.ollamaModel);
      setOllamaStatus(data);
      return data;
    } catch {
      const data = {
        available: false,
        baseUrl: settings.ollamaBaseUrl,
        model: settings.ollamaModel,
        message: "Ollama가 실행 중인지 확인하세요. 터미널에서 `ollama serve`를 실행한 뒤 다시 시도하세요."
      };
      setOllamaStatus(data);
      return data;
    }
  }

  async function requestOllamaStatus(baseUrl: string, model: string): Promise<OllamaStatus> {
    const response = await fetch("/api/ollama/status", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        baseUrl,
        model
      })
    });
    return (await response.json()) as OllamaStatus;
  }

  async function checkBridgeStatus() {
    if (!desktopAdapter) {
      setBridgeStatus("웹 환경");
      return null;
    }

    try {
      const info = await desktopAdapter.getSystemInfo();
      setSystemInfo(info);
      setBridgeStatus("연결됨");
      return info;
    } catch (error) {
      setBridgeStatus("오류");
      setNotice(error instanceof Error ? error.message : "Desktop bridge 연결 실패");
      return null;
    }
  }

  async function chooseFolder() {
    if (!desktopAdapter?.chooseDirectory) {
      setNotice("Tauri Desktop bridge에서만 폴더 선택을 사용할 수 있습니다.");
      return null;
    }

    const folder = await desktopAdapter.chooseDirectory();
    if (folder) {
      setAllowedFolders((current) =>
        current.some((item) => item.id === folder.id) ? current : [folder, ...current]
      );
      setSelectedFolderId(folder.id);
    }
    return folder;
  }

  function planRequest() {
    setPlannedActions(createActionPlanFromRequest(request));
    setNotice("");
  }

  function toggleVoiceCommand() {
    if (isListening) {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      setIsListening(false);
      return;
    }

    const SpeechRecognition =
      (window as WindowWithSpeechRecognition).SpeechRecognition ||
      (window as WindowWithSpeechRecognition).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setNotice("이 환경은 음성 명령 입력을 지원하지 않습니다.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "ko-KR";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const transcript = event.results[event.results.length - 1]?.[0]?.transcript?.trim();
      if (!transcript) return;

      setRequest(transcript);
      setPlannedActions(createActionPlanFromRequest(transcript));
      setNotice("음성 명령을 action proposal로 변환했습니다. 실행 전 확인 모달을 거칩니다.");
    };
    recognition.onerror = (event) => {
      setIsListening(false);
      setNotice(event.error === "not-allowed" ? "마이크 권한이 거부되었습니다." : "음성 명령 입력 오류");
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setIsListening(false);
    };
    recognitionRef.current = recognition;
    setIsListening(true);
    recognition.start();
  }

  async function runTestRequest(testRequest: string, actionName: HeatherActionName) {
    const actions = createActionPlanFromRequest(testRequest);
    const selectedAction = actions.find((action) => action.name === actionName) || actions[0];
    setRequest(testRequest);
    setPlannedActions(actions);
    setNotice("");

    if (selectedAction) {
      await runAction(selectedAction);
    }
  }

  async function runAction(action: HeatherAction) {
    setPendingAction(action);
  }

  async function executeAction(action: HeatherAction) {
    setPendingAction(null);
    const result = await executeAllowlistedAction(action);
    appendLog(action, result);
    setNotice(result.summaryForUser);
  }

  async function executeAllowlistedAction(action: HeatherAction): Promise<ActionResult> {
    try {
      if (action.name === "check_ollama_status") {
        const status = await checkOllamaStatus();
        return {
          success: status.available,
          actionName: action.name,
          result: status,
          summaryForUser: status.message
        };
      }

      if (action.name === "get_system_info") {
        const info = await checkBridgeStatus();
        return {
          success: Boolean(info),
          actionName: action.name,
          result: info,
          summaryForUser: info
            ? `${info.osName} / Heather ${info.appVersion} / ${info.homeLabel}`
            : "Desktop bridge 연결이 필요합니다."
        };
      }

      if (action.name === "connect_google_calendar") {
        const url = "https://calendar.google.com/calendar/u/0/r/settings";
        await openSafeUrl(url);
        return {
          success: false,
          actionName: action.name,
          result: {
            accountProfileId: "work",
            service: "google_calendar",
            url
          },
          summaryForUser:
            "Google Calendar OAuth client is not configured yet. Work profile Calendar settings were opened; no password or token was stored."
        };
      }

      if (
        action.name === "calendar_read_events" ||
        action.name === "calendar_create_event" ||
        action.name === "calendar_update_event" ||
        action.name === "calendar_delete_event"
      ) {
        const result = await executeCalendarAction(action);
        appendCalendarLog(action, result);
        return result;
      }

      if (action.name === "choose_directory") {
        const folder = await chooseFolder();
        return {
          success: Boolean(folder),
          actionName: action.name,
          result: folder,
          summaryForUser: folder ? `${folder.label} 폴더를 허용 목록에 추가했습니다.` : "폴더 선택이 취소되었습니다."
        };
      }

      if (action.name === "list_directory") {
        const folderId = await requireFolderId();
        const entries = await desktopAdapter!.listDirectory!(folderId);
        setFiles(entries);
        return {
          success: true,
          actionName: action.name,
          result: entries,
          summaryForUser: `${entries.length}개 항목을 조회했습니다.`
        };
      }

      if (action.name === "search_files") {
        const folderId = await requireFolderId();
        const entries = await desktopAdapter!.searchFiles!({
          folderId,
          query: String(action.args.query || ""),
          extensions: Array.isArray(action.args.extensions)
            ? (action.args.extensions as string[])
            : ["pdf", "docx", "txt", "md", "csv", "json", "png", "jpg"]
        });
        setFiles(entries);
        return {
          success: true,
          actionName: action.name,
          result: entries,
          summaryForUser: `${entries.length}개 파일을 찾았습니다.`
        };
      }

      if (action.name === "read_text_file") {
        const textFile = files.find((file) => ["md", "txt", "csv", "json"].includes(file.extension || ""));
        if (!textFile?.id) {
          return {
            success: false,
            actionName: action.name,
            error: "읽을 텍스트 파일이 없습니다.",
            summaryForUser: "먼저 허용 폴더에서 md/txt/csv/json 파일을 검색하세요."
          };
        }
        const result = await desktopAdapter!.readTextFile!(textFile.id);
        return {
          success: true,
          actionName: action.name,
          result: {
            name: result.name,
            length: result.content.length,
            preview: result.content.slice(0, 600)
          },
          summaryForUser: `${result.name} 파일을 읽었습니다. 본문은 로그에 저장하지 않았습니다.`
        };
      }

      if (
        action.name === "open_url" ||
        action.name === "open_external_url" ||
        action.name === "search_web" ||
        action.name === "search_youtube"
      ) {
        const url = resolveActionUrl(action) || request.match(/https?:\/\/[^\s)"']+/)?.[0] || "";
        if (!url) throw new Error("열 URL을 찾지 못했습니다.");
        await openSafeUrl(url);
        return {
          success: true,
          actionName: action.name,
          result: {
            service: action.args.service,
            query: action.args.query,
            url
          },
          summaryForUser: `${url} 링크를 열었습니다.`
        };
      }

      if (action.name === "search_youtube_music") {
        const query = String(action.args.query || "");
        if (desktopAdapter?.playYouTubeMusic && query) {
          const result = await desktopAdapter.playYouTubeMusic(query);
          return {
            success: true,
            actionName: action.name,
            result,
            summaryForUser: result.message
          };
        }

        const url = resolveActionUrl(action);
        await openSafeUrl(url);
        return {
          success: true,
          actionName: action.name,
          result: {
            service: action.args.service,
            query,
            url
          },
          summaryForUser: `YouTube Music에서 "${query}" 검색 페이지를 열었습니다. 브라우저 권한이 허용되면 첫 결과를 재생할 수 있습니다.`
        };
      }

      if (
        action.name === "media_play" ||
        action.name === "media_pause" ||
        action.name === "media_next" ||
        action.name === "media_previous"
      ) {
        if (action.name === "media_play") {
          const query = String(action.args.query || request.replace(/헤더|재생|틀어|play|유튜브\s*뮤직|youtube\s*music/gi, "").trim());
          if (desktopAdapter?.playYouTubeMusic && query) {
            const result = await desktopAdapter.playYouTubeMusic(query);
            return {
              success: true,
              actionName: action.name,
              result,
              summaryForUser: result.message
            };
          }
        }

        return {
          success: false,
          actionName: action.name,
          result: {
            accountProfileId: "media",
            service: action.args.service || "youtube_music",
            driver: "youtube_music"
          },
          summaryForUser: "이 미디어 제어는 아직 지원 범위 밖입니다. YouTube Music 재생 요청은 곡명을 포함해 다시 요청해주세요."
        };
      }

      if (action.name === "get_clipboard_text") {
        if (!clipboardEnabled) throw new Error("Permission Center에서 클립보드 읽기를 켜야 합니다.");
        const text = await desktopAdapter!.getClipboardText!();
        return {
          success: true,
          actionName: action.name,
          result: {
            length: text.length,
            preview: text.slice(0, 300)
          },
          summaryForUser: "클립보드 텍스트를 읽었습니다. 민감정보처럼 보이는 값은 bridge에서 마스킹합니다."
        };
      }

      if (action.name === "set_clipboard_text") {
        if (!clipboardEnabled) throw new Error("Permission Center에서 클립보드 접근을 켜야 합니다.");
        await desktopAdapter!.setClipboardText!(request);
        return {
          success: true,
          actionName: action.name,
          summaryForUser: "요청 문장을 클립보드에 저장했습니다."
        };
      }

      if (action.name === "capture_screen") {
        if (!screenshotEnabled) throw new Error("Permission Center에서 스크린샷 접근을 켜야 합니다.");
        const blob = await desktopAdapter!.captureScreen!();
        if (screenshotPreview) URL.revokeObjectURL(screenshotPreview);
        setScreenshotPreview(URL.createObjectURL(blob));
        return {
          success: true,
          actionName: action.name,
          summaryForUser: "화면 캡처 미리보기를 만들었습니다. 승인 전에는 AI 분석으로 넘기지 않습니다."
        };
      }

      if (action.name === "open_app" || action.name === "focus_app") {
        const appName = String(action.args.appName || "");
        await desktopAdapter!.openLocalApp!(appName);
        return {
          success: true,
          actionName: action.name,
          result: {
            accountProfileId: action.args.accountProfileId,
            appName
          },
          summaryForUser: action.name === "focus_app" ? `${appName} 앱을 앞으로 가져왔습니다.` : `${appName} 앱을 열었습니다.`
        };
      }

      if (action.name === "close_window") {
        return {
          success: false,
          actionName: action.name,
          summaryForUser: "창 닫기 자동 실행은 아직 비활성화되어 있습니다. 사용자가 직접 닫아주세요."
        };
      }

      return {
        success: false,
        actionName: action.name,
        error: "Unsupported action",
        summaryForUser: "지원하지 않는 action입니다."
      };
    } catch (error) {
      return {
        success: false,
        actionName: action.name,
        error: error instanceof Error ? error.message : "Unknown action error",
        summaryForUser: error instanceof Error ? error.message : "작업 실행 중 오류가 발생했습니다."
      };
    }
  }

  async function executeCalendarAction(action: HeatherAction): Promise<ActionResult> {
    const calendarUrl = "https://calendar.google.com/calendar/u/0/r";
    await openSafeUrl(calendarUrl);

    if (action.name === "calendar_read_events") {
      return {
        success: false,
        actionName: action.name,
        result: {
          accountProfileId: "work",
          service: "google_calendar",
          range: action.args.range,
          url: calendarUrl
        },
        summaryForUser:
          "Work Google Calendar was opened. Google Calendar API OAuth is not connected yet, so Heather cannot read events directly."
      };
    }

    if (action.name === "calendar_create_event") {
      return {
        success: false,
        actionName: action.name,
        result: {
          accountProfileId: "work",
          service: "google_calendar",
          draft: action.args.draft,
          url: calendarUrl
        },
        summaryForUser:
          "Calendar event proposal is ready, but Google Calendar OAuth is not connected yet. No event was created and no token was stored."
      };
    }

    return {
      success: false,
      actionName: action.name,
      result: {
        accountProfileId: "work",
        service: "google_calendar",
        url: calendarUrl
      },
      summaryForUser:
        "Calendar update/delete requires Google Calendar OAuth and explicit confirmation. No calendar data was changed."
    };
  }

  async function requireFolderId(): Promise<string> {
    if (selectedFolderId) return selectedFolderId;
    const folder = await chooseFolder();
    if (!folder) {
      throw new Error("먼저 폴더를 선택해야 합니다.");
    }
    return folder.id;
  }

  async function openSafeUrl(url: string) {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("http/https URL만 열 수 있습니다.");
    }

    if (desktopAdapter) {
      await desktopAdapter.openExternalUrl(url);
      return;
    }

    window.open(url, "_blank", "noopener,noreferrer");
  }

  function appendLog(action: HeatherAction, result: ActionResult) {
    const log: ActionLogRecord = {
      id: `${Date.now()}-${action.name}`,
      requestedAt: nowIso(),
      userRequest: request.slice(0, 180),
      actionName: action.name,
      riskLevel: action.riskLevel,
      requiresConfirmation: action.requiresConfirmation,
      argsSummary: summarizeArgs(action),
      success: result.success,
      summaryForUser: result.summaryForUser,
      accountProfileId: normalizeProfileId(action.args.accountProfileId),
      service: normalizeServiceId(action.args.service)
    };
    setActionLogs((current) => [log, ...current].slice(0, 40));
  }

  function appendCalendarLog(action: HeatherAction, result: ActionResult) {
    const log: ActionLogRecord = {
      id: `${Date.now()}-${action.name}`,
      requestedAt: nowIso(),
      userRequest: request.slice(0, 180),
      actionName: action.name,
      riskLevel: action.riskLevel,
      requiresConfirmation: action.requiresConfirmation,
      argsSummary: summarizeArgs(action),
      success: result.success,
      summaryForUser: result.summaryForUser,
      accountProfileId: "work",
      service: "google_calendar"
    };
    setCalendarLogs((current) => [log, ...current].slice(0, 40));
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
      <section className="space-y-4">
        <div className="rounded-lg border border-line bg-white p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-heather-700">Local Control</p>
              <h3 className="text-2xl font-semibold">로컬 AI와 데스크톱 브리지</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusBadge label="Ollama" ok={Boolean(ollamaStatus?.available)} idle={!ollamaStatus} />
              <StatusBadge label="Bridge" ok={bridgeStatus === "연결됨"} idle={bridgeStatus === "확인 전"} />
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium">Ollama endpoint</span>
              <input
                value={settings.ollamaBaseUrl}
                onChange={(event) => void updateSettings({ ollamaBaseUrl: event.target.value })}
                className="mt-1 h-11 w-full rounded-lg border border-line px-3"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">선택 모델</span>
              <input
                value={settings.ollamaModel}
                onChange={(event) => void updateSettings({ ollamaModel: event.target.value })}
                className="mt-1 h-11 w-full rounded-lg border border-line px-3"
              />
            </label>
          </div>
          {ollamaStatus ? (
            <div className="mt-3 rounded-lg border border-line bg-slate-50 px-3 py-2 text-sm text-slate-600">
              <span className="font-semibold text-ink">{ollamaStatus.message}</span>
              {ollamaStatus.models?.length ? (
                <span className="mt-1 block">
                  설치 모델: {ollamaStatus.models.slice(0, 4).join(", ")}
                </span>
              ) : null}
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void checkOllamaStatus()}
              className="flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
            >
              <Cpu className="h-4 w-4 text-heather-700" />
              Ollama 확인
            </button>
            <button
              type="button"
              onClick={() => void checkBridgeStatus()}
              className="flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
            >
              <Monitor className="h-4 w-4 text-heather-700" />
              Bridge 확인
            </button>
            <button
              type="button"
              onClick={() => void chooseFolder()}
              className="flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
            >
              <FolderOpen className="h-4 w-4 text-heather-700" />
              폴더 허용
            </button>
          </div>

          {notice ? (
            <p className="mt-3 rounded-lg border border-line bg-slate-50 p-3 text-sm leading-6 text-slate-700">
              {notice}
            </p>
          ) : null}
        </div>

        <div className="rounded-lg border border-line bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-heather-700" />
            <h4 className="font-semibold">Action Planner</h4>
          </div>
          <textarea
            value={request}
            onChange={(event) => setRequest(event.target.value)}
            className="min-h-24 w-full resize-y rounded-lg border border-line px-3 py-2 text-sm leading-6"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={planRequest}
              className="flex items-center gap-2 rounded-lg border border-heather-700 bg-heather-700 px-3 py-2 text-sm font-semibold text-white hover:bg-heather-900"
            >
              <Search className="h-4 w-4" />
              계획 생성
            </button>
            <button
              type="button"
              onClick={toggleVoiceCommand}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${
                isListening
                  ? "border-coral bg-red-50 text-coral"
                  : "border-line bg-white hover:bg-slate-50"
              }`}
            >
              {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4 text-heather-700" />}
              {isListening ? "음성 입력 중지" : "음성 명령"}
            </button>
            <button
              type="button"
              onClick={() => setRequest(DEFAULT_REQUEST)}
              className="flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
            >
              <RefreshCw className="h-4 w-4 text-heather-700" />
              기본 요청
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2 rounded-lg border border-line bg-slate-50 p-3">
            {TEST_ACTIONS.map((testAction) => (
              <button
                key={testAction.label}
                type="button"
                onClick={() => void runTestRequest(testAction.request, testAction.actionName)}
                className="rounded-lg border border-line bg-white px-3 py-2 text-xs font-semibold hover:bg-slate-100"
              >
                {testAction.label}
              </button>
            ))}
          </div>

          <div className="mt-4 space-y-2">
            {plannedActions.map((action) => (
              <div key={action.id} className="rounded-lg border border-line bg-slate-50 p-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <strong>{action.name}</strong>
                      <RiskPill risk={action.riskLevel} />
                      {action.requiresConfirmation ? (
                        <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                          확인 필요
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm leading-5 text-slate-600">{action.description}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void runAction(action)}
                    className="flex shrink-0 items-center justify-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
                  >
                    <Play className="h-4 w-4 text-heather-700" />
                    실행
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-line bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <HardDrive className="h-4 w-4 text-heather-700" />
            <h4 className="font-semibold">결과</h4>
          </div>
          {systemInfo ? (
            <div className="grid gap-2 md:grid-cols-3">
              <InfoTile label="OS" value={systemInfo.osName} />
              <InfoTile label="App" value={systemInfo.appVersion} />
              <InfoTile label="Home" value={systemInfo.homeLabel} />
              <InfoTile label="CPU" value={systemInfo.cpuSummary} />
              <InfoTile label="Memory" value={systemInfo.memorySummary} />
            </div>
          ) : null}
          {files.length ? (
            <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-line heather-scrollbar">
              {files.slice(0, 60).map((file) => (
                <div key={`${file.id}-${file.relativePath}`} className="flex items-center justify-between gap-3 border-b border-line px-3 py-2 text-sm last:border-b-0">
                  <span className="min-w-0 truncate">{file.relativePath || file.name}</span>
                  <span className="shrink-0 text-xs text-slate-500">{file.extension || file.type}</span>
                </div>
              ))}
            </div>
          ) : null}
          {screenshotPreview ? (
            <div className="mt-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={screenshotPreview}
                alt="화면 캡처 미리보기"
                className="max-h-[360px] w-full rounded-lg border border-line object-contain"
              />
              <p className="mt-2 text-sm text-slate-600">
                미리보기만 생성했습니다. 사용자가 승인하기 전에는 AI 분석으로 넘기지 않습니다.
              </p>
            </div>
          ) : null}
        </div>
      </section>

      <aside className="space-y-4">
        <section className="rounded-lg border border-line bg-slate-50 p-4">
          <div className="mb-3 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-heather-700" />
            <h4 className="font-semibold">Permission Center</h4>
          </div>
          <Toggle label="클립보드 접근" checked={clipboardEnabled} onChange={setClipboardEnabled} />
          <Toggle label="스크린샷 접근" checked={screenshotEnabled} onChange={setScreenshotEnabled} />
          <Toggle label="위험 작업 확인 항상 켜기" checked onChange={() => undefined} disabled />

          <div className="mt-3 rounded-lg border border-line bg-white p-3">
            <p className="text-sm font-semibold">허용 폴더</p>
            <select
              value={selectedFolderId}
              onChange={(event) => setSelectedFolderId(event.target.value)}
              className="mt-2 h-10 w-full rounded-lg border border-line px-3 text-sm"
            >
              <option value="">선택된 폴더 없음</option>
              {allowedFolders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.label}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-3 rounded-lg border border-line bg-white p-3">
            <p className="text-sm font-semibold">앱 allowlist</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {DESKTOP_APP_ALLOWLIST.map((app) => (
                <span key={app} className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold">
                  {app}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-line bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-heather-700" />
            <h4 className="font-semibold">Account Profiles</h4>
          </div>
          <div className="space-y-2">
            {ACCOUNT_PROFILES.map((profile) => (
              <div key={profile.id} className="rounded-lg border border-line bg-slate-50 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <strong>{profile.name}</strong>
                  <span className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-slate-600">
                    {profile.connectionStatus}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">{profile.email}</p>
                <p className="mt-2 text-xs leading-5 text-slate-600">
                  {profile.purpose} / {profile.services.join(", ")}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Browser profile: {profile.defaultBrowserProfile || "not configured"}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-line bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <Clipboard className="h-4 w-4 text-heather-700" />
            <h4 className="font-semibold">Calendar Log</h4>
          </div>
          <div className="max-h-48 space-y-2 overflow-y-auto heather-scrollbar">
            {calendarLogs.length ? (
              calendarLogs.map((log) => (
                <div key={log.id} className="rounded-lg border border-line bg-slate-50 p-2 text-sm">
                  <strong>{log.actionName}</strong>
                  <p className="mt-1 text-xs leading-5 text-slate-600">{log.summaryForUser}</p>
                  <p className="mt-1 text-xs text-slate-400">{new Date(log.requestedAt).toLocaleString("ko-KR")}</p>
                </div>
              ))
            ) : (
              <p className="text-sm leading-6 text-slate-600">아직 캘린더 실행 기록이 없습니다.</p>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-line bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <Terminal className="h-4 w-4 text-heather-700" />
            <h4 className="font-semibold">사용 가능한 도구</h4>
          </div>
          <div className="space-y-2">
            {ALLOWED_HEATHER_ACTIONS.map((action) => (
              <div key={action.name} className="rounded-lg border border-line bg-slate-50 p-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <strong className="truncate">{action.name}</strong>
                  <RiskPill risk={action.riskLevel} />
                </div>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">{action.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-line bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <Clipboard className="h-4 w-4 text-heather-700" />
            <h4 className="font-semibold">Action Log</h4>
          </div>
          <div className="max-h-[420px] space-y-2 overflow-y-auto heather-scrollbar">
            {actionLogs.length ? (
              actionLogs.map((log) => (
                <div key={log.id} className="rounded-lg border border-line bg-slate-50 p-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <strong className="truncate">{log.actionName}</strong>
                    {log.success ? (
                      <CheckCircle2 className="h-4 w-4 text-heather-700" />
                    ) : (
                      <ShieldAlert className="h-4 w-4 text-coral" />
                    )}
                  </div>
                  <p className="mt-1 text-xs leading-5 text-slate-600">{log.summaryForUser}</p>
                  <p className="mt-1 text-xs text-slate-400">{new Date(log.requestedAt).toLocaleString("ko-KR")}</p>
                </div>
              ))
            ) : (
              <p className="text-sm leading-6 text-slate-600">아직 실행 기록이 없습니다.</p>
            )}
          </div>
        </section>
      </aside>

      {pendingAction ? (
        <ActionConfirmationModal
          action={pendingAction}
          onCancel={() => setPendingAction(null)}
          onConfirm={() => void executeAction(pendingAction)}
        />
      ) : null}
    </div>
  );
}

function StatusBadge({ label, ok, idle }: { label: string; ok: boolean; idle?: boolean }) {
  return (
    <span
      className={`rounded-md px-2 py-1 text-xs font-semibold ${
        idle
          ? "bg-slate-100 text-slate-600"
          : ok
            ? "bg-heather-50 text-heather-700"
            : "bg-amber-50 text-amber-700"
      }`}
    >
      {label}: {idle ? "대기" : ok ? "ok" : "check"}
    </span>
  );
}

function RiskPill({ risk }: { risk: string }) {
  return (
    <span
      className={`rounded-md px-2 py-1 text-xs font-semibold ${
        risk === "critical" || risk === "high"
          ? "bg-red-50 text-coral"
          : risk === "medium"
            ? "bg-amber-50 text-amber-700"
            : "bg-heather-50 text-heather-700"
      }`}
    >
      {risk}
    </span>
  );
}

function Toggle({
  label,
  checked,
  disabled,
  onChange
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="mb-2 flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-line bg-white px-3 py-3">
      <span className="text-sm font-medium">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5 accent-heather-700"
      />
    </label>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-slate-50 p-3">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-1 truncate font-semibold">{value}</p>
    </div>
  );
}

function ActionConfirmationModal({
  action,
  onCancel,
  onConfirm
}: {
  action: HeatherAction;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4">
      <section className="w-full max-w-lg rounded-lg border border-line bg-white p-4 shadow-soft">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-heather-700">Action Confirmation</p>
            <h3 className="text-xl font-semibold">{action.name}</h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-white hover:bg-slate-50"
            aria-label="닫기"
            title="닫기"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-3 text-sm">
          <ConfirmRow label="설명" value={action.description} icon={ListChecks} />
          <ConfirmRow label="접근 대상" value={summarizeArgs(action)} icon={Link} />
          <ConfirmRow label="위험도" value={action.riskLevel} icon={ShieldAlert} />
          <ConfirmRow label="예상 결과" value="허용된 adapter command만 실행하고 결과 요약을 로그에 저장합니다." icon={CheckCircle2} />
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-line bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg border border-heather-700 bg-heather-700 px-4 py-2 text-sm font-semibold text-white hover:bg-heather-900"
          >
            실행
          </button>
        </div>
      </section>
    </div>
  );
}

function ConfirmRow({
  label,
  value,
  icon: Icon
}: {
  label: string;
  value: string;
  icon: typeof ListChecks;
}) {
  return (
    <div className="flex gap-3 rounded-lg border border-line bg-slate-50 p-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-heather-700" />
      <div>
        <p className="font-semibold">{label}</p>
        <p className="mt-1 leading-5 text-slate-600">{value}</p>
      </div>
    </div>
  );
}

function summarizeArgs(action: HeatherAction): string {
  const profileId = normalizeProfileId(action.args.accountProfileId);
  const profile = profileId ? getAccountProfile(profileId) : null;
  const profileSummary = profile ? `${profile.id}/${profile.email} / ` : "";

  if (
    action.name === "open_url" ||
    action.name === "open_external_url" ||
    action.name === "search_web" ||
    action.name === "search_youtube" ||
    action.name === "search_youtube_music"
  ) {
    const query = action.args.query ? ` / query: ${String(action.args.query)}` : "";
    return `${profileSummary}${String(action.args.service || "url")}: ${String(action.args.url || "입력 요청에서 URL 추출")}${query}`;
  }
  if (action.name.startsWith("calendar_") || action.name === "connect_google_calendar") {
    return `${profileSummary}google_calendar / ${JSON.stringify(action.args.draft || action.args.range || "OAuth required")}`;
  }
  if (action.name.startsWith("media_")) return `${profileSummary}${String(action.args.service || "youtube_music")}`;
  if (action.name === "open_app" || action.name === "focus_app") return String(action.args.appName || "앱 allowlist");
  if (action.name === "close_window") return `${profileSummary}close window requires explicit confirmation`;
  if (action.name === "search_files") {
    const extensions = Array.isArray(action.args.extensions) ? action.args.extensions.join(", ") : "허용 확장자";
    return `선택 폴더 내부 / ${extensions}`;
  }
  if (action.name === "read_text_file") return "선택 폴더 내부의 안전한 텍스트 파일";
  if (action.name.includes("clipboard")) return "클립보드 내용은 로그에 저장하지 않음";
  if (action.name === "capture_screen") return "화면 캡처 미리보기";
  return "민감한 인자 없음";
}

function resolveActionUrl(action: HeatherAction): string {
  const explicitUrl = String(action.args.url || "");
  if (explicitUrl) return explicitUrl;

  const query = String(action.args.query || "");
  if (action.name === "search_youtube_music") {
    return `https://music.youtube.com/search?q=${encodeURIComponent(query)}`;
  }
  if (action.name === "search_youtube") {
    return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  }
  if (action.name === "search_web") {
    return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  }

  return "";
}

function normalizeProfileId(value: unknown): AccountProfileId | undefined {
  return value === "work" || value === "media" ? value : undefined;
}

function normalizeServiceId(value: unknown): AccountServiceId | undefined {
  const allowed: AccountServiceId[] = [
    "google_calendar",
    "gmail",
    "google_drive",
    "docs",
    "meetings",
    "youtube",
    "youtube_music",
    "netflix",
    "google_search"
  ];
  return allowed.find((service) => service === value);
}
