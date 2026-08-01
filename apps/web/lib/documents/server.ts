import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { MemoryRecord } from "@heather/core";
import { ContextControlError } from "../context-control/server";
import { DOCUMENT_LIMITS, extractDocument, getExtension, type DocumentScope, validateDocumentFile } from "./parser";

export type DocumentContext = { client: SupabaseClient; user: User };
type JsonRecord = Record<string, unknown>;

const SCOPES = new Set<DocumentScope>(["personal", "research", "project", "sensitive"]);
const PERSONAL_TYPES = new Set(["journal", "reflection", "plan", "profile", "general", "other"]);
const RESEARCH_TYPES = new Set(["paper", "research_note", "experiment_data", "report", "presentation", "image", "audio", "video", "other"]);
const ACCESS_MODES = new Set(["archive_only", "review", "search_allowed", "memory_candidate_allowed"]);

export async function listDocuments(context: DocumentContext, scope: DocumentScope) {
  const { data: documents, error } = await context.client
    .from("documents")
    .select("id,title,original_filename,mime_type,extension,byte_size,memory_scope,document_type,uploaded_at,parsing_status,sensitivity,access_mode,storage_path,source_date,document_extractions(parser,status,page_count,word_count,warnings)")
    .eq("memory_scope", scope)
    .is("deleted_at", null)
    .order("uploaded_at", { ascending: false })
    .limit(100);
  if (error) throw new ContextControlError("Could not load documents. Apply migration 010 and try again.", 503);
  const ids = (documents || []).map((document) => String(document.id));
  const { data: candidates, error: candidateError } = ids.length
    ? await context.client.from("memory_candidates").select("id,document_id,target_memory_type,title,content,confidence,temporal_stability,sensitivity,status,created_at,reviewed_at,committed_memory_id,structured_content").in("document_id", ids).order("created_at", { ascending: false })
    : { data: [], error: null };
  if (candidateError) throw new ContextControlError("Could not load memory candidates.", 503);
  const signedUrls = new Map<string, string>();
  await Promise.all((documents || []).map(async (document) => {
    const signed = await context.client.storage.from("documents").createSignedUrl(String(document.storage_path), 60 * 15);
    if (signed.data?.signedUrl) signedUrls.set(String(document.id), signed.data.signedUrl);
  }));
  return {
    documents: (documents || []).map(({ storage_path: _storagePath, ...document }) => ({ ...document, original_url: signedUrls.get(String(document.id)) || null })),
    candidates: candidates || []
  };
}

export async function uploadDocuments(context: DocumentContext, form: FormData) {
  const scope = parseScope(form.get("scope"));
  const documentType = parseDocumentType(form.get("documentType"), scope);
  const accessMode = parseAccessMode(form.get("accessMode"));
  const requestedSensitivity = String(form.get("sensitivity") || "normal");
  const files = form.getAll("files").filter((item): item is File => item instanceof File);
  if (!files.length || files.length > DOCUMENT_LIMITS.maxFiles) throw new ContextControlError(`Upload between 1 and ${DOCUMENT_LIMITS.maxFiles} files.`, 400);
  if (files.reduce((total, file) => total + file.size, 0) > DOCUMENT_LIMITS.maxTotalBytes) throw new ContextControlError("The combined upload must be smaller than 50 MB.", 413);
  const results = [];
  for (const file of files) results.push(await uploadOne(context, file, { scope, documentType, accessMode, requestedSensitivity, title: String(form.get("title") || "").trim() }));
  return { documents: results };
}

export async function updateCandidate(context: DocumentContext, documentId: string, candidateId: string, action: "approve" | "reject" | "commit", editedContent?: string) {
  const { data: candidate, error } = await context.client
    .from("memory_candidates")
    .select("id,document_id,target_memory_type,title,content,status,evidence_chunk_ids,sensitivity")
    .eq("id", candidateId)
    .eq("document_id", documentId)
    .maybeSingle();
  if (error || !candidate) throw new ContextControlError("Memory candidate not found.", 404);
  const content = (editedContent || String(candidate.content)).trim().slice(0, 10_000);
  if (action === "reject") {
    const { error: updateError } = await context.client.from("memory_candidates").update({ status: "rejected", reviewed_at: new Date().toISOString() }).eq("id", candidate.id);
    if (updateError) throw new ContextControlError("Could not reject this candidate.", 503);
    return { status: "rejected" };
  }
  if (action === "approve") {
    const { error: updateError } = await context.client.from("memory_candidates").update({ status: editedContent ? "edited" : "approved", content, reviewed_at: new Date().toISOString() }).eq("id", candidate.id);
    if (updateError) throw new ContextControlError("Could not approve this candidate.", 503);
    return { status: editedContent ? "edited" : "approved" };
  }
  if (!content) throw new ContextControlError("A memory candidate needs content before it can be saved.", 400);
  const provenance = { document_id: candidate.document_id, candidate_id: candidate.id, evidence_chunk_ids: candidate.evidence_chunk_ids || [], source: "document_ingestion" };
  if (candidate.target_memory_type === "personal") {
    const { data: memory, error: memoryError } = await context.client.from("personal_memories").insert({ user_id: context.user.id, title: candidate.title, content, memory_type: "important_fact", tags: ["document"], metadata: provenance }).select("id").single();
    if (memoryError || !memory) throw new ContextControlError("Could not save the approved personal memory.", 503);
    await markCommitted(context.client, candidate.id, String(memory.id));
    return { status: "committed", memoryId: memory.id };
  }
  const { data: memory, error: memoryError } = await context.client.from("research_memories").insert({ owner_id: context.user.id, scope: "private", title: candidate.title, content, memory_type: "project_context", tags: ["document"], structured_data: {}, metadata: provenance }).select("id").single();
  if (memoryError || !memory) throw new ContextControlError("Could not save the approved research memory.", 503);
  await markCommitted(context.client, candidate.id, String(memory.id));
  return { status: "committed", memoryId: memory.id };
}

export async function deleteDocument(context: DocumentContext, documentId: string) {
  const { data: document, error } = await context.client.from("documents").select("id,storage_path").eq("id", documentId).is("deleted_at", null).maybeSingle();
  if (error || !document) throw new ContextControlError("Document not found.", 404);
  const { error: storageError } = await context.client.storage.from("documents").remove([String(document.storage_path)]);
  if (storageError) throw new ContextControlError("Could not remove the original document.", 503);
  const { error: updateError } = await context.client.from("documents").update({ deleted_at: new Date().toISOString() }).eq("id", documentId);
  if (updateError) throw new ContextControlError("Could not finalize document deletion.", 503);
}

/**
 * Retrieves a small, relevant excerpt from the signed-in user's personal
 * documents. High-sensitivity journals and review-mode uploads are included
 * only after the user explicitly enabled personal document chat access.
 * Originals and storage locations never leave this server-side boundary.
 */
export async function retrieveDocumentMemoryContext(context: DocumentContext, scope: "personal" | "research", message: string): Promise<MemoryRecord[]> {
  const normalizedMessage = message.toLocaleLowerCase();
  const terms = normalizedMessage.match(/[a-z]{3,}|[가-힣]{2,}/g) || [];
  if (!terms.length) return [];
  const { data: candidates, error: candidateError } = await context.client
    .from("documents")
    .select("id,title,source_date,document_type,original_filename,mime_type,extension,storage_path,parsing_status")
    .eq("memory_scope", scope)
    .in("access_mode", ["search_allowed", "review", "memory_candidate_allowed"])
    .in("sensitivity", ["normal", "high"])
    .is("deleted_at", null)
    .limit(100);
  if (candidateError || !candidates?.length) return [];

  const explicitDocumentRequest = /\b(my (?:document|file|journal|diary)|uploaded (?:document|file))\b|개인\s*메모리|내\s*(?:파일|문서|일기)|업로드(?:한|한\s*파일|한\s*문서)|일기(?:를|의|파일)?/.test(normalizedMessage);
  const journalRequest = /\b(journal|diary)\b|일기|성찰/.test(normalizedMessage);
  // Legacy HWP files are re-read from the private original automatically when
  // the user asks about their documents. The original is never converted in
  // place or replaced; extraction is only a searchable reading index.
  const documentsToReprocess = (candidates || []).filter((document) => {
    if (String(document.parsing_status) === "completed") return false;
    const label = `${document.title} ${document.original_filename} ${document.document_type}`.toLocaleLowerCase();
    return explicitDocumentRequest || terms.some((term) => label.includes(term));
  }).slice(0, 5);
  await Promise.all(documentsToReprocess.map((document) => reprocessStoredDocument(context, document)));

  const documents = (candidates || []).filter((document) => String(document.parsing_status) === "completed" || documentsToReprocess.some((match) => String(match.id) === String(document.id)));
  if (!documents.length) return [];

  const journalDocuments = journalRequest
    ? documents.filter((document) => isJournalLikeDocument(document))
    : [];
  const searchDocuments = journalDocuments.length ? journalDocuments : documents;
  const documentIds = searchDocuments.map((document) => String(document.id));
  const { data: chunks, error: chunkError } = await context.client
    .from("document_chunks")
    .select("id,document_id,chunk_index,content,section_title,page_start,page_end")
    .in("document_id", documentIds)
    .limit(240);
  if (chunkError || !chunks?.length) return [];
  const documentById = new Map(searchDocuments.map((document) => [String(document.id), document]));
  return chunks
    .map((chunk) => {
      const document = documentById.get(String(chunk.document_id));
      if (!document) return null;
      const haystack = `${document.title} ${document.original_filename} ${document.document_type} ${chunk.content}`.toLocaleLowerCase();
      const isJournal = journalRequest && isJournalLikeDocument(document);
      const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0) + (isJournal ? 3 : 0);
      if (!score) return null;
      const location = [chunk.section_title, chunk.page_start ? `p.${chunk.page_start}${chunk.page_end && chunk.page_end !== chunk.page_start ? `-${chunk.page_end}` : ""}` : null].filter(Boolean).join(" · ");
      return {
        id: `document-${chunk.id}`,
        type: scope === "research" ? "project_context" : "important_fact",
        content: String(chunk.content).slice(0, 1_500),
        source: `document: ${document.title}${document.source_date ? ` (${document.source_date})` : ""}${location ? ` · ${location}` : ""}`,
        confidence: Math.min(.9, .5 + score * .1),
        tags: ["document", document.document_type, "direct_record"],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        archived: false,
        score
      };
    })
    .filter((item): item is MemoryRecord & { score: number } => item !== null)
    .sort((left, right) => right.score - left.score)
    .slice(0, journalRequest ? 6 : 4)
    .map(({ score: _score, ...memory }) => memory);
}

function isJournalLikeDocument(document: { document_type?: unknown; title?: unknown; original_filename?: unknown }) {
  const label = `${document.document_type || ""} ${document.title || ""} ${document.original_filename || ""}`.toLocaleLowerCase();
  return /\b(journal|diary|reflection)\b|일기|성찰/.test(label);
}

export async function reprocessStoredDocument(context: DocumentContext, document: { id: string; original_filename: string; mime_type: string; extension: string; storage_path: string }) {
  try {
    const downloaded = await context.client.storage.from("documents").download(String(document.storage_path));
    if (downloaded.error || !downloaded.data) return;
    const file = new File([await downloaded.data.arrayBuffer()], String(document.original_filename), { type: String(document.mime_type || "application/octet-stream") });
    const extraction = await extractDocument(file, String(document.extension));
    const { data: extractionRow, error: extractionError } = await context.client.from("document_extractions")
      .upsert({ document_id: document.id, parser: extraction.parser, parser_version: extraction.parserVersion, status: extraction.status, extracted_text: extraction.extractedText || null, structured_content: extraction.structuredContent, page_count: extraction.pageCount || null, word_count: wordCount(extraction.extractedText), warnings: extraction.warnings, completed_at: new Date().toISOString() }, { onConflict: "document_id" })
      .select("id").single();
    if (extractionError || !extractionRow) return;
    await context.client.from("document_chunks").delete().eq("document_id", document.id);
    const chunks = chunkText(extraction.extractedText);
    if (chunks.length) await context.client.from("document_chunks").insert(chunks.map((content, chunkIndex) => ({ document_id: document.id, extraction_id: extractionRow.id, chunk_index: chunkIndex, content, metadata: { parser: extraction.parser, reprocessed: true } })));
    await context.client.from("documents").update({ parsing_status: extraction.status, language: extraction.language || null, source_date: extraction.sourceDate || null, metadata: { storage_path: document.storage_path, parser: extraction.parser, warnings: extraction.warnings } }).eq("id", document.id);
  } catch {
    // Keep the original safely preserved if a legacy file cannot be re-read.
  }
}

async function uploadOne(context: DocumentContext, file: File, input: { scope: DocumentScope; documentType: string; accessMode: string; requestedSensitivity: string; title: string }) {
  const { extension } = await validateDocumentFile(file);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const { data: duplicate, error: duplicateError } = await context.client.from("documents").select("id,title,parsing_status").eq("memory_scope", input.scope).eq("checksum", checksum).is("deleted_at", null).maybeSingle();
  if (duplicateError) throw new ContextControlError("Could not check for duplicate documents.", 503);
  if (duplicate) return { id: duplicate.id, title: duplicate.title, parsing_status: duplicate.parsing_status, duplicate: true };
  const id = randomUUID();
  const storagePath = `${context.user.id}/${input.scope}/${id}/${safeFilename(file.name)}`;
  const upload = await context.client.storage.from("documents").upload(storagePath, bytes, { contentType: file.type || contentTypeFor(extension), upsert: false });
  if (upload.error) throw new ContextControlError("Could not store the original document.", 503);
  let documentCreated = false;
  try {
    const sensitivity = input.documentType === "journal" ? "high" : input.scope === "sensitive" ? "sensitive" : input.requestedSensitivity === "high" ? "high" : "normal";
    const { data: document, error } = await context.client.from("documents").insert({ id, user_id: context.user.id, memory_scope: input.scope, document_type: input.documentType, title: input.title || titleFromFilename(file.name), original_filename: file.name, mime_type: file.type || contentTypeFor(extension), extension, byte_size: file.size, storage_path: storagePath, checksum, parsing_status: "processing", sensitivity, access_mode: input.accessMode, metadata: { storage_path: storagePath } }).select("id").single();
    if (error || !document) throw new ContextControlError("Could not create the document record.", 503);
    documentCreated = true;
    await context.client.from("document_versions").insert({ document_id: id, version: 1, checksum, storage_path: storagePath });
    const extraction = await extractDocument(file, extension);
    const { data: extractionRow, error: extractionError } = await context.client.from("document_extractions").insert({ document_id: id, parser: extraction.parser, parser_version: extraction.parserVersion, status: extraction.status, extracted_text: extraction.extractedText || null, structured_content: extraction.structuredContent, page_count: extraction.pageCount || null, word_count: wordCount(extraction.extractedText), warnings: extraction.warnings, completed_at: new Date().toISOString() }).select("id").single();
    if (extractionError || !extractionRow) throw new ContextControlError("Could not save extracted document data.", 503);
    const chunks = chunkText(extraction.extractedText);
    if (chunks.length) {
      const { data: insertedChunks, error: chunkError } = await context.client.from("document_chunks").insert(chunks.map((content, chunkIndex) => ({ document_id: id, extraction_id: extractionRow.id, chunk_index: chunkIndex, content, metadata: { parser: extraction.parser } }))).select("id");
      if (chunkError) throw new ContextControlError("Could not save document chunks.", 503);
      if (input.accessMode !== "archive_only") await createCandidate(context, { documentId: id, documentType: input.documentType, scope: input.scope, title: input.title || titleFromFilename(file.name), text: extraction.extractedText, chunkIds: (insertedChunks || []).map((chunk) => String(chunk.id)), sensitivity });
    }
    await context.client.from("documents").update({ parsing_status: extraction.status, language: extraction.language || null, source_date: extraction.sourceDate || null, metadata: { storage_path: storagePath, parser: extraction.parser, warnings: extraction.warnings } }).eq("id", id);
    return { id, title: input.title || titleFromFilename(file.name), parsing_status: extraction.status, warnings: extraction.warnings, duplicate: false };
  } catch (error) {
    if (!documentCreated) {
      await context.client.storage.from("documents").remove([storagePath]);
      throw error;
    }
    const warning = error instanceof Error ? error.message : "Document extraction failed.";
    await context.client.from("document_extractions").upsert({ document_id: id, parser: "preservation", parser_version: "1", status: "failed", extracted_text: null, structured_content: { preserved: true }, warnings: [warning], completed_at: new Date().toISOString() }, { onConflict: "document_id" });
    await context.client.from("documents").update({ parsing_status: "failed", metadata: { storage_path: storagePath, warnings: [warning] } }).eq("id", id);
    // The original is intentionally retained so an updated parser or conversion can be used later.
    return { id, title: input.title || titleFromFilename(file.name), parsing_status: "failed", warnings: [warning], duplicate: false };
  }
}

async function createCandidate(context: DocumentContext, input: { documentId: string; documentType: string; scope: DocumentScope; title: string; text: string; chunkIds: string[]; sensitivity: string }) {
  const content = input.text.trim().slice(0, 4000);
  if (!content) return;
  const target = input.scope === "research" || input.scope === "project" ? "research" : "personal";
  const structured = input.documentType === "journal" ? { kind: "journal", source_date: inferDateFromText(input.text), direct_record: true } : { kind: input.documentType, direct_record: true };
  const { error } = await context.client.from("memory_candidates").insert({ user_id: context.user.id, document_id: input.documentId, target_memory_type: target, title: input.title, content, structured_content: structured, evidence_chunk_ids: input.chunkIds.slice(0, 8), confidence: 0.62, temporal_stability: input.documentType === "journal" ? "time_bound" : "needs_review", sensitivity: input.sensitivity, status: "pending" });
  if (error) throw new ContextControlError("Could not create the review candidate.", 503);
}

async function markCommitted(client: SupabaseClient, candidateId: string, memoryId: string) {
  const { error } = await client.from("memory_candidates").update({ status: "committed", reviewed_at: new Date().toISOString(), committed_memory_id: memoryId }).eq("id", candidateId);
  if (error) throw new ContextControlError("The memory was saved but its document provenance could not be finalized.", 503);
}

function parseScope(value: FormDataEntryValue | null): DocumentScope { const scope = String(value || "personal"); if (!SCOPES.has(scope as DocumentScope)) throw new ContextControlError("Invalid memory scope.", 400); return scope as DocumentScope; }
function parseDocumentType(value: FormDataEntryValue | null, scope: DocumentScope) { const type = String(value || "general"); if (!(scope === "research" || scope === "project") && !PERSONAL_TYPES.has(type)) throw new ContextControlError("Invalid personal document type.", 400); if ((scope === "research" || scope === "project") && !RESEARCH_TYPES.has(type)) throw new ContextControlError("Invalid research document type.", 400); return type; }
function parseAccessMode(value: FormDataEntryValue | null) { const mode = String(value || "review"); if (!ACCESS_MODES.has(mode)) throw new ContextControlError("Invalid document access mode.", 400); return mode; }
function safeFilename(value: string) { return value.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 180) || "document"; }
function titleFromFilename(value: string) { return value.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, 300) || "Untitled document"; }
function contentTypeFor(extension: string) { return ({ txt: "text/plain", md: "text/markdown", pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", hwpx: "application/zip", hwp: "application/x-hwp", rtf: "application/rtf", odt: "application/vnd.oasis.opendocument.text", csv: "text/csv", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation" })[extension] || "application/octet-stream"; }
function wordCount(value: string) { return value ? value.split(/\s+/).filter(Boolean).length : 0; }
function chunkText(value: string) { const normalized = value.trim(); if (!normalized) return []; const output: string[] = []; for (let index = 0; index < normalized.length; index += 1800) output.push(normalized.slice(index, index + 1800)); return output; }
function inferDateFromText(value: string) { const match = value.match(/(20\d{2})[.\-/년\s]+(0?[1-9]|1[0-2])[.\-/월\s]+([0-3]?\d)/); return match ? `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}` : null; }
