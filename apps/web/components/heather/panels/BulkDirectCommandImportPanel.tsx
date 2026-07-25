"use client";

import { useRef, useState } from "react";
import { CheckCircle2, FileText, FolderUp, RotateCcw, Upload } from "lucide-react";

type Summary = { total: number; create: number; merge: number; duplicate: number; error: number };
type Preview = { importId: string; summary: Summary; errors: Array<{ index: number; message: string }> };

export function BulkDirectCommandImportPanel() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<Summary | null>(null);
  const [notice, setNotice] = useState("");
  const [working, setWorking] = useState(false);

  async function selectFile(next: File | null) {
    setNotice(""); setPreview(null); setResult(null);
    if (!next) return setFile(null);
    if (!next.name.toLowerCase().endsWith(".txt") || (next.type && !next.type.startsWith("text/plain"))) return setNotice("Heather 표준 TXT 파일만 선택할 수 있습니다.");
    if (next.size > 5 * 1024 * 1024) return setNotice("파일 크기는 5MB 이하여야 합니다.");
    setFile(next);
  }
  async function previewFile() {
    if (!file) return;
    setWorking(true); setNotice("");
    try {
      const data = new FormData(); data.set("file", file);
      const response = await fetch("/api/direct-commands/bulk-import/preview", { method: "POST", body: data });
      const payload = await response.json() as Preview & { error?: string };
      if (!response.ok || payload.error) throw new Error(payload.error || "파일을 분석하지 못했습니다.");
      setPreview(payload);
    } catch (error) { setNotice(error instanceof Error ? error.message : "파일을 분석하지 못했습니다."); }
    finally { setWorking(false); }
  }
  async function commit() {
    if (!preview) return;
    setWorking(true); setNotice("");
    try {
      const response = await fetch("/api/direct-commands/bulk-import/commit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ importId: preview.importId }) });
      const payload = await response.json() as { summary?: Summary; error?: string };
      if (!response.ok || payload.error || !payload.summary) throw new Error(payload.error || "대량 등록을 완료하지 못했습니다.");
      setResult(payload.summary); setPreview(null);
    } catch (error) { setNotice(error instanceof Error ? error.message : "대량 등록을 완료하지 못했습니다."); }
    finally { setWorking(false); }
  }
  function reset() { setFile(null); setPreview(null); setResult(null); setNotice(""); if (inputRef.current) inputRef.current.value = ""; }

  return <div className="bulk-import-page">
    <div className="direct-page-tabs"><a href="/direct-commands">등록된 명령</a><a href="/direct-commands/new">직접명령 추가</a><a href="/direct-commands/bulk-import" className="is-active">대량 등록</a></div>
    <section className="bulk-import-card">
      <div className="bulk-import-heading"><div><p>TXT · Heather Direct Command Format v1</p><h2>직접명령 대량 등록</h2><span>Heather 표준 직접명령 파일을 업로드하여 다수의 명령을 한 번에 등록합니다.</span></div><FileText /></div>
      {!result && <>
        <label className={`bulk-dropzone ${file ? "has-file" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void selectFile(event.dataTransfer.files[0] || null); }}>
          <input ref={inputRef} type="file" accept=".txt,text/plain" onChange={(event) => void selectFile(event.target.files?.[0] || null)} />
          <FolderUp /><strong>{file ? file.name : "Heather 표준 TXT 파일을 선택하세요"}</strong><span>{file ? formatSize(file.size) : "파일을 여기로 끌어오거나 클릭하여 선택"}</span>
        </label>
        {!preview && <button type="button" className="workspace-primary-button bulk-action" disabled={!file || working} onClick={() => void previewFile()}>{working ? "파일 분석 중..." : "파일 분석"}</button>}
        {preview && <><SummaryCard title="분석 결과" summary={preview.summary} /><div className="bulk-actions"><button type="button" className="workspace-primary-button" disabled={working || preview.summary.create + preview.summary.merge === 0} onClick={() => void commit()}>{working ? "등록 중..." : "대량 등록 실행"}</button><button type="button" className="workspace-secondary-button" onClick={reset}><RotateCcw className="h-4 w-4" /> 파일 다시 선택</button></div>{preview.errors.length > 0 && <details className="bulk-errors"><summary>오류 항목 보기 ({preview.errors.length})</summary>{preview.errors.map((error) => <p key={`${error.index}-${error.message}`}>{error.index}번째 명령: {error.message}</p>)}</details>}</>}
      </>}
      {result && <div className="bulk-complete"><CheckCircle2 /><h3>대량 등록을 완료했습니다.</h3><SummaryCard title="등록 결과" summary={result} /><div className="bulk-actions"><a href="/direct-commands" className="workspace-primary-button">등록된 직접명령 보기</a><button type="button" className="workspace-secondary-button" onClick={reset}>다른 파일 선택</button></div></div>}
      {notice && <p className="bulk-notice">{notice}</p>}
    </section>
  </div>;
}

function SummaryCard({ title, summary }: { title: string; summary: Summary }) { return <section className="bulk-summary"><h3>{title}</h3><div><span><b>{summary.total}</b>전체</span><span><b>{summary.create}</b>신규</span><span><b>{summary.merge}</b>기존 명령 병합</span><span><b>{summary.duplicate}</b>중복 제외</span><span><b>{summary.error}</b>오류 제외</span></div></section>; }
function formatSize(bytes: number) { return `${(bytes / 1024).toFixed(bytes < 1024 * 1024 ? 0 : 1)} KB`; }
