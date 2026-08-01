import type { MemoryRecord } from "@heather/core";
import { ContextControlError, type ContextClient } from "../context-control/server";

export type PersonalMemoryScope = "all" | "journal" | "direct" | "project";
export type PersonalMemoryScopeCounts = Record<PersonalMemoryScope, number>;

export async function getPersonalMemoryScopeData(context: ContextClient, scope: PersonalMemoryScope, query: string) {
  const [personal, documentBackedPersonal, journals, projects, projectMemories, operationalRecords] = await Promise.all([
    context.client.from("personal_memories").select("id,content,memory_type,tags,metadata,created_at,updated_at", { count: "exact" }).eq("user_id", context.user.id).eq("archived", false).order("updated_at", { ascending: false }).limit(1000),
    context.client.from("personal_memories").select("id", { count: "exact", head: true }).eq("user_id", context.user.id).eq("archived", false).contains("metadata", { source: "document_ingestion" }),
    context.client.from("documents").select("id,title,source_date,document_type,uploaded_at,document_extractions(extracted_text,status)", { count: "exact" }).eq("user_id", context.user.id).eq("memory_scope", "personal").eq("document_type", "journal").is("deleted_at", null).in("parsing_status", ["completed", "needs_review"]).order("source_date", { ascending: false }).limit(1000),
    context.client.from("context_projects").select("id,name,status,created_at,updated_at", { count: "exact" }).eq("owner_user_id", context.user.id).order("updated_at", { ascending: false }).limit(1000),
    context.client.from("project_context_memories").select("id,project_id,title,content,source,created_at,updated_at", { count: "exact" }).eq("user_id", context.user.id).order("updated_at", { ascending: false }).limit(1000),
    context.client.from("operational_contexts").select("id,project_id,title,content,source,created_at,updated_at", { count: "exact" }).eq("user_id", context.user.id).order("updated_at", { ascending: false }).limit(1000)
  ]);
  const failure = [personal, documentBackedPersonal, journals, projects, projectMemories, operationalRecords].find((result) => result.error)?.error;
  if (failure) throw new ContextControlError("Personal memory search needs the latest Heather database migration.", 503);

  const direct = (personal.data || []).filter((row) => !isDocumentBacked(row.metadata)).map((row) => toDirectMemory(row));
  const journal = (journals.data || []).map((row) => toJournalMemory(row));
  const project = [
    ...(projects.data || []).map((row) => toProjectCreationMemory(row)),
    ...(projectMemories.data || []).map((row) => toProjectRecordMemory(row, "project_context")),
    ...(operationalRecords.data || []).map((row) => toProjectRecordMemory(row, "operational_record"))
  ];
  const directCount = Math.max(0, (personal.count || 0) - (documentBackedPersonal.count || 0));
  const journalCount = journals.count || 0;
  const projectCount = (projects.count || 0) + (projectMemories.count || 0) + (operationalRecords.count || 0);
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

function toJournalMemory(row: { id: string; title: string; source_date: string | null; uploaded_at: string; document_extractions: Array<{ extracted_text: string | null; status: string }> | null }): MemoryRecord {
  const extraction = row.document_extractions?.[0];
  const date = row.source_date || row.uploaded_at;
  return { id: `journal-document-${row.id}`, type: "important_fact", content: String(extraction?.extracted_text || "This journal document has no readable text yet.").slice(0, 4000), source: `journal · ${row.title}${row.source_date ? ` · ${row.source_date}` : " · undated"}`, confidence: extraction?.status === "completed" ? .9 : .55, tags: ["journal", "document", "direct_record"], created_at: date, updated_at: date, archived: false };
}

function toProjectCreationMemory(row: { id: string; name: string; status: string; created_at: string; updated_at: string }): MemoryRecord {
  return { id: `project-creation-${row.id}`, type: "project_context", content: `Project created: ${row.name}. Current status: ${row.status}.`, source: "project record · creation", confidence: 1, tags: ["project", "project_creation", "direct_record"], created_at: String(row.created_at), updated_at: String(row.updated_at), archived: false };
}

function toProjectRecordMemory(row: { id: string; title: string; content: string; source: string; created_at: string; updated_at: string }, kind: "project_context" | "operational_record"): MemoryRecord {
  return { id: `project-record-${kind}-${row.id}`, type: "project_context", content: `${row.title}\n${row.content}`.slice(0, 4000), source: `project record · ${row.source || kind}`, confidence: .9, tags: ["project", kind, "direct_record"], created_at: String(row.created_at), updated_at: String(row.updated_at), archived: false };
}
