from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "apps/web/lib/documents/server.ts"
content = PATH.read_text(encoding="utf-8")


def replace_once(old: str, new: str) -> None:
    global content
    if new in content:
        return
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f"Expected one document-memory security pattern, found {count}: {old[:160]}")
    content = content.replace(old, new, 1)


# Every parent document query is explicitly scoped to the authenticated user,
# even though Supabase RLS is also required. This prevents service-role or future
# policy changes from mixing documents between accounts.
replace_once(
    '''    .from("documents")
    .select("id,title,original_filename,mime_type,extension,byte_size,memory_scope,document_type,uploaded_at,parsing_status,sensitivity,access_mode,storage_path,source_date,document_extractions(parser,status,page_count,word_count,warnings)")
    .eq("memory_scope", scope)''',
    '''    .from("documents")
    .select("id,title,original_filename,mime_type,extension,byte_size,memory_scope,document_type,uploaded_at,parsing_status,sensitivity,access_mode,storage_path,source_date,document_extractions(parser,status,page_count,word_count,warnings)")
    .eq("user_id", context.user.id)
    .eq("memory_scope", scope)'''
)
replace_once(
    '''    ? await context.client.from("memory_candidates").select("id,document_id,target_memory_type,title,content,confidence,temporal_stability,sensitivity,status,created_at,reviewed_at,committed_memory_id,structured_content").in("document_id", ids).order("created_at", { ascending: false })''',
    '''    ? await context.client.from("memory_candidates").select("id,document_id,target_memory_type,title,content,confidence,temporal_stability,sensitivity,status,created_at,reviewed_at,committed_memory_id,structured_content").eq("user_id", context.user.id).in("document_id", ids).order("created_at", { ascending: false })'''
)
replace_once(
    '''    .select("id,document_id,target_memory_type,title,content,status,evidence_chunk_ids,sensitivity")
    .eq("id", candidateId)''',
    '''    .select("id,document_id,target_memory_type,title,content,status,evidence_chunk_ids,sensitivity")
    .eq("user_id", context.user.id)
    .eq("id", candidateId)'''
)
replace_once(
    '''context.client.from("memory_candidates").update({ status: "rejected", reviewed_at: new Date().toISOString() }).eq("id", candidate.id)''',
    '''context.client.from("memory_candidates").update({ status: "rejected", reviewed_at: new Date().toISOString() }).eq("id", candidate.id).eq("user_id", context.user.id)'''
)
replace_once(
    '''context.client.from("memory_candidates").update({ status: editedContent ? "edited" : "approved", content, reviewed_at: new Date().toISOString() }).eq("id", candidate.id)''',
    '''context.client.from("memory_candidates").update({ status: editedContent ? "edited" : "approved", content, reviewed_at: new Date().toISOString() }).eq("id", candidate.id).eq("user_id", context.user.id)'''
)
content = content.replace("await markCommitted(context.client, candidate.id, String(memory.id));", "await markCommitted(context, candidate.id, String(memory.id));")
replace_once(
    '''context.client.from("documents").select("id,storage_path").eq("id", documentId).is("deleted_at", null)''',
    '''context.client.from("documents").select("id,storage_path").eq("user_id", context.user.id).eq("id", documentId).is("deleted_at", null)'''
)
replace_once(
    '''context.client.from("documents").update({ deleted_at: new Date().toISOString() }).eq("id", documentId)''',
    '''context.client.from("documents").update({ deleted_at: new Date().toISOString() }).eq("id", documentId).eq("user_id", context.user.id)'''
)
replace_once(
    '''    .from("documents")
    .select("id,title,source_date,document_type,original_filename,mime_type,extension,storage_path,parsing_status")
    .eq("memory_scope", scope)''',
    '''    .from("documents")
    .select("id,title,source_date,document_type,original_filename,mime_type,extension,storage_path,parsing_status")
    .eq("user_id", context.user.id)
    .eq("memory_scope", scope)'''
)
replace_once(
    '''context.client.from("documents").select("id,title,parsing_status").eq("memory_scope", input.scope).eq("checksum", checksum).is("deleted_at", null)''',
    '''context.client.from("documents").select("id,title,parsing_status").eq("user_id", context.user.id).eq("memory_scope", input.scope).eq("checksum", checksum).is("deleted_at", null)'''
)

# Document update statements are constrained by both document id and owner id.
content = content.replace(
    '''context.client.from("documents").update({ parsing_status: extraction.status, language: extraction.language || null, source_date: extraction.sourceDate || null, metadata: { storage_path: document.storage_path, parser: extraction.parser, warnings: extraction.warnings } }).eq("id", document.id)''',
    '''context.client.from("documents").update({ parsing_status: extraction.status, language: extraction.language || null, source_date: extraction.sourceDate || null, metadata: { storage_path: document.storage_path, parser: extraction.parser, warnings: extraction.warnings } }).eq("id", document.id).eq("user_id", context.user.id)'''
)
content = content.replace(
    '''context.client.from("documents").update({ parsing_status: extraction.status, language: extraction.language || null, source_date: extraction.sourceDate || null, metadata: { storage_path: storagePath, parser: extraction.parser, warnings: extraction.warnings } }).eq("id", id)''',
    '''context.client.from("documents").update({ parsing_status: extraction.status, language: extraction.language || null, source_date: extraction.sourceDate || null, metadata: { storage_path: storagePath, parser: extraction.parser, warnings: extraction.warnings } }).eq("id", id).eq("user_id", context.user.id)'''
)
content = content.replace(
    '''context.client.from("documents").update({ parsing_status: "failed", metadata: { storage_path: storagePath, warnings: [warning] } }).eq("id", id)''',
    '''context.client.from("documents").update({ parsing_status: "failed", metadata: { storage_path: storagePath, warnings: [warning] } }).eq("id", id).eq("user_id", context.user.id)'''
)

# Candidate finalization is also owner-bound.
replace_once(
    '''async function markCommitted(client: SupabaseClient, candidateId: string, memoryId: string) {
  const { error } = await client.from("memory_candidates").update({ status: "committed", reviewed_at: new Date().toISOString(), committed_memory_id: memoryId }).eq("id", candidateId);''',
    '''async function markCommitted(context: DocumentContext, candidateId: string, memoryId: string) {
  const { error } = await context.client.from("memory_candidates").update({ status: "committed", reviewed_at: new Date().toISOString(), committed_memory_id: memoryId }).eq("id", candidateId).eq("user_id", context.user.id);'''
)

# Child tables do not carry user_id. They are reached only through document ids
# selected from the authenticated user's parent rows; migration 015 additionally
# enforces parent ownership in RLS.
PATH.write_text(content, encoding="utf-8")
print("Document-memory account isolation patch applied.")
