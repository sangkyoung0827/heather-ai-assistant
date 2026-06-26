"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clipboard,
  ExternalLink,
  Monitor,
  Plus,
  Play,
  Save,
  ShieldCheck,
  Trash2,
  Volume2,
  Zap
} from "lucide-react";
import {
  AUTOMATION_ACTION_LABELS,
  AUTOMATION_TRIGGER_LABELS,
  createAutomationAction,
  createBlankAutomationRecipe,
  isWebExecutableAction,
  nowIso,
  planAutomation
} from "@heather/core";
import type {
  AutomationAction,
  AutomationActionType,
  AutomationRecipe,
  AutomationTriggerType
} from "@heather/core";

interface AutomationPanelProps {
  recipes: AutomationRecipe[];
  onSaveRecipe: (recipe: AutomationRecipe) => Promise<void>;
  onDeleteRecipe: (id: string) => Promise<void>;
}

type RunLog = {
  id: string;
  tone: "ok" | "warn" | "skip";
  message: string;
};

const ACTION_TYPES: AutomationActionType[] = [
  "speak",
  "open_url",
  "open_app",
  "focus_app",
  "capture_screen",
  "clipboard_read",
  "clipboard_write"
];

const TRIGGER_TYPES: AutomationTriggerType[] = ["manual", "voice", "double_clap", "schedule"];

const DESKTOP_ACTIONS: AutomationActionType[] = [
  "open_app",
  "focus_app",
  "capture_screen",
  "clipboard_read"
];

export function AutomationPanel({
  recipes,
  onSaveRecipe,
  onDeleteRecipe
}: AutomationPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(recipes[0]?.id || null);
  const selectedRecipe = useMemo(
    () => recipes.find((recipe) => recipe.id === selectedId) || recipes[0] || null,
    [recipes, selectedId]
  );
  const [draft, setDraft] = useState<AutomationRecipe | null>(selectedRecipe);
  const [runLog, setRunLog] = useState<RunLog[]>([]);

  useEffect(() => {
    if (!selectedId && recipes[0]) {
      setSelectedId(recipes[0].id);
    }
  }, [recipes, selectedId]);

  useEffect(() => {
    setDraft(selectedRecipe);
    setRunLog([]);
  }, [selectedRecipe]);

  const plan = useMemo(() => (draft ? planAutomation(draft) : null), [draft]);
  const runnableCount = useMemo(
    () => draft?.actions.filter((action) => isWebExecutableAction(action)).length || 0,
    [draft]
  );

  async function handleCreateRecipe() {
    const recipe = createBlankAutomationRecipe();
    await onSaveRecipe(recipe);
    setSelectedId(recipe.id);
  }

  async function handleSave() {
    if (!draft) return;
    await onSaveRecipe({
      ...draft,
      updated_at: nowIso()
    });
  }

  async function handleDelete() {
    if (!draft) return;
    if (!window.confirm("이 루틴을 삭제할까요?")) return;
    await onDeleteRecipe(draft.id);
    setSelectedId(null);
  }

  function addAction(type: AutomationActionType) {
    if (!draft) return;
    const action = createAutomationAction({
      type,
      label: AUTOMATION_ACTION_LABELS[type],
      value: defaultActionValue(type)
    });
    setDraft({
      ...draft,
      actions: [...draft.actions, action]
    });
  }

  function updateAction(actionId: string, patch: Partial<AutomationAction>) {
    if (!draft) return;
    setDraft({
      ...draft,
      actions: draft.actions.map((action) =>
        action.id === actionId
          ? normalizeAction({
              ...action,
              ...patch
            })
          : action
      )
    });
  }

  function removeAction(actionId: string) {
    if (!draft) return;
    setDraft({
      ...draft,
      actions: draft.actions.filter((action) => action.id !== actionId)
    });
  }

  async function runRecipe() {
    if (!draft) return;
    setRunLog([]);

    if (!draft.enabled) {
      appendRunLog("warn", "루틴이 paused 상태라 실행하지 않았습니다.");
      return;
    }

    for (const action of draft.actions) {
      if (!action.enabled) {
        appendRunLog("skip", `${action.label}: 비활성화됨`);
        continue;
      }

      if (action.desktopOnly) {
        appendRunLog("warn", `${action.label}: 데스크톱 브리지 연결 후 실행 가능`);
        continue;
      }

      if (action.requiresConfirmation && !window.confirm(`${action.label}을 실행할까요?`)) {
        appendRunLog("skip", `${action.label}: 사용자 확인 전이라 건너뜀`);
        continue;
      }

      if (action.type === "open_url") {
        const url = normalizeUrl(action.value);
        if (!url) {
          appendRunLog("warn", `${action.label}: 올바른 URL이 아닙니다.`);
          continue;
        }
        window.open(url, "_blank", "noopener,noreferrer");
        appendRunLog("ok", `${action.label}: 새 탭으로 열었습니다.`);
        continue;
      }

      if (action.type === "speak") {
        speak(action.value || draft.welcomeMessage);
        appendRunLog("ok", `${action.label}: 브라우저 음성으로 재생했습니다.`);
        continue;
      }

      if (action.type === "clipboard_write") {
        try {
          await navigator.clipboard.writeText(action.value);
          appendRunLog("ok", `${action.label}: 클립보드에 복사했습니다.`);
        } catch {
          appendRunLog("warn", `${action.label}: 브라우저 권한 때문에 실패했습니다.`);
        }
        continue;
      }

      appendRunLog("warn", `${action.label}: 현재 웹 어댑터에서는 지원하지 않습니다.`);
    }
  }

  function appendRunLog(tone: RunLog["tone"], message: string) {
    setRunLog((current) => [
      {
        id: `${Date.now()}-${current.length}`,
        tone,
        message
      },
      ...current
    ]);
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
      <aside className="rounded-lg border border-line bg-slate-50">
        <div className="flex items-center justify-between border-b border-line p-3">
          <div className="flex items-center gap-2 font-semibold">
            <Zap className="h-4 w-4 text-heather-700" />
            Jarvis 루틴
          </div>
          <button
            type="button"
            onClick={handleCreateRecipe}
            className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-white text-heather-700 hover:bg-heather-50"
            title="루틴 추가"
            aria-label="루틴 추가"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[680px] space-y-2 overflow-y-auto p-3 heather-scrollbar">
          {recipes.map((recipe) => {
            const recipePlan = planAutomation(recipe);
            return (
              <button
                key={recipe.id}
                type="button"
                onClick={() => setSelectedId(recipe.id)}
                className={`w-full rounded-lg border p-3 text-left transition ${
                  draft?.id === recipe.id
                    ? "border-heather-500 bg-white"
                    : "border-line bg-white hover:border-heather-300"
                } ${recipe.enabled ? "" : "opacity-60"}`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold">{recipe.title}</span>
                  <span className="rounded-md bg-slate-100 px-2 py-1 text-xs">
                    {AUTOMATION_TRIGGER_LABELS[recipe.trigger.type]}
                  </span>
                </span>
                <span className="mt-2 line-clamp-2 text-sm leading-5 text-slate-600">
                  {recipe.description || "설명 없음"}
                </span>
                <span className="mt-2 block text-xs font-medium text-heather-700">{recipePlan.summary}</span>
              </button>
            );
          })}
        </div>
      </aside>

      {draft ? (
        <section className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
          <form
            className="space-y-4 rounded-lg border border-line bg-white p-4"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSave();
            }}
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-sm font-semibold text-heather-700">Automation Recipe</p>
                <h3 className="text-2xl font-semibold">개인 비서 실행 루틴</h3>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, enabled: !draft.enabled })}
                  className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                    draft.enabled
                      ? "border-heather-500 bg-heather-50 text-heather-700"
                      : "border-line bg-white text-slate-600"
                  }`}
                >
                  {draft.enabled ? "active" : "paused"}
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-white text-coral hover:bg-red-50"
                  title="삭제"
                  aria-label="삭제"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                <button
                  type="submit"
                  className="grid h-10 w-10 place-items-center rounded-lg border border-heather-700 bg-heather-700 text-white hover:bg-heather-900"
                  title="저장"
                  aria-label="저장"
                >
                  <Save className="h-4 w-4" />
                </button>
              </div>
            </div>

            <label className="block">
              <span className="text-sm font-medium">루틴 이름</span>
              <input
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                className="mt-1 h-11 w-full rounded-lg border border-line px-3"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium">설명</span>
              <textarea
                value={draft.description}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                className="mt-1 min-h-24 w-full resize-y rounded-lg border border-line px-3 py-2 leading-6"
              />
            </label>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium">트리거</span>
                <select
                  value={draft.trigger.type}
                  onChange={(event) => {
                    const type = event.target.value as AutomationTriggerType;
                    setDraft({
                      ...draft,
                      trigger: {
                        ...draft.trigger,
                        type,
                        label: AUTOMATION_TRIGGER_LABELS[type]
                      }
                    });
                  }}
                  className="mt-1 h-11 w-full rounded-lg border border-line px-3"
                >
                  {TRIGGER_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {AUTOMATION_TRIGGER_LABELS[type]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium">호출 문장</span>
                <input
                  value={draft.trigger.phrase || ""}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      trigger: {
                        ...draft.trigger,
                        phrase: event.target.value
                      }
                    })
                  }
                  className="mt-1 h-11 w-full rounded-lg border border-line px-3"
                  placeholder="헤더, 시작 루틴 실행"
                />
              </label>
            </div>

            <label className="block">
              <span className="text-sm font-medium">환영 멘트</span>
              <textarea
                value={draft.welcomeMessage}
                onChange={(event) => setDraft({ ...draft, welcomeMessage: event.target.value })}
                className="mt-1 min-h-20 w-full resize-y rounded-lg border border-line px-3 py-2 leading-6"
              />
            </label>

            <div className="rounded-lg border border-line">
              <div className="flex flex-col gap-3 border-b border-line p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h4 className="font-semibold">행동 순서</h4>
                  <p className="text-sm text-slate-600">
                    현재 웹 실행 {runnableCount}개, 나머지는 데스크톱 브리지에서 확장합니다.
                  </p>
                </div>
                <select
                  onChange={(event) => {
                    addAction(event.target.value as AutomationActionType);
                    event.currentTarget.value = "";
                  }}
                  className="h-10 rounded-lg border border-line bg-white px-3 text-sm"
                  defaultValue=""
                >
                  <option value="" disabled>
                    행동 추가
                  </option>
                  {ACTION_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {AUTOMATION_ACTION_LABELS[type]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-3 p-3">
                {draft.actions.map((action) => (
                  <div key={action.id} className="rounded-lg border border-line bg-slate-50 p-3">
                    <div className="grid gap-3 md:grid-cols-[160px_1fr_auto] md:items-center">
                      <select
                        value={action.type}
                        onChange={(event) =>
                          updateAction(action.id, {
                            type: event.target.value as AutomationActionType
                          })
                        }
                        className="h-10 rounded-lg border border-line bg-white px-3 text-sm"
                      >
                        {ACTION_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {AUTOMATION_ACTION_LABELS[type]}
                          </option>
                        ))}
                      </select>
                      <input
                        value={action.label}
                        onChange={(event) => updateAction(action.id, { label: event.target.value })}
                        className="h-10 rounded-lg border border-line bg-white px-3 text-sm"
                        placeholder="행동 이름"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => updateAction(action.id, { enabled: !action.enabled })}
                          className={`h-10 rounded-lg border px-3 text-sm font-semibold ${
                            action.enabled
                              ? "border-heather-500 bg-white text-heather-700"
                              : "border-line bg-white text-slate-500"
                          }`}
                        >
                          {action.enabled ? "on" : "off"}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeAction(action.id)}
                          className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-white text-coral hover:bg-red-50"
                          title="행동 삭제"
                          aria-label="행동 삭제"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <textarea
                      value={action.value}
                      onChange={(event) => updateAction(action.id, { value: event.target.value })}
                      className="mt-3 min-h-16 w-full resize-y rounded-lg border border-line bg-white px-3 py-2 text-sm leading-6"
                      placeholder={actionPlaceholder(action.type)}
                    />

                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <label className="flex items-center gap-2 rounded-md border border-line bg-white px-2 py-1">
                        <input
                          type="checkbox"
                          checked={action.desktopOnly}
                          onChange={(event) =>
                            updateAction(action.id, {
                              desktopOnly: event.target.checked
                            })
                          }
                          className="accent-heather-700"
                        />
                        데스크톱 전용
                      </label>
                      <label className="flex items-center gap-2 rounded-md border border-line bg-white px-2 py-1">
                        <input
                          type="checkbox"
                          checked={action.requiresConfirmation}
                          onChange={(event) =>
                            updateAction(action.id, {
                              requiresConfirmation: event.target.checked
                            })
                          }
                          className="accent-heather-700"
                        />
                        실행 전 확인
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </form>

          <aside className="space-y-4">
            <div className="rounded-lg border border-line bg-slate-50 p-4">
              <div className="mb-3 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-heather-700" />
                <h4 className="font-semibold">실행 계획</h4>
              </div>
              {plan ? (
                <div className="space-y-2">
                  <div className="rounded-lg border border-line bg-white p-3">
                    <strong className="block">{plan.triggerLabel}</strong>
                    <p className="mt-1 text-sm text-slate-600">{plan.summary}</p>
                  </div>
                  {plan.steps.map((step) => (
                    <div key={step.actionId} className="flex gap-3 rounded-lg border border-line bg-white p-3">
                      {step.status === "webExecutable" ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-heather-700" />
                      ) : step.status === "desktopOnly" ? (
                        <Monitor className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                      ) : (
                        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                      )}
                      <div>
                        <p className="text-sm font-semibold">{step.label}</p>
                        <p className="text-sm leading-5 text-slate-600">{step.reason}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => void runRecipe()}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-heather-700 bg-heather-700 px-4 py-3 font-semibold text-white hover:bg-heather-900"
            >
              <Play className="h-4 w-4" />
              웹에서 가능한 행동 실행
            </button>

            <div className="rounded-lg border border-line bg-white p-4">
              <div className="mb-3 flex items-center gap-2">
                <ExternalLink className="h-4 w-4 text-heather-700" />
                <h4 className="font-semibold">실행 로그</h4>
              </div>
              {runLog.length ? (
                <div className="space-y-2">
                  {runLog.map((item) => (
                    <div
                      key={item.id}
                      className={`rounded-lg border px-3 py-2 text-sm ${
                        item.tone === "ok"
                          ? "border-heather-200 bg-heather-50 text-heather-900"
                          : item.tone === "warn"
                            ? "border-amber-200 bg-amber-50 text-amber-900"
                            : "border-line bg-slate-50 text-slate-600"
                      }`}
                    >
                      {item.message}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm leading-6 text-slate-600">
                  실행 버튼을 누르면 브라우저에서 가능한 작업과 데스크톱 전용으로 남은 작업을 분리해 기록합니다.
                </p>
              )}
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <Capability icon={Volume2} label="브라우저 음성" value="가능" />
              <Capability icon={ExternalLink} label="웹 주소 열기" value="가능" />
              <Capability icon={Clipboard} label="클립보드 쓰기" value="권한 필요" />
              <Capability icon={Monitor} label="로컬 앱 실행" value="브리지 필요" />
            </div>
          </aside>
        </section>
      ) : (
        <div className="flex min-h-[420px] items-center justify-center rounded-lg border border-line text-sm text-slate-500">
          루틴을 추가하면 Heather가 반복 작업을 순서대로 다룰 수 있습니다.
        </div>
      )}
    </div>
  );
}

function Capability({
  icon: Icon,
  label,
  value
}: {
  icon: typeof Volume2;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-white p-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="h-4 w-4 text-heather-700" />
        {label}
      </div>
      <p className="mt-1 text-sm text-slate-600">{value}</p>
    </div>
  );
}

function normalizeAction(action: AutomationAction): AutomationAction {
  const desktopOnly = DESKTOP_ACTIONS.includes(action.type) || action.desktopOnly;
  return {
    ...action,
    desktopOnly,
    requiresConfirmation: desktopOnly ? true : action.requiresConfirmation
  };
}

function normalizeUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function speak(value: string) {
  if (!("speechSynthesis" in window)) return;
  const utterance = new SpeechSynthesisUtterance(value);
  utterance.lang = "ko-KR";
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function defaultActionValue(type: AutomationActionType): string {
  if (type === "open_url") return "https://";
  if (type === "open_app") return "Cursor";
  if (type === "focus_app") return "Cursor";
  if (type === "clipboard_write") return "Heather가 준비한 텍스트";
  if (type === "capture_screen") return "현재 화면 요약";
  if (type === "clipboard_read") return "클립보드 내용 분석";
  return "좋아요. 바로 처리할게요.";
}

function actionPlaceholder(type: AutomationActionType): string {
  if (type === "open_url") return "https://example.com";
  if (type === "open_app") return "Cursor";
  if (type === "focus_app") return "Chrome";
  if (type === "clipboard_write") return "클립보드에 넣을 텍스트";
  if (type === "capture_screen") return "화면을 읽은 뒤 어떤 기준으로 요약할지";
  if (type === "clipboard_read") return "읽은 클립보드를 어떻게 처리할지";
  return "헤더가 말할 문장";
}
