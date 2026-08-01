"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { Check, FileText, Loader2, ShieldAlert, Trash2, Upload, X } from "lucide-react";
import type { HeatherLanguage } from "@heather/core";
import { getSupabaseBrowserClient } from "../../../lib/supabase-client";

type Scope = "personal" | "research";
type DocumentRow = { id: string; title: string; original_filename: string; extension: string; byte_size: number; uploaded_at: string; parsing_status: string; sensitivity: string; access_mode: string; original_url: string | null; document_extractions?: Array<{ parser: string; status: string; page_count?: number | null; word_count?: number; warnings?: string[] }> };
type Candidate = { id: string; document_id: string; title: string; content: string; status: string; confidence: number; sensitivity: string; target_memory_type: string };

const ACCEPT = ".txt,.md,.pdf,.docx,.hwpx,.hwp,.rtf,.odt,.csv,.xlsx,.pptx,.jpg,.jpeg,.png,.webp,.heic,.m4a,.mp3,.wav";

export function DocumentIngestionPanel({ scope, locale, onRecordsChanged }: { scope: Scope; locale: HeatherLanguage; onRecordsChanged?: () => void }) {
  const korean = locale !== "en";
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [documentType, setDocumentType] = useState(scope === "personal" ? "journal" : "paper");
  const [accessMode, setAccessMode] = useState("search_allowed");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const copy = korean ? KO : EN;
  const types = scope === "personal" ? copy.personalTypes : copy.researchTypes;

  const headers = useCallback(async () => {
    const session = await getSupabaseBrowserClient()?.auth.getSession();
    if (!session?.data.session?.access_token) throw new Error(copy.signIn);
    return { Authorization: `Bearer ${session.data.session.access_token}` };
  }, [copy.signIn]);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/documents?scope=${scope}`, { headers: await headers(), cache: "no-store" });
      const data = await response.json() as { documents?: DocumentRow[]; candidates?: Candidate[]; error?: string };
      if (!response.ok) throw new Error(data.error || copy.loadFailed);
      setDocuments(data.documents || []); setCandidates(data.candidates || []);
    } catch (reason) { setError(reason instanceof Error ? reason.message : copy.loadFailed); }
    finally { setLoading(false); }
  }, [copy.loadFailed, headers, scope]);
  useEffect(() => { void load(); }, [load]);

  function selectFiles(nextFiles: File[]) {
    const unique = new Map<string, File>();
    [...files, ...nextFiles].forEach((file) => unique.set(`${file.name}:${file.size}:${file.lastModified}`, file));
    setFiles([...unique.values()].slice(0, 10));
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    selectFiles(Array.from(event.dataTransfer.files));
  }

  async function upload() {
    if (!files.length || uploading) return;
    setUploading(true); setError("");
    try {
      const form = new FormData(); form.set("scope", scope); form.set("documentType", documentType); form.set("accessMode", accessMode); files.forEach((file) => form.append("files", file));
      const response = await fetch("/api/documents", { method: "POST", headers: await headers(), body: form });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || copy.uploadFailed);
      setFiles([]); if (inputRef.current) inputRef.current.value = ""; await load(); onRecordsChanged?.();
    } catch (reason) { setError(reason instanceof Error ? reason.message : copy.uploadFailed); }
    finally { setUploading(false); }
  }
  async function candidateAction(documentId: string, candidateId: string, action: "approve" | "reject" | "commit") {
    setError("");
    try {
      const response = await fetch(`/api/documents/${documentId}/candidates/${candidateId}`, { method: "PATCH", headers: { ...(await headers()), "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || copy.actionFailed);
      await load(); onRecordsChanged?.();
    } catch (reason) { setError(reason instanceof Error ? reason.message : copy.actionFailed); }
  }
  async function remove(documentId: string) {
    if (!window.confirm(copy.confirmDelete)) return;
    try { const response = await fetch(`/api/documents/${documentId}`, { method: "DELETE", headers: await headers() }); if (!response.ok) { const data = await response.json() as { error?: string }; throw new Error(data.error || copy.deleteFailed); } await load(); onRecordsChanged?.(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : copy.deleteFailed); }
  }

  return <section className="document-ingestion-panel">
    <header><div><span><FileText />{copy.eyebrow}</span><h2>{scope === "personal" ? copy.personalTitle : copy.researchTitle}</h2><p>{copy.description}</p></div><button type="button" className="document-upload-trigger" onClick={() => inputRef.current?.click()}><Upload />{copy.chooseFiles}</button></header>
    <input ref={inputRef} className="sr-only" type="file" multiple accept={ACCEPT} onChange={(event) => selectFiles(Array.from(event.target.files || []))} />
    {!files.length ? <div className="document-dropzone" role="button" tabIndex={0} onClick={() => inputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={onDrop} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") inputRef.current?.click(); }}><Upload /><span>{copy.dropFiles}</span><small>{copy.fileFormats}</small></div> : null}
    {files.length ? <div className="document-upload-queue"><div><strong>{copy.selected(files.length)}</strong><span>{files.map((file) => file.name).join(", ")}</span></div><label>{copy.type}<select value={documentType} onChange={(event) => setDocumentType(event.target.value)}>{types.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label><label>{copy.use}<select value={accessMode} onChange={(event) => setAccessMode(event.target.value)}><option value="archive_only">{copy.archiveOnly}</option><option value="review">{copy.review}</option><option value="search_allowed">{copy.search}</option><option value="memory_candidate_allowed">{copy.candidates}</option></select></label><button type="button" onClick={() => void upload()} disabled={uploading}>{uploading ? <Loader2 className="animate-spin" /> : <Upload />}{uploading ? copy.uploading : copy.upload}</button><button type="button" onClick={() => { setFiles([]); if (inputRef.current) inputRef.current.value = ""; }} aria-label={copy.cancel}><X /></button></div> : null}
    {error ? <p className="document-error" role="alert"><ShieldAlert />{error}</p> : null}
    {scope === "research" ? <div className="document-ingestion-list">{loading ? <p className="document-empty"><Loader2 className="animate-spin" />{copy.loading}</p> : documents.length ? documents.map((document) => <article key={document.id} className="document-row"><div><strong>{document.title}</strong><span>{document.original_filename} · {formatSize(document.byte_size)} · {statusLabel(document.parsing_status, copy)}</span>{document.document_extractions?.[0]?.warnings?.map((warning) => <small key={warning}>{warning}</small>)}</div><div>{document.original_url ? <a href={document.original_url} target="_blank" rel="noreferrer">{copy.original}</a> : null}<button type="button" onClick={() => void remove(document.id)} aria-label={copy.delete}><Trash2 /></button></div>{candidates.filter((candidate) => candidate.document_id === document.id).map((candidate) => <section key={candidate.id} className="document-candidate"><strong>{copy.candidate} · {candidate.status}</strong><p>{candidate.content}</p>{candidate.status === "pending" || candidate.status === "edited" ? <footer><button type="button" onClick={() => void candidateAction(document.id, candidate.id, "approve")}><Check />{copy.approve}</button><button type="button" onClick={() => void candidateAction(document.id, candidate.id, "reject")}>{copy.reject}</button></footer> : candidate.status === "approved" ? <footer><button type="button" onClick={() => void candidateAction(document.id, candidate.id, "commit")}><Check />{copy.commit}</button><button type="button" onClick={() => void candidateAction(document.id, candidate.id, "reject")}>{copy.reject}</button></footer> : null}</section>)}</article>) : <p className="document-empty">{copy.empty}</p>}</div> : null}
  </section>;
}

function formatSize(size: number) { return size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`; }
function statusLabel(status: string, copy: typeof KO) { return copy.status[status as keyof typeof copy.status] || status; }

const KO = { eyebrow: "Document ingestion", personalTitle: "문서에서 개인 메모리 만들기", researchTitle: "연구자료 업로드 및 검토", description: "원본은 비공개로 보관되며, 승인 전에는 장기 메모리에 저장되지 않습니다.", chooseFiles: "파일 선택", dropFiles: "파일을 끌어 놓거나 선택하세요", fileFormats: "문서, 스프레드시트, 슬라이드, 이미지, 음성 · 파일당 25 MB", selected: (count: number) => `${count}개 파일 선택됨`, type: "문서 유형", use: "사용 방식", archiveOnly: "보관만", review: "분석 후 검토", search: "검색 허용", candidates: "장기 메모리 후보 허용", upload: "안전하게 업로드", uploading: "업로드 및 분석 중", cancel: "취소", loading: "문서를 불러오는 중입니다.", empty: "아직 업로드한 문서가 없습니다.", original: "원문 보기", delete: "문서 삭제", confirmDelete: "원본과 분석 결과를 삭제할까요?", deleteFailed: "문서를 삭제하지 못했습니다.", loadFailed: "문서를 불러오지 못했습니다.", uploadFailed: "문서를 업로드하지 못했습니다.", actionFailed: "후보 상태를 변경하지 못했습니다.", signIn: "문서를 사용하려면 로그인하세요.", candidate: "메모리 후보", approve: "승인", reject: "거부", commit: "메모리에 저장", status: { queued: "분석 대기", processing: "분석 중", completed: "분석 완료", needs_review: "검토 필요", unsupported: "원본 보관됨 · 변환 필요", failed: "분석 실패" }, personalTypes: [{ value: "journal", label: "일기" }, { value: "reflection", label: "회고" }, { value: "plan", label: "계획" }, { value: "profile", label: "자기소개" }, { value: "general", label: "일반 문서" }, { value: "other", label: "기타" }], researchTypes: [{ value: "paper", label: "논문" }, { value: "research_note", label: "연구노트" }, { value: "experiment_data", label: "실험데이터" }, { value: "report", label: "보고서" }, { value: "presentation", label: "발표자료" }, { value: "image", label: "이미지·도표" }, { value: "audio", label: "음성 기록" }, { value: "other", label: "기타" }] };
const EN = { ...KO, eyebrow: "Document ingestion", personalTitle: "Create personal memory from documents", researchTitle: "Upload and review research materials", description: "Original files stay private. Nothing is saved as long-term memory until you approve it.", chooseFiles: "Choose files", dropFiles: "Drop files here or choose files", fileFormats: "Documents, sheets, slides, images, and audio · 25 MB each", selected: (count: number) => `${count} file${count === 1 ? "" : "s"} selected`, type: "Document type", use: "Use", archiveOnly: "Archive only", review: "Analyze and review", search: "Allow search", candidates: "Allow memory candidates", upload: "Upload securely", uploading: "Uploading and extracting", cancel: "Cancel", loading: "Loading documents...", empty: "No uploaded documents yet.", original: "View original", delete: "Delete document", confirmDelete: "Delete the original and its extracted data?", deleteFailed: "Could not delete the document.", loadFailed: "Could not load documents.", uploadFailed: "Could not upload the document.", actionFailed: "Could not update the candidate.", signIn: "Sign in to use documents.", candidate: "Memory candidate", approve: "Approve", reject: "Reject", commit: "Save to memory", status: { queued: "Queued", processing: "Processing", completed: "Extracted", needs_review: "Needs review", unsupported: "Preserved · conversion needed", failed: "Extraction failed" }, personalTypes: [{ value: "journal", label: "Journal" }, { value: "reflection", label: "Reflection" }, { value: "plan", label: "Plan" }, { value: "profile", label: "Profile" }, { value: "general", label: "General document" }, { value: "other", label: "Other" }], researchTypes: [{ value: "paper", label: "Paper" }, { value: "research_note", label: "Research note" }, { value: "experiment_data", label: "Experiment data" }, { value: "report", label: "Report" }, { value: "presentation", label: "Presentation" }, { value: "image", label: "Image or chart" }, { value: "audio", label: "Audio record" }, { value: "other", label: "Other" }] };
