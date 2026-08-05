"use client";

import { CheckCircle2, Film, Loader2, MessageSquareText, Play, UploadCloud, Youtube } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Job = {
  id: string;
  status: "queued" | "processing" | "completed" | "failed";
  phase?: "editing" | "refining" | "review";
  filename?: string;
  revision?: number;
  error?: string | null;
  upload_status?: "not_started" | "uploading" | "completed" | "failed";
  upload_error?: string | null;
  refinement_notes?: string[];
  artifacts?: Record<string, string | null>;
  youtube?: { video_id?: string };
};

const DEFAULT_WORKER = "http://127.0.0.1:8787";

export function YouTubeAutoEditorPanel({ locale = "ko" }: { locale?: "ko" | "en" }) {
  const [base, setBase] = useState(DEFAULT_WORKER);
  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState<"" | "source" | "refine" | "youtube">("");
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("heather.youtubeEditor.workerUrl");
    if (saved) setBase(saved.replace(/\/+$/, ""));
    return () => { if (timer.current) clearInterval(timer.current); };
  }, []);

  const running = job?.status === "queued" || job?.status === "processing";
  const videoKey = job?.artifacts?.subtitled_video ? "subtitled_video" : job?.artifacts?.edited_video ? "edited_video" : "";
  const artifact = (name: string) => job ? `${base}/api/jobs/${job.id}/artifacts/${name}?revision=${job.revision || 0}` : "";

  const poll = (id: string) => {
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => void refresh(id), 3000);
  };

  async function refresh(id: string) {
    const response = await fetch(`${base}/api/jobs/${id}`, { cache: "no-store" });
    const next = await response.json() as Job & { detail?: string };
    if (!response.ok) throw new Error(next.detail || `HTTP ${response.status}`);
    setJob(next);
    if (next.status === "failed" || next.upload_status === "failed") {
      setError(next.error || next.upload_error || "작업에 실패했습니다.");
      setBusy("");
    }
    if (next.status === "completed" && next.upload_status !== "uploading") setBusy("");
    if (next.upload_status === "completed") setBusy("");
  }

  async function start() {
    if (!file) return setError("원본 영상을 선택하세요.");
    setBusy("source"); setError("");
    const body = new FormData(); body.append("file", file);
    try {
      const response = await fetch(`${base}/api/jobs`, { method: "POST", body });
      const data = await response.json() as { id?: string; detail?: string };
      if (!response.ok || !data.id) throw new Error(data.detail || `HTTP ${response.status}`);
      setJob({ id: data.id, status: "queued", phase: "editing", filename: file.name, upload_status: "not_started", artifacts: {} });
      poll(data.id); await refresh(data.id);
    } catch (reason) { setBusy(""); setError(reason instanceof Error ? reason.message : "업로드에 실패했습니다."); }
  }

  async function refine() {
    if (!job || !instruction.trim()) return;
    setBusy("refine"); setError("");
    try {
      const response = await fetch(`${base}/api/jobs/${job.id}/refine`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ instruction: instruction.trim() }) });
      const data = await response.json() as { detail?: string };
      if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`);
      setInstruction(""); setJob({ ...job, status: "queued", phase: "refining" }); poll(job.id); await refresh(job.id);
    } catch (reason) { setBusy(""); setError(reason instanceof Error ? reason.message : "편집 조정에 실패했습니다."); }
  }

  async function upload() {
    if (!job) return;
    setBusy("youtube"); setError("");
    try {
      const response = await fetch(`${base}/api/jobs/${job.id}/upload`, { method: "POST" });
      const data = await response.json() as { detail?: string };
      if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`);
      setJob({ ...job, upload_status: "uploading" }); poll(job.id); await refresh(job.id);
    } catch (reason) { setBusy(""); setError(reason instanceof Error ? reason.message : "YouTube 업로드에 실패했습니다."); }
  }

  return <div className="yt-simple" lang={locale}>
    <section><header><b>1</b><div><h2>원본 영상 업로드</h2><p>업로드하면 자동 컷, 자막, 썸네일 생성을 시작합니다.</p></div></header><div className="pick"><label><input type="file" accept="video/mp4,video/quicktime,video/x-matroska,video/webm" onChange={e => setFile(e.target.files?.[0] || null)} /><UploadCloud />영상 선택</label><span>{file ? `${file.name} · ${(file.size / 1048576).toFixed(1)} MB` : "선택된 영상 없음"}</span></div><button className="primary" disabled={!file || !!busy || running} onClick={() => void start()}>{busy === "source" || running && job?.phase === "editing" ? <Loader2 className="spin" /> : <Play />}{busy === "source" || running && job?.phase === "editing" ? "자동 편집 중…" : "원본 업로드 및 편집 시작"}</button></section>

    <section><header><b>2</b><div><h2>편집 결과 확인</h2><p>{running ? "자동 편집을 진행하고 있습니다." : job?.status === "completed" ? job.filename : "완료된 영상이 이곳에 표시됩니다."}</p></div></header>{videoKey ? <div className="preview"><video key={artifact(videoKey)} controls src={artifact(videoKey)} /><aside>{job?.artifacts?.thumbnail ? <img src={artifact("thumbnail")} alt="자동 생성 썸네일" /> : null}{job?.artifacts?.edited_srt ? <a href={artifact("edited_srt")} target="_blank" rel="noreferrer"><Film />자동 자막 내려받기</a> : null}</aside></div> : <div className="empty">{running ? <Loader2 className="spin" /> : <Film />}<span>{running ? "자동 편집 중…" : "편집 결과 대기 중"}</span></div>}{job?.status === "completed" ? <div className="refine"><label><MessageSquareText />자연어로 편집을 조금 조정하기</label><textarea rows={3} value={instruction} onChange={e => setInstruction(e.target.value)} placeholder="예: 12초부터 18초까지 삭제해줘. 도입부를 더 남겨줘. 자막 크기를 약간 키워줘." /><button disabled={!instruction.trim() || !!busy || job.upload_status === "uploading"} onClick={() => void refine()}>{busy === "refine" ? <Loader2 className="spin" /> : <MessageSquareText />}편집 조정 적용</button>{job.refinement_notes?.length ? <p>{job.refinement_notes.join(" ")}</p> : null}</div> : null}</section>

    <section><header><b>3</b><div><h2>YouTube에 업로드</h2><p>최종 영상, 썸네일, 자막 트랙을 연결된 채널에 업로드합니다.</p></div></header><button className="youtube" disabled={job?.status !== "completed" || !!busy || job?.upload_status === "completed"} onClick={() => void upload()}>{job?.upload_status === "uploading" || busy === "youtube" ? <Loader2 className="spin" /> : job?.upload_status === "completed" ? <CheckCircle2 /> : <Youtube />}{job?.upload_status === "uploading" || busy === "youtube" ? "YouTube 업로드 중…" : job?.upload_status === "completed" ? "YouTube 업로드 완료" : "YouTube에 업로드"}</button>{job?.youtube?.video_id ? <a className="link" href={`https://www.youtube.com/watch?v=${job.youtube.video_id}`} target="_blank" rel="noreferrer">업로드된 영상 열기</a> : null}</section>

    {error ? <p className="error">{error}</p> : null}
    <style jsx>{`.yt-simple{display:grid;gap:18px;width:100%;color:#eef1ff}.yt-simple>section{padding:22px;border:1px solid rgba(255,255,255,.1);border-radius:22px;background:linear-gradient(145deg,rgba(20,24,37,.97),rgba(8,10,17,.97));box-shadow:0 18px 50px rgba(0,0,0,.23)}header{display:flex;gap:13px;margin-bottom:18px}header>b{display:grid;place-items:center;width:30px;height:30px;border:1px solid var(--heather-accent-border);border-radius:10px;background:var(--heather-accent-soft);color:var(--heather-accent)}h2{margin:0;font-size:18px}header p{margin:6px 0 0;color:#909ab3;font-size:13px}.pick{display:flex;align-items:center;gap:13px;flex-wrap:wrap;padding:16px;margin-bottom:14px;border:1px dashed rgba(255,255,255,.16);border-radius:15px}.pick label,.primary,.refine button,.youtube{display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:12px;font:inherit;font-weight:850;cursor:pointer}.pick label{position:relative;overflow:hidden;padding:10px 13px;border:1px solid var(--heather-accent-border);background:var(--heather-accent-soft)}.pick input{position:absolute;inset:0;opacity:0}.pick span{font-size:12px;color:#a8b0c5}.primary,.youtube{width:100%;padding:13px 16px;border:0}.primary{background:linear-gradient(135deg,var(--heather-accent-strong),var(--heather-accent));color:#090b12}.youtube{background:#ff0033;color:#fff}.primary:disabled,.youtube:disabled,.refine button:disabled{opacity:.45;cursor:not-allowed}.empty{display:grid;place-items:center;gap:10px;min-height:220px;border:1px solid rgba(255,255,255,.08);border-radius:16px;background:#090c14;color:#7f899f}.preview{display:grid;grid-template-columns:minmax(0,1fr) 250px;gap:14px}.preview video,.preview img{width:100%;border-radius:15px;background:#000}.preview img{aspect-ratio:16/9;object-fit:cover}.preview aside{display:flex;flex-direction:column;gap:10px}.preview a,.link{color:#dce1ee;text-decoration:none;font-size:12px}.preview a{display:flex;align-items:center;gap:7px;padding:10px 12px;border:1px solid rgba(255,255,255,.1);border-radius:11px}.refine{display:grid;gap:10px;margin-top:16px;padding-top:16px;border-top:1px solid rgba(255,255,255,.08)}.refine label{display:flex;gap:8px;align-items:center;font-weight:800;font-size:13px}.refine textarea{box-sizing:border-box;width:100%;padding:12px;border:1px solid rgba(255,255,255,.11);border-radius:13px;background:#0a0d15;color:#fff;resize:vertical}.refine button{justify-self:start;padding:10px 13px;border:1px solid var(--heather-accent-border);background:var(--heather-accent-soft);color:#ece7ff}.refine p{margin:0;color:#a7b0c6;font-size:12px}.link{display:block;margin-top:11px;text-align:center}.error{margin:0;padding:12px 14px;border:1px solid rgba(248,113,113,.35);border-radius:12px;background:rgba(127,29,29,.2);color:#fecaca;font-size:12px}.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}@media(max-width:850px){.preview{grid-template-columns:1fr}.yt-simple>section{padding:17px}}`}</style>
  </div>;
}
