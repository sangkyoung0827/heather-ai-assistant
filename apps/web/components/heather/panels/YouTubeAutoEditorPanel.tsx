"use client";

import {
  CheckCircle2,
  Download,
  ExternalLink,
  Film,
  KeyRound,
  Loader2,
  Play,
  RefreshCw,
  Server,
  ShieldCheck,
  UploadCloud,
  XCircle
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type JobStatus = "queued" | "processing" | "completed" | "failed";
type WorkerJob = {
  id: string;
  status: JobStatus;
  title?: string;
  filename?: string;
  error?: string;
  upload_to_youtube?: boolean;
  artifacts?: Record<string, string | null>;
};

type ProbeState = { kind: "idle" | "busy" | "ok" | "error"; message: string };

const DEFAULT_WORKER_URL = "http://127.0.0.1:8787";
const ARTIFACT_LABELS: Record<string, string> = {
  edited_video: "자동 컷 영상",
  subtitled_video: "자막 삽입 영상",
  edited_srt: "Whisper 자막 SRT",
  thumbnail: "썸네일",
  global_plan_json: "MiniMax 전체 분석",
  edl_json: "최종 편집 결정표",
  upload_receipt: "YouTube 업로드 결과"
};

function cleanWorkerUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

export function YouTubeAutoEditorPanel({ locale = "ko" }: { locale?: "ko" | "en" }) {
  const isEnglish = locale === "en";
  const [workerUrl, setWorkerUrl] = useState(DEFAULT_WORKER_URL);
  const [apiKey, setApiKey] = useState("");
  const [nvidiaProbe, setNvidiaProbe] = useState<ProbeState>({ kind: "idle", message: "" });
  const [workerProbe, setWorkerProbe] = useState<ProbeState>({ kind: "idle", message: "" });
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [privacy, setPrivacy] = useState("private");
  const [uploadToYouTube, setUploadToYouTube] = useState(false);
  const [mockAi, setMockAi] = useState(false);
  const [job, setJob] = useState<WorkerJob | null>(null);
  const [submitError, setSubmitError] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const storedWorker = window.localStorage.getItem("heather.youtubeEditor.workerUrl");
    const sessionKey = window.sessionStorage.getItem("heather.youtubeEditor.nvidiaKey");
    if (storedWorker) setWorkerUrl(storedWorker);
    if (sessionKey) setApiKey(sessionKey);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const running = job?.status === "queued" || job?.status === "processing";
  const artifactEntries = useMemo(
    () => Object.entries(job?.artifacts || {}).filter((entry): entry is [string, string] => Boolean(entry[1])),
    [job?.artifacts]
  );

  async function testNvidia() {
    if (!apiKey.trim()) {
      setNvidiaProbe({ kind: "error", message: isEnglish ? "Enter an NVIDIA API key." : "NVIDIA API 키를 입력하세요." });
      return;
    }
    setNvidiaProbe({ kind: "busy", message: isEnglish ? "Connecting…" : "연결 확인 중…" });
    window.sessionStorage.setItem("heather.youtubeEditor.nvidiaKey", apiKey.trim());
    try {
      const response = await fetch("/api/youtube-editor/nvidia-test", {
        method: "POST",
        headers: { "content-type": "application/json", "x-nvidia-api-key": apiKey.trim() },
        body: JSON.stringify({ prompt: "Return only JSON: {\"status\":\"ok\"}" })
      });
      const payload = await response.json() as { ok?: boolean; model?: string; content?: string; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || `HTTP ${response.status}`);
      setNvidiaProbe({ kind: "ok", message: `${payload.model || "MiniMax-M3"} · OK` });
    } catch (error) {
      setNvidiaProbe({ kind: "error", message: error instanceof Error ? error.message : "NVIDIA connection failed" });
    }
  }

  async function testWorker() {
    const base = cleanWorkerUrl(workerUrl);
    if (!base) return;
    setWorkerProbe({ kind: "busy", message: isEnglish ? "Checking worker…" : "로컬 워커 확인 중…" });
    window.localStorage.setItem("heather.youtubeEditor.workerUrl", base);
    try {
      const response = await fetch(`${base}/health`, { cache: "no-store" });
      const payload = await response.json() as { status?: string; global_model?: string; segment_model?: string };
      if (!response.ok || payload.status !== "ok") throw new Error(`HTTP ${response.status}`);
      setWorkerProbe({ kind: "ok", message: `${payload.global_model || "MiniMax-M3"} + ${payload.segment_model || "Nemotron Omni"}` });
    } catch (error) {
      setWorkerProbe({ kind: "error", message: error instanceof Error ? error.message : "Worker unavailable" });
    }
  }

  async function refreshJob(jobId: string, base = cleanWorkerUrl(workerUrl)) {
    const response = await fetch(`${base}/api/jobs/${jobId}`, { cache: "no-store" });
    const payload = await response.json() as WorkerJob & { detail?: string };
    if (!response.ok) throw new Error(payload.detail || `HTTP ${response.status}`);
    setJob(payload);
    if (payload.status === "completed" || payload.status === "failed") {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  async function startJob() {
    const base = cleanWorkerUrl(workerUrl);
    if (!file) {
      setSubmitError(isEnglish ? "Choose a video first." : "먼저 영상을 선택하세요.");
      return;
    }
    if (!mockAi && !apiKey.trim()) {
      setSubmitError(isEnglish ? "An NVIDIA API key is required." : "실제 분석에는 NVIDIA API 키가 필요합니다.");
      return;
    }
    setSubmitError("");
    window.localStorage.setItem("heather.youtubeEditor.workerUrl", base);
    if (apiKey.trim()) window.sessionStorage.setItem("heather.youtubeEditor.nvidiaKey", apiKey.trim());
    const form = new FormData();
    form.append("file", file);
    form.append("title", title.trim() || file.name.replace(/\.[^.]+$/, ""));
    form.append("description", description.trim());
    form.append("privacy_status", privacy);
    form.append("upload_to_youtube", String(uploadToYouTube));
    form.append("mock_ai", String(mockAi));
    form.append("nvidia_api_key", apiKey.trim());
    try {
      const response = await fetch(`${base}/api/jobs`, { method: "POST", body: form });
      const payload = await response.json() as { id?: string; status?: JobStatus; detail?: string };
      if (!response.ok || !payload.id) throw new Error(payload.detail || `HTTP ${response.status}`);
      const nextJob: WorkerJob = { id: payload.id, status: payload.status || "queued", title, filename: file.name, artifacts: {} };
      setJob(nextJob);
      await refreshJob(payload.id, base);
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(() => void refreshJob(payload.id!, base).catch((error) => {
        setSubmitError(error instanceof Error ? error.message : "Job polling failed");
      }), 3500);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Job creation failed");
    }
  }

  const copy = isEnglish ? {
    eyebrow: "ISOLATED VIDEO AGENT",
    title: "YouTube Auto Editor",
    summary: "MiniMax-M3 plans the full video, Nemotron Omni inspects short video and audio segments, and Whisper creates the final captions.",
    key: "NVIDIA API key",
    keyHint: "Kept only in this browser tab and sent to NVIDIA or the local worker for the current job.",
    test: "Test MiniMax",
    worker: "Local editing worker",
    workerHint: "FFmpeg, Whisper, OAuth, and long-running rendering stay outside Heather.",
    check: "Check worker",
    setup: "Worker setup",
    video: "Source video",
    choose: "Choose video",
    noFile: "No file selected",
    videoTitle: "YouTube title",
    description: "Description",
    privacy: "Visibility",
    upload: "Upload video, thumbnail, and captions to YouTube",
    mock: "Mock AI test mode",
    run: "Start full pipeline",
    running: "Processing…",
    status: "Job status",
    artifacts: "Outputs"
  } : {
    eyebrow: "독립형 영상 에이전트",
    title: "YouTube 자동 편집",
    summary: "MiniMax-M3가 전체 흐름을 설계하고 Nemotron Omni가 짧은 영상·음성 구간을 정밀 검사하며 Whisper가 최종 캡션을 만듭니다.",
    key: "NVIDIA API 키",
    keyHint: "현재 브라우저 탭에만 보관하며 NVIDIA 또는 로컬 워커의 현재 작업에만 전달합니다.",
    test: "MiniMax 연결 테스트",
    worker: "로컬 편집 워커",
    workerHint: "FFmpeg·Whisper·YouTube OAuth·장시간 렌더링은 Heather와 분리된 로컬 워커가 처리합니다.",
    check: "워커 확인",
    setup: "워커 설치 안내",
    video: "원본 영상",
    choose: "영상 선택",
    noFile: "선택된 파일 없음",
    videoTitle: "YouTube 제목",
    description: "설명",
    privacy: "공개 범위",
    upload: "영상·썸네일·캡션을 YouTube에 자동 업로드",
    mock: "AI 모의 테스트 모드",
    run: "전체 파이프라인 시작",
    running: "처리 중…",
    status: "작업 상태",
    artifacts: "생성 결과"
  };

  return <div className="youtube-editor-panel">
    <section className="editor-hero">
      <div><p>{copy.eyebrow}</p><h2><Film />{copy.title}</h2><span>{copy.summary}</span></div>
      <div className="isolation-badge"><ShieldCheck /> Heather 기능과 분리됨</div>
    </section>

    <div className="editor-grid">
      <section className="editor-card">
        <header><KeyRound /><div><strong>{copy.key}</strong><small>{copy.keyHint}</small></div></header>
        <label className="field"><span>{copy.key}</span><input type="password" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="nvapi-…" /></label>
        <button type="button" className="secondary" onClick={() => void testNvidia()} disabled={nvidiaProbe.kind === "busy"}>{nvidiaProbe.kind === "busy" ? <Loader2 className="spin" /> : <RefreshCw />}{copy.test}</button>
        <Probe state={nvidiaProbe} />
      </section>

      <section className="editor-card">
        <header><Server /><div><strong>{copy.worker}</strong><small>{copy.workerHint}</small></div></header>
        <label className="field"><span>Worker URL</span><input value={workerUrl} onChange={(event) => setWorkerUrl(event.target.value)} /></label>
        <div className="button-row"><button type="button" className="secondary" onClick={() => void testWorker()} disabled={workerProbe.kind === "busy"}>{workerProbe.kind === "busy" ? <Loader2 className="spin" /> : <RefreshCw />}{copy.check}</button><a className="text-link" href="https://github.com/sangkyoung0827/heather-ai-assistant/tree/main/services/youtube-auto-editor" target="_blank" rel="noreferrer">{copy.setup}<ExternalLink /></a></div>
        <Probe state={workerProbe} />
      </section>
    </div>

    <section className="editor-card job-builder">
      <header><UploadCloud /><div><strong>{copy.video}</strong><small>MP4 · MOV · MKV · WEBM</small></div></header>
      <div className="file-row"><label className="file-button"><input type="file" accept="video/mp4,video/quicktime,video/x-matroska,video/webm" onChange={(event) => setFile(event.target.files?.[0] || null)} /><UploadCloud />{copy.choose}</label><span>{file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB` : copy.noFile}</span></div>
      <div className="form-grid"><label className="field"><span>{copy.videoTitle}</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={file?.name.replace(/\.[^.]+$/, "") || ""} /></label><label className="field"><span>{copy.privacy}</span><select value={privacy} onChange={(event) => setPrivacy(event.target.value)}><option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option></select></label></div>
      <label className="field"><span>{copy.description}</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} /></label>
      <div className="checks"><label><input type="checkbox" checked={uploadToYouTube} onChange={(event) => setUploadToYouTube(event.target.checked)} />{copy.upload}</label><label><input type="checkbox" checked={mockAi} onChange={(event) => setMockAi(event.target.checked)} />{copy.mock}</label></div>
      <button type="button" className="primary" disabled={running} onClick={() => void startJob()}>{running ? <Loader2 className="spin" /> : <Play />}{running ? copy.running : copy.run}</button>
      {submitError ? <p className="error-line"><XCircle />{submitError}</p> : null}
    </section>

    {job ? <section className="editor-card job-status"><header><StatusIcon status={job.status} /><div><strong>{copy.status}</strong><small>{job.id}</small></div><span className={`status-pill ${job.status}`}>{job.status}</span></header>{job.error ? <p className="error-line"><XCircle />{job.error}</p> : null}{artifactEntries.length ? <div className="artifact-list"><h3>{copy.artifacts}</h3>{artifactEntries.map(([key, value]) => <a key={key} href={`${cleanWorkerUrl(workerUrl)}/api/jobs/${job.id}/artifacts/${key}`} target="_blank" rel="noreferrer"><Download /><span>{ARTIFACT_LABELS[key] || key}</span><small>{value}</small></a>)}</div> : null}</section> : null}

    <style jsx>{`
      .youtube-editor-panel{display:grid;gap:16px;width:100%;color:#edf1ff}.editor-hero,.editor-card{border:1px solid rgba(255,255,255,.1);background:linear-gradient(145deg,rgba(21,25,38,.96),rgba(9,11,18,.96));box-shadow:0 20px 55px rgba(0,0,0,.24);border-radius:20px}.editor-hero{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;padding:24px}.editor-hero p{margin:0 0 8px;color:var(--heather-accent);font-size:11px;font-weight:800;letter-spacing:.19em;text-transform:uppercase}.editor-hero h2{display:flex;align-items:center;gap:10px;margin:0;font-size:25px}.editor-hero h2 :global(svg){width:23px}.editor-hero span{display:block;max-width:760px;margin-top:9px;color:#aab2c8;line-height:1.65}.isolation-badge{display:flex;align-items:center;gap:7px;white-space:nowrap;border:1px solid var(--heather-accent-border);background:var(--heather-accent-soft);padding:8px 11px;border-radius:999px;color:#dcd5ff;font-size:12px}.isolation-badge :global(svg){width:15px}.editor-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.editor-card{padding:20px}.editor-card>header{display:flex;align-items:flex-start;gap:11px;margin-bottom:17px}.editor-card>header>:global(svg){width:19px;color:var(--heather-accent);flex:0 0 auto}.editor-card header div{display:grid;gap:4px}.editor-card header strong{font-size:15px}.editor-card header small{color:#8791aa;line-height:1.45}.field{display:grid;gap:7px;margin-bottom:13px}.field span{color:#aeb6ca;font-size:12px;font-weight:700}.field input,.field textarea,.field select{width:100%;box-sizing:border-box;border:1px solid rgba(255,255,255,.1);border-radius:12px;background:#0c0f18;color:#f5f7ff;padding:11px 12px;outline:none}.field textarea{resize:vertical}.field input:focus,.field textarea:focus,.field select:focus{border-color:var(--heather-accent-border);box-shadow:0 0 0 3px var(--heather-accent-soft)}button,a{font:inherit}.primary,.secondary,.file-button{display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:11px;cursor:pointer}.primary{width:100%;border:0;background:linear-gradient(135deg,var(--heather-accent-strong),var(--heather-accent));color:#080a11;padding:13px 16px;font-weight:900}.secondary{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);color:#e8ebf6;padding:10px 13px}.primary:disabled,.secondary:disabled{opacity:.55;cursor:not-allowed}.primary :global(svg),.secondary :global(svg),.file-button :global(svg){width:16px}.button-row,.file-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.text-link{display:inline-flex;align-items:center;gap:5px;color:#b7c0d8;font-size:12px;text-decoration:none}.text-link :global(svg){width:13px}.probe{display:flex;align-items:center;gap:7px;margin:11px 0 0;font-size:12px;color:#98a2ba}.probe.ok{color:#6ee7b7}.probe.error,.error-line{color:#fca5a5}.probe :global(svg),.error-line :global(svg){width:15px}.file-row{padding:14px;border:1px dashed rgba(255,255,255,.16);border-radius:14px;margin-bottom:15px}.file-row>span{color:#8d97af;font-size:12px;overflow-wrap:anywhere}.file-button{position:relative;overflow:hidden;border:1px solid var(--heather-accent-border);background:var(--heather-accent-soft);color:#e8e2ff;padding:9px 12px;font-weight:750}.file-button input{position:absolute;inset:0;opacity:0;cursor:pointer}.form-grid{display:grid;grid-template-columns:2fr 1fr;gap:13px}.checks{display:grid;gap:10px;margin:5px 0 17px;color:#b5bdd0;font-size:13px}.checks label{display:flex;align-items:center;gap:9px}.checks input{accent-color:var(--heather-accent-strong)}.error-line{display:flex;align-items:center;gap:7px;margin:13px 0 0;font-size:12px}.job-status>header{align-items:center}.status-pill{margin-left:auto;border-radius:999px;padding:6px 9px;font-size:10px;font-weight:900;text-transform:uppercase;background:rgba(255,255,255,.08)}.status-pill.completed{color:#6ee7b7}.status-pill.failed{color:#fca5a5}.status-pill.processing,.status-pill.queued{color:#fde68a}.artifact-list{display:grid;gap:8px}.artifact-list h3{font-size:12px;color:#8f99b1;text-transform:uppercase;letter-spacing:.13em}.artifact-list a{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:10px;padding:11px 12px;border:1px solid rgba(255,255,255,.08);border-radius:12px;color:#e6e9f4;text-decoration:none;background:rgba(255,255,255,.025)}.artifact-list a:hover{border-color:var(--heather-accent-border)}.artifact-list :global(svg){width:16px;color:var(--heather-accent)}.artifact-list small{color:#7f899f;max-width:240px;overflow:hidden;text-overflow:ellipsis}.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}@media(max-width:900px){.editor-grid,.form-grid{grid-template-columns:1fr}.editor-hero{flex-direction:column}.isolation-badge{white-space:normal}.artifact-list a{grid-template-columns:auto 1fr}.artifact-list small{grid-column:2}}
    `}</style>
  </div>;
}

function Probe({ state }: { state: ProbeState }) {
  if (state.kind === "idle" || !state.message) return null;
  return <p className={`probe ${state.kind}`}>{state.kind === "busy" ? <Loader2 className="spin" /> : state.kind === "ok" ? <CheckCircle2 /> : <XCircle />}{state.message}</p>;
}

function StatusIcon({ status }: { status: JobStatus }) {
  if (status === "completed") return <CheckCircle2 />;
  if (status === "failed") return <XCircle />;
  return <Loader2 className="spin" />;
}
