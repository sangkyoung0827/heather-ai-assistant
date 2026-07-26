"use client";

import { useRef, useState } from "react";
import { CheckCircle2, FileText, FolderUp, RotateCcw } from "lucide-react";
import type { HeatherLanguage } from "@heather/core";

type Summary = { total: number; create: number; merge: number; duplicate: number; error: number };
type PreviewItem = { input?: { title: string; canonicalTrigger: string; triggers?: string[]; response: string; tags?: string[] }; status: "create" | "merge" | "duplicate" | "error"; error?: string };
type Preview = { importId: string; summary: Summary; items: PreviewItem[]; errors: Array<{ index: number; message: string }>; file: { name: string; type: string; size: number; textExtracted?: boolean; pages?: number; candidates?: number } };

export function BulkDirectCommandImportPanel({ locale = "ko" }: { locale?: HeatherLanguage }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [result, setResult] = useState<Summary | null>(null);
  const [notice, setNotice] = useState("");
  const [working, setWorking] = useState(false);
  const copy = locale === "en" ? EN : KO;

  async function selectFile(next: File | null) {
    setNotice(""); setPreview(null); setResult(null); setSelected(new Set());
    if (!next) return setFile(null);
    if (!SUPPORTED.test(next.name.toLowerCase())) return setNotice(copy.unsupported);
    if (next.size > 10 * 1024 * 1024) return setNotice(copy.sizeLimit);
    setFile(next);
  }
  async function previewFile() {
    if (!file) return;
    setWorking(true); setNotice("");
    try {
      const data = new FormData(); data.set("file", file);
      const response = await fetch("/api/direct-commands/bulk-import/preview", { method: "POST", body: data });
      const payload = await response.json() as Preview & { error?: string };
      if (!response.ok || payload.error) throw new Error(payload.error || copy.analysisFailed);
      setPreview(payload); setSelected(new Set(payload.items.flatMap((item, index) => item.status === "create" || item.status === "merge" ? [index] : [])));
    } catch (error) { setNotice(error instanceof Error ? error.message : copy.analysisFailed); }
    finally { setWorking(false); }
  }
  async function commit() {
    if (!preview) return;
    setWorking(true); setNotice("");
    try {
      const response = await fetch("/api/direct-commands/bulk-import/commit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ importId: preview.importId, selectedIndexes: [...selected] }) });
      const payload = await response.json() as { summary?: Summary; error?: string };
      if (!response.ok || payload.error || !payload.summary) throw new Error(payload.error || copy.commitFailed);
      setResult(payload.summary); setPreview(null);
    } catch (error) { setNotice(error instanceof Error ? error.message : copy.commitFailed); }
    finally { setWorking(false); }
  }
  function reset() { setFile(null); setPreview(null); setResult(null); setNotice(""); setSelected(new Set()); if (inputRef.current) inputRef.current.value = ""; }
  function toggle(index: number) { setSelected((current) => { const next = new Set(current); next.has(index) ? next.delete(index) : next.add(index); return next; }); }

  return <div className="bulk-import-page"><div className="direct-page-tabs"><a href="/direct-commands">{copy.commands}</a><a href="/direct-commands/bulk-import" className="is-active">{copy.bulk}</a></div><section className="bulk-import-card"><div className="bulk-import-heading"><div><p>{copy.formats}</p><h2>{copy.title}</h2><span>{copy.description}</span></div><FileText /></div>{!result && <><label className={`bulk-dropzone ${file ? "has-file" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void selectFile(event.dataTransfer.files[0] || null); }}><input ref={inputRef} type="file" accept=".txt,.md,.markdown,.json,.csv,.pdf,.docx,text/plain,text/markdown,application/json,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => void selectFile(event.target.files?.[0] || null)} /><FolderUp /><strong>{file ? file.name : copy.dropTitle}</strong><span>{file ? `${formatSize(file.size)} · ${file.name.split(".").pop()?.toUpperCase()}` : copy.dropDetail}</span></label>{!preview && <button type="button" className="workspace-primary-button bulk-action" disabled={!file || working} onClick={() => void previewFile()}>{working ? copy.analyzing : copy.analyze}</button>}{preview && <><SummaryCard title={copy.preview} summary={preview.summary} copy={copy} /><p className="bulk-file-meta">{preview.file.name} · {preview.file.type.toUpperCase()} · {formatSize(preview.file.size)}{preview.file.pages ? ` · ${copy.pages}: ${preview.file.pages}` : ""}{typeof preview.file.candidates === "number" ? ` · ${copy.candidates}: ${preview.file.candidates}` : ""}</p><CandidateReview items={preview.items} selected={selected} onToggle={toggle} copy={copy} /><div className="bulk-actions"><button type="button" className="workspace-primary-button" disabled={working || selected.size === 0} onClick={() => void commit()}>{working ? copy.importing : `${copy.commit} (${selected.size})`}</button><button type="button" className="workspace-secondary-button" onClick={reset}><RotateCcw className="h-4 w-4" /> {copy.reselect}</button></div>{preview.errors.length > 0 && <details className="bulk-errors"><summary>{copy.errors} ({preview.errors.length})</summary>{preview.errors.map((error) => <p key={`${error.index}-${error.message}`}>{error.index}: {error.message}</p>)}</details>}</>}</>}{result && <div className="bulk-complete"><CheckCircle2 /><h3>{copy.complete}</h3><SummaryCard title={copy.result} summary={result} copy={copy} /><div className="bulk-actions"><a href="/direct-commands" className="workspace-primary-button">{copy.viewCommands}</a><button type="button" className="workspace-secondary-button" onClick={reset}>{copy.otherFile}</button></div></div>}{notice && <p className="bulk-notice">{notice}</p>}</section></div>;
}

type BulkCopy = typeof KO | typeof EN;
function CandidateReview({ items, selected, onToggle, copy }: { items: PreviewItem[]; selected: Set<number>; onToggle: (index: number) => void; copy: BulkCopy }) {
  const candidates = items.map((item, index) => ({ item, index })).filter(({ item }) => item.input && (item.status === "create" || item.status === "merge"));
  if (!candidates.length) return null;
  return <details className="bulk-candidates" open><summary>{copy.review} ({candidates.length})</summary>{candidates.map(({ item, index }) => <label key={index}><input type="checkbox" checked={selected.has(index)} onChange={() => onToggle(index)} /><span><strong>{item.input!.title}</strong><small>{item.input!.canonicalTrigger} · {item.status === "create" ? copy.create : copy.merge}</small></span></label>)}</details>;
}
function SummaryCard({ title, summary, copy }: { title: string; summary: Summary; copy: BulkCopy }) { return <section className="bulk-summary"><h3>{title}</h3><div><span><b>{summary.total}</b>{copy.total}</span><span><b>{summary.create}</b>{copy.create}</span><span><b>{summary.merge}</b>{copy.merge}</span><span><b>{summary.duplicate}</b>{copy.duplicate}</span><span><b>{summary.error}</b>{copy.error}</span></div></section>; }
function formatSize(bytes: number) { return `${(bytes / 1024).toFixed(bytes < 1024 * 1024 ? 0 : 1)} KB`; }
const SUPPORTED = /\.(txt|md|markdown|json|csv|pdf|docx)$/i;
const KO = { commands: "직접명령 등록", bulk: "대량 등록", formats: "TXT · Markdown · JSON · CSV · PDF · DOCX", title: "직접명령 대량 등록", description: "구조화된 명령 파일을 분석하고, 검수 후 안전하게 등록합니다.", dropTitle: "직접명령 파일을 선택하세요", dropDetail: "파일을 여기로 끌어오거나 클릭하여 선택", unsupported: "TXT, Markdown, JSON, CSV, PDF, DOCX 파일만 선택할 수 있습니다.", sizeLimit: "파일 크기는 10MB 이하여야 합니다.", analyzing: "파일 분석 중...", analyze: "파일 분석", analysisFailed: "파일을 분석하지 못했습니다.", preview: "분석 결과", pages: "페이지", candidates: "Q&A 후보", importing: "등록 중...", commit: "선택 항목 등록", commitFailed: "대량 등록을 완료하지 못했습니다.", reselect: "파일 다시 선택", errors: "오류 항목 보기", review: "등록 후보 검수", complete: "대량 등록을 완료했습니다.", result: "등록 결과", viewCommands: "등록된 직접명령 보기", otherFile: "다른 파일 선택", total: "전체", create: "신규", merge: "기존 명령 병합", duplicate: "중복 제외", error: "오류 제외" } as const;
const EN = { ...KO, commands: "Commands", bulk: "Bulk Import", title: "Bulk import direct commands", description: "Analyze structured command files and register reviewed items safely.", dropTitle: "Choose a direct command file", dropDetail: "Drop a file here or click to select", unsupported: "Choose a TXT, Markdown, JSON, CSV, PDF, or DOCX file.", sizeLimit: "Files must be 10MB or smaller.", analyzing: "Analyzing file...", analyze: "Analyze file", analysisFailed: "Could not analyze the file.", preview: "Preview", pages: "Pages", candidates: "Q&A candidates", importing: "Importing...", commit: "Import selected", commitFailed: "Could not complete the bulk import.", reselect: "Choose another file", errors: "View errors", review: "Review candidates", complete: "Bulk import complete.", result: "Import result", viewCommands: "View commands", otherFile: "Choose another file", total: "Total", create: "New", merge: "Merge triggers", duplicate: "Duplicates", error: "Errors" } as const;
