import type { MemoryRecord } from "@heather/core";
import { ContextControlError, type ContextClient } from "../context-control/server";
import { reprocessStoredDocument } from "../documents/server";

export type PersonalMemoryScope = "all" | "journal" | "direct" | "project";
export type PersonalMemoryScopeCounts = Record<PersonalMemoryScope, number>;

export async function getPersonalMemoryScopeData(context: ContextClient, scope: PersonalMemoryScope, query: string) {
  const [personal, documents, projects, projectMemories, operationalRecords, persistentMemos, persistentEntries] = await Promise.all([
    context.client.from("personal_memories").select("id,content,memory_type,tags,metadata,created_at,updated_at", { count: "exact" }).eq("user_id", context.user.id).eq("archived", false).order("updated_at", { ascending: false }).limit(1000),
    context.client.from("documents").select("id,title,source_date,document_type,uploaded_at,original_filename,mime_type,extension,storage_path,parsing_status", { count: "exact" }).eq("user_id", context.user.id).eq("memory_scope", "personal").is("deleted_at", null).order("uploaded_at", { ascending: false }).limit(1000),
    context.client.from("context_projects").select("id,name,status,created_at,updated_at", { count: "exact" }).eq("owner_user_id", context.user.id).order("updated_at", { ascending: false }).limit(1000),
    context.client.from("project_context_memories").select("id,project_id,title,content,source,created_at,updated_at", { count: "exact" }).eq("user_id", context.user.id).order("updated_at", { ascending: false }).limit(1000),
    context.client.from("operational_contexts").select("id,project_id,title,content,source,created_at,updated_at", { count: "exact" }).eq("user_id", context.user.id).order("updated_at", { ascending: false }).limit(1000),
    context.client.from("personal_memos").select("id,title,current_summary,version,status,created_at,updated_at", { count: "exact" }).eq("user_id", context.user.id).in("status", ["active", "archived"]).order("updated_at", { ascending: false }).limit(1000),
    context.client.from("personal_memo_entries").select("memo_id,status").eq("user_id", context.user.id).eq("status", "active").limit(5000)
  ]);
  if (personal.error) throw new ContextControlError("Personal memory search is temporarily unavailable.", 503);
  const storedDocuments = documents.error ? [] : documents.data || [];
  // Retry older legacy HWP uploads after the parser upgrade. Only the signed-in
  // user's unfinished HWP files are read from private storage.
  await Promise.all(storedDocuments.filter((document) => document.extension === "hwp" && String(document.parsing_status) !== "completed").slice(0, 5).map((document) => reprocessStoredDocument(context, document)));
  const documentIds = storedDocuments.map((document) => String(document.id));
  const extractions = documentIds.length
    ? await context.client.from("document_extractions").select("document_id,extracted_text,status").in("document_id", documentIds)
    : { data: [], error: null };
  const extractionByDocument = new Map((extractions.error ? [] : extractions.data || []).map((row) => [String(row.document_id), row]));
  const uploadedDocuments = storedDocuments.map((document) => {
    const extraction = extractionByDocument.get(String(document.id));
    return { ...document, document_extractions: extraction ? [extraction] : [] };
  });
  const entryCountByMemo = new Map<string, number>();
  if (!persistentEntries.error) for (const entry of persistentEntries.data || []) entryCountByMemo.set(String(entry.memo_id), (entryCountByMemo.get(String(entry.memo_id)) || 0) + 1);
  const direct = [
    ...(personal.data || []).filter((row) => !isDocumentBacked(row.metadata)).map((row) => toDirectMemory(row)),
    ...(persistentMemos.error ? [] : persistentMemos.data || []).map((row) => toPersistentMemoMemory(row, entryCountByMemo.get(String(row.id)) || 0)),
    ...uploadedDocuments.filter((row) => row.document_type !== "journal").map((row) => toUploadedDocumentMemory(row))
  ];
  const journal = uploadedDocuments.filter((row) => row.document_type === "journal").map((row) => toJournalMemory(row));
  const project = [
    ...(projects.error ? [] : projects.data || []).map((row) => toProjectCreationMemory(row)),
    ...(projectMemories.error ? [] : projectMemories.data || []).map((row) => toProjectRecordMemory(row, "project_context")),
    ...(operationalRecords.error ? [] : operationalRecords.data || []).map((row) => toProjectRecordMemory(row, "operational_record"))
  ];
  const directCount = (personal.data || []).filter((row) => !isDocumentBacked(row.metadata)).length + (persistentMemos.error ? 0 : persistentMemos.count || 0) + uploadedDocuments.filter((row) => row.document_type !== "journal").length;
  const journalCount = journal.length;
  const projectCount = (projects.error ? 0 : projects.count || 0) + (projectMemories.error ? 0 : projectMemories.count || 0) + (operationalRecords.error ? 0 : operationalRecords.count || 0);
  const counts: PersonalMemoryScopeCounts = { all: directCount + journalCount + projectCount, journal: journalCount, direct: directCount, project: projectCount };
  const source = scope === "journal" ? journal : scope === "direct" ? direct : scope === "project" ? project : [...journal, ...direct, ...project];
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const records = source
    .filter((record) => !normalizedQuery || `${record.source} ${record.content} ${record.tags.join(" ")}`.toLocaleLowerCase().includes(normalizedQuery))
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at));
  return { counts, records, searchCount: records.length };
}

function isDocumentBacked(metadata: unknown) {
  return Boolean(metadata && typeof metadata === "object" && (metadata as Record<string, unknown>).source === "document_ingestion");
}

function toDirectMemory(row: { id: string; content: string; memory_type: string; tags: string[] | null; created_at: string; updated_at: string }): MemoryRecord {
  return { id: String(row.id), type: String(row.memory_type || "important_fact") as MemoryRecord["type"], content: String(row.content), source: "personal", confidence: .72, tags: Array.isArray(row.tags) ? row.tags.map(String) : [], created_at: String(row.created_at), updated_at: String(row.updated_at), archived: false };
}

function toPersistentMemoMemory(row: { id: string; title: string; current_summary: string; version: number; created_at: string; updated_at: string }, activeEntryCount: number): MemoryRecord {
  const summary = String(row.current_summary || "아직 정리된 내용이 없습니다.");
  return {
    id: `persistent-memo-${row.id}`,
    type: "important_fact",
    content: `${row.title}\n${summary}`.slice(0, 8_000),
    source: `personal memo · ${row.title} · ${activeEntryCount} items · v${row.version}`,
    confidence: .9,
    tags: ["direct_record", "personal_memo"],
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    archived: false
  };
}

function toJournalMemory(row: { id: string; title: string; source_date: string | null; uploaded_at: string; parsing_status: string; document_extractions: Array<{ extracted_text: string | null; status: string }> | null }): MemoryRecord {
  const extraction = row.document_extractions?.[0];
  const date = row.source_date || row.uploaded_at;
  return { id: `journal-document-${row.id}`, type: "important_fact", content: fileRecordText(row.title, extraction?.status || row.parsing_status), source: `journal file · ${row.title}${row.source_date ? ` · ${row.source_date}` : " · undated"}`, confidence: extraction?.status === "completed" ? .9 : .55, tags: ["journal", "document", "direct_record"], created_at: date, updated_at: date, archived: false };
}

function toUploadedDocumentMemory(row: { id: string; title: string; document_type: string; uploaded_at: string; parsing_status: string; document_extractions: Array<{ extracted_text: string | null; status: string }> | null }): MemoryRecord {
  const extraction = row.document_extractions?.[0];
  return { id: `direct-document-${row.id}`, type: "important_fact", content: fileRecordText(row.title, extraction?.status || row.parsing_status), source: `personal file · ${row.title}`, confidence: extraction?.status === "completed" ? .9 : .55, tags: ["document", String(row.document_type), "direct_record"], created_at: String(row.uploaded_at), updated_at: String(row.uploaded_at), archived: false };
}

function fileRecordText(title: string, status: string) { return `파일: ${title}\n${status === "completed" || status === "needs_review" ? "원본은 안전하게 보관되며, Heather는 개인 채팅에서 필요한 부분만 읽습니다." : "원본은 안전하게 보관되며, Heather가 읽을 수 있도록 자동 추출을 다시 시도하고 있습니다."}`; }

function toProjectCreationMemory(row: { id: string; name: string; status: string; created_at: string; updated_at: string }): MemoryRecord {
  return { id: `project-creation-${row.id}`, type: "project_context", content: `Project created: ${row.name}. Current status: ${row.status}.`, source: "project record · creation", confidence: 1, tags: ["project", "project_creation", "direct_record"], created_at: String(row.created_at), updated_at: String(row.updated_at), archived: false };
}

function toProjectRecordMemory(row: { id: string; title: string; content: string; source: string; created_at: string; updated_at: string }, kind: "project_context" | "operational_record"): MemoryRecord {
  return { id: `project-record-${kind}-${row.id}`, type: "project_context", content: `${row.title}\n${row.content}`.slice(0, 4000), source: `project record · ${row.source || kind}`, confidence: .9, tags: ["project", kind, "direct_record"], created_at: String(row.created_at), updated_at: String(row.updated_at), archived: false };
}
