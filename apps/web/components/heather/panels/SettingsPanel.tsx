"use client";

import { useEffect, useMemo, useState } from "react";
import { Cloud, Cpu, HardDrive, Mic, Monitor, ShieldCheck, Trash2, Volume2, WalletCards } from "lucide-react";
import { ACCOUNT_PROFILES, PLATFORM_CAPABILITIES } from "@heather/core";
import type {
  HeatherAIMode,
  HeatherLanguage,
  HeatherSettings,
  HeatherTone,
  HeatherVoiceProvider
} from "@heather/core";
import { WebPlatformAdapter } from "@heather/platform";

interface SettingsPanelProps {
  settings: HeatherSettings;
  onSaveSettings: (settings: HeatherSettings) => Promise<void>;
  onClearAll: () => Promise<void>;
}

const TONE_OPTIONS: Array<{ value: HeatherTone; label: string }> = [
  { value: "soft", label: "부드럽게" },
  { value: "analytical", label: "분석적으로" },
  { value: "direct", label: "직설적으로" }
];

const AI_MODE_OPTIONS: Array<{
  value: HeatherAIMode;
  label: string;
  detail: string;
  icon: typeof HardDrive;
}> = [
  {
    value: "local_only",
    label: "로컬만",
    detail: "브라우저 안에서 답변",
    icon: HardDrive
  },
  {
    value: "local_model",
    label: "로컬 모델",
    detail: "Ollama 우선",
    icon: Cpu
  },
  {
    value: "cloud_allowed",
    label: "클라우드 허용",
    detail: "한도 안에서만",
    icon: Cloud
  }
];

const LANGUAGE_OPTIONS: Array<{ value: HeatherLanguage; label: string; detail: string }> = [
  { value: "en", label: "English", detail: "Default" },
  { value: "ko", label: "한국어", detail: "Korean first" },
  { value: "auto", label: "Auto", detail: "Follow user" }
];

const VOICE_PROVIDER_OPTIONS: Array<{ value: HeatherVoiceProvider; label: string }> = [
  { value: "elevenlabs", label: "ElevenLabs Heather" },
  { value: "browser", label: "Browser voice" }
];

export function SettingsPanel({ settings, onSaveSettings, onClearAll }: SettingsPanelProps) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [micStatus, setMicStatus] = useState("확인 전");
  const [voiceTestStatus, setVoiceTestStatus] = useState("대기 중");
  const platform = useMemo(() => new WebPlatformAdapter(), []);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    function loadVoices() {
      setVoices(window.speechSynthesis.getVoices());
    }

    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
  }, []);

  async function update(partial: Partial<HeatherSettings>) {
    await onSaveSettings({
      ...settings,
      ...partial
    });
  }

  async function checkMicrophone() {
    const allowed = await platform.requestMicrophonePermission();
    setMicStatus(allowed ? "허용됨" : "거부 또는 미지원");
  }

  async function testVoice() {
    const sampleText =
      settings.defaultLanguage === "ko"
        ? "안녕, 나는 헤더야. 오늘은 무엇을 도와주면 좋을까?"
        : "The first move sets everything in motion.";

    if (settings.voiceProvider === "elevenlabs" && settings.elevenLabsVoiceId.trim()) {
      setVoiceTestStatus("ElevenLabs 요청 중");
      try {
        const response = await fetch("/api/tts/elevenlabs", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            text: sampleText,
            voiceId: settings.elevenLabsVoiceId,
            modelId: settings.elevenLabsModelId || "eleven_v3"
          })
        });

        if (response.ok) {
          const audio = new Audio(URL.createObjectURL(await response.blob()));
          audio.onplay = () => setVoiceTestStatus("ElevenLabs 재생 중");
          audio.onended = () => {
            URL.revokeObjectURL(audio.src);
            setVoiceTestStatus("재생 완료");
          };
          audio.onerror = () => {
            URL.revokeObjectURL(audio.src);
            setVoiceTestStatus("ElevenLabs 재생 실패");
          };
          await audio.play();
          return;
        }
      } catch {
        setVoiceTestStatus("ElevenLabs 사용 불가, 브라우저 음성으로 대체");
      }
    }

    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setVoiceTestStatus("이 환경은 음성 출력을 지원하지 않습니다.");
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(sampleText);
    utterance.lang = settings.defaultLanguage === "ko" ? "ko-KR" : "en-US";
    utterance.rate = 1.04;
    utterance.pitch = 1.02;
    const selectedVoice =
      voices.find((voice) => voice.name === settings.voiceName) ||
      voices.find((voice) => voice.lang.toLowerCase().startsWith(utterance.lang.slice(0, 2).toLowerCase())) ||
      voices.find((voice) => voice.lang.toLowerCase().startsWith("en")) ||
      voices.find((voice) => voice.lang.toLowerCase().startsWith("ko"));
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }
    utterance.onstart = () => setVoiceTestStatus("재생 중");
    utterance.onend = () => setVoiceTestStatus("재생 완료");
    utterance.onerror = () => setVoiceTestStatus("재생 실패");
    window.speechSynthesis.speak(utterance);
  }

  async function clearAllData() {
    if (!settings.confirmRiskyActions || window.confirm("대화, 프로젝트, 메모리를 모두 삭제할까요?")) {
      await onClearAll();
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
      <section className="space-y-4 rounded-lg border border-line bg-white p-4">
        <div>
          <p className="text-sm font-semibold text-heather-700">Heather Settings</p>
          <h3 className="text-2xl font-semibold">헤더의 작동 방식</h3>
        </div>

        <section className="space-y-3 border-b border-line pb-4">
          <h4 className="font-semibold">말투 강도</h4>
          <div className="grid gap-2 sm:grid-cols-3">
            {TONE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => void update({ tone: option.value })}
                className={`rounded-lg border px-3 py-3 text-sm font-semibold transition ${
                  settings.tone === option.value
                    ? "border-heather-500 bg-heather-50 text-heather-900"
                    : "border-line bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-3 border-b border-line pb-4">
          <h4 className="font-semibold">Default Language</h4>
          <div className="grid gap-2 sm:grid-cols-3">
            {LANGUAGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => void update({ defaultLanguage: option.value })}
                className={`rounded-lg border px-3 py-3 text-sm font-semibold transition ${
                  settings.defaultLanguage === option.value
                    ? "border-heather-500 bg-heather-50 text-heather-900"
                    : "border-line bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span className="block">{option.label}</span>
                <span className="mt-1 block text-xs font-medium">{option.detail}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-3 border-b border-line pb-4">
          <div className="flex items-center gap-2">
            <WalletCards className="h-4 w-4 text-heather-700" />
            <h4 className="font-semibold">AI 비용 제어</h4>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {AI_MODE_OPTIONS.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => void update({ aiMode: option.value })}
                  className={`rounded-lg border p-3 text-left transition ${
                    settings.aiMode === option.value
                      ? "border-heather-500 bg-heather-50 text-heather-900"
                      : "border-line bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <span className="flex items-center gap-2 font-semibold">
                    <Icon className="h-4 w-4" />
                    {option.label}
                  </span>
                  <span className="mt-1 block text-xs">{option.detail}</span>
                </button>
              );
            })}
          </div>
          <Toggle
            label="같은 요청은 로컬 캐시 재사용"
            checked={settings.cacheResponses}
            onChange={(checked) => void update({ cacheResponses: checked })}
          />
          <Toggle
            label="유료 API 호출 허용"
            checked={settings.allowPaidApiCalls}
            onChange={(checked) => void update({ allowPaidApiCalls: checked })}
          />
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium">월 유료 API 한도</span>
              <input
                type="number"
                min="0"
                value={settings.monthlyApiCallLimit}
                onChange={(event) =>
                  void update({
                    monthlyApiCallLimit: Math.max(0, Number(event.target.value) || 0)
                  })
                }
                className="mt-1 h-11 w-full rounded-lg border border-line px-3"
              />
            </label>
            <div className="rounded-lg border border-line bg-slate-50 px-3 py-2">
              <span className="text-sm font-medium">이번 달 사용량</span>
              <p className="mt-1 text-lg font-semibold">
                {settings.apiCallsThisMonth} / {settings.monthlyApiCallLimit}
              </p>
            </div>
          </div>
          <p className="rounded-lg border border-line bg-slate-50 p-3 text-sm leading-6 text-slate-600">
            유료 제공자는 설정에서 허용하고, 월 한도가 남아 있고, 서버에 HEATHER_ALLOW_PAID_API=true가
            설정된 경우에만 호출됩니다.
          </p>
        </section>

        <section className="space-y-3 border-b border-line pb-4">
          <div className="flex items-center gap-2">
            <Volume2 className="h-4 w-4 text-heather-700" />
            <h4 className="font-semibold">음성 출력</h4>
          </div>
          <Toggle
            label="음성 출력 사용"
            checked={settings.voiceOutputEnabled}
            onChange={(checked) => void update({ voiceOutputEnabled: checked })}
          />
          <Toggle
            label="답변 자동 읽기"
            checked={settings.voiceAutoReadEnabled}
            onChange={(checked) => void update({ voiceAutoReadEnabled: checked })}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            {VOICE_PROVIDER_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => void update({ voiceProvider: option.value })}
                className={`rounded-lg border px-3 py-3 text-sm font-semibold transition ${
                  settings.voiceProvider === option.value
                    ? "border-heather-500 bg-heather-50 text-heather-900"
                    : "border-line bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium">ElevenLabs Voice ID</span>
              <input
                value={settings.elevenLabsVoiceId}
                onChange={(event) => void update({ elevenLabsVoiceId: event.target.value })}
                className="mt-1 h-11 w-full rounded-lg border border-line px-3"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">ElevenLabs Model</span>
              <input
                value={settings.elevenLabsModelId}
                onChange={(event) => void update({ elevenLabsModelId: event.target.value })}
                className="mt-1 h-11 w-full rounded-lg border border-line px-3"
              />
            </label>
          </div>
          <label className="block">
            <span className="text-sm font-medium">목소리 선택</span>
            <select
              value={settings.voiceName}
              onChange={(event) => void update({ voiceName: event.target.value })}
              className="mt-1 h-11 w-full rounded-lg border border-line px-3"
            >
              <option value="Heather 기본 음성">Heather 기본 음성</option>
              {voices.map((voice) => (
                <option key={`${voice.name}-${voice.lang}`} value={voice.name}>
                  {voice.name} · {voice.lang}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void testVoice()}
              className="flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
            >
              <Volume2 className="h-4 w-4 text-heather-700" />
              테스트 문장 재생
            </button>
            <button
              type="button"
              onClick={checkMicrophone}
              className="flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
            >
              <Mic className="h-4 w-4 text-heather-700" />
              마이크 권한 확인
            </button>
            <span className="text-sm text-slate-500">TTS: {voiceTestStatus}</span>
            <span className="text-sm text-slate-500">Mic: {micStatus}</span>
          </div>
        </section>

        <section className="space-y-3 border-b border-line pb-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-heather-700" />
            <h4 className="font-semibold">Account Profiles</h4>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {ACCOUNT_PROFILES.map((profile) => (
              <div key={profile.id} className="rounded-lg border border-line bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <strong>{profile.name}</strong>
                  <span className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-slate-600">
                    {profile.connectionStatus}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-600">{profile.email}</p>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  {profile.purpose} / {profile.services.join(", ")}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Browser profile: {profile.defaultBrowserProfile || "not configured"}
                </p>
              </div>
            ))}
          </div>
          <p className="rounded-lg border border-line bg-white p-3 text-sm leading-6 text-slate-600">
            Heather는 Google 비밀번호, 쿠키, 토큰, API key를 저장하거나 GitHub에 커밋하지 않습니다.
            Google Calendar/Gmail/Drive는 OAuth 연결이 준비된 뒤 work profile로만 사용합니다.
          </p>
        </section>

        <section className="space-y-3 border-b border-line pb-4">
          <h4 className="font-semibold">메모리</h4>
          <Toggle
            label="대화에서 기억 저장"
            checked={settings.memoryEnabled}
            onChange={(checked) => void update({ memoryEnabled: checked })}
          />
          <Toggle
            label="프로젝트별 메모리 사용"
            checked={settings.projectMemoryEnabled}
            onChange={(checked) => void update({ projectMemoryEnabled: checked })}
          />
        </section>

        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-heather-700" />
            <h4 className="font-semibold">보안</h4>
          </div>
          <Toggle
            label="위험한 작업 실행 전 확인"
            checked={settings.confirmRiskyActions}
            onChange={(checked) => void update({ confirmRiskyActions: checked })}
          />
          <button
            type="button"
            onClick={clearAllData}
            className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-coral hover:bg-red-100"
          >
            <Trash2 className="h-4 w-4" />
            모든 로컬 데이터 삭제
          </button>
        </section>
      </section>

      <aside className="space-y-4">
        <section className="rounded-lg border border-line bg-slate-50 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Monitor className="h-4 w-4 text-heather-700" />
            <h4 className="font-semibold">플랫폼 기능</h4>
          </div>
          <div className="space-y-2">
            {PLATFORM_CAPABILITIES.map((capability) => (
              <div key={capability.key} className="rounded-lg border border-line bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{capability.label}</span>
                  <span
                    className={`rounded-md px-2 py-1 text-xs font-semibold ${
                      capability.status === "available"
                        ? "bg-heather-50 text-heather-700"
                        : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {capability.status}
                  </span>
                </div>
                <p className="mt-1 text-sm leading-5 text-slate-600">{capability.description}</p>
              </div>
            ))}
          </div>
        </section>
      </aside>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-line bg-slate-50 px-3 py-3">
      <span className="text-sm font-medium">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5 accent-heather-700"
      />
    </label>
  );
}
