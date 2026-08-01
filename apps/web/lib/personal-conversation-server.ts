import { createClient } from "@supabase/supabase-js";
import type { ChatExecutionMode, Conversation, ConversationMessage } from "@heather/core";
import { executionModeForStoredValue, parseChatExecutionMode } from "./chat/execution-mode";

type ConversationRow = { id: string; title: string; created_at: string; updated_at: string; archived: boolean; last_message_at: string; execution_mode?: string | null; execution_mode_updated_at?: string | null };
type MessageRow = { id: string; conversation_id: string; role: ConversationMessage["role"]; content: string; source: string | null; status: ConversationMessage["status"] | null; client_message_id: string | null; metadata: Record<string, unknown> | null; created_at: string };

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Heather conversation storage is not configured.");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function listPersonalConversations(ownerId: string): Promise<Conversation[]> {
  const client = serviceClient();
  const { data, error } = await client.from("conversations").select("id,title,created_at,updated_at,archived,last_message_at,execution_mode,execution_mode_updated_at").eq("owner_id", ownerId).eq("conversation_type", "general").eq("archived", false).order("last_message_at", { ascending: false }).limit(100);
  if (error) throw error;
  const rows = (data || []) as ConversationRow[];
  if (!rows.length) return [];
  const { data: messages, error: messageError } = await client.from("conversation_messages").select("id,conversation_id,role,content,source,status,client_message_id,metadata,created_at").in("conversation_id", rows.map((row) => row.id)).order("created_at", { ascending: true });
  if (messageError) throw messageError;
  const grouped = new Map<string, ConversationMessage[]>();
  for (const message of (messages || []) as MessageRow[]) {
    const list = grouped.get(message.conversation_id) || [];
    list.push(toMessage(message));
    grouped.set(message.conversation_id, list);
  }
  return rows.map((row) => ({ id: row.id, title: row.title, createdAt: row.created_at, updatedAt: row.updated_at, lastMessageAt: row.last_message_at, archived: row.archived, conversationType: "general", executionMode: executionModeForStoredValue(row.execution_mode), executionModeUpdatedAt: row.execution_mode_updated_at || undefined, messages: grouped.get(row.id) || [] }));
}

export async function savePersonalConversation(ownerId: string, conversation: Conversation): Promise<Conversation> {
  const client = serviceClient();
  let id = isUuid(conversation.id) ? conversation.id : null;
  if (id) {
    const { data, error } = await client.from("conversations").select("id").eq("id", id).eq("owner_id", ownerId).eq("conversation_type", "general").maybeSingle();
    if (error || !data) throw new Error("Conversation was not found.");
  } else {
    const { data, error } = await client.from("conversations").insert({ owner_id: ownerId, conversation_type: "general", title: cleanTitle(conversation.title), execution_mode: executionModeForStoredValue(conversation.executionMode), archived: false, metadata: { source: "personal_chat" } }).select("id").single();
    if (error || !data) throw error || new Error("Could not create conversation.");
    id = String(data.id);
  }
  const { data: existing, error: existingError } = await client.from("conversation_messages").select("client_message_id").eq("conversation_id", id).not("client_message_id", "is", null);
  if (existingError) throw existingError;
  const known = new Set((existing || []).map((row) => String(row.client_message_id)));
  const messages = conversation.messages.filter((message) => !known.has(message.id)).slice(-120);
  if (messages.length) {
    const { error } = await client.from("conversation_messages").insert(messages.map((message) => ({ conversation_id: id, role: message.role, content: message.content.trim().slice(0, 12000), source: message.source || "text", status: message.status || "completed", client_message_id: message.id, metadata: messageMetadata(message), created_at: message.createdAt })));
    if (error) throw error;
  }
  const updatedAt = new Date().toISOString();
  const { error: updateError } = await client.from("conversations").update({ title: cleanTitle(conversation.title), execution_mode: executionModeForStoredValue(conversation.executionMode), execution_mode_updated_at: conversation.executionModeUpdatedAt || updatedAt, last_message_at: updatedAt }).eq("id", id).eq("owner_id", ownerId);
  if (updateError) throw updateError;
  return { ...conversation, id, conversationType: "general", executionMode: executionModeForStoredValue(conversation.executionMode), updatedAt, lastMessageAt: updatedAt };
}

export async function getPersonalConversationExecutionMode(ownerId: string, id: string): Promise<ChatExecutionMode | null> {
  if (!isUuid(id)) return null;
  const { data, error } = await serviceClient().from("conversations").select("execution_mode").eq("id", id).eq("owner_id", ownerId).eq("conversation_type", "general").eq("archived", false).maybeSingle();
  if (error) throw error;
  return data ? executionModeForStoredValue(data.execution_mode) : null;
}

export async function updatePersonalConversationExecutionMode(ownerId: string, id: string, executionMode: ChatExecutionMode) {
  if (!isUuid(id)) throw new Error("Conversation was not found.");
  const mode = parseChatExecutionMode(executionMode);
  if (!mode) throw new Error("Invalid execution mode.");
  const { data, error } = await serviceClient().from("conversations").update({ execution_mode: mode, execution_mode_updated_at: new Date().toISOString() }).eq("id", id).eq("owner_id", ownerId).eq("conversation_type", "general").select("id").maybeSingle();
  if (error || !data) throw error || new Error("Conversation was not found.");
}

export async function archivePersonalConversation(ownerId: string, id: string) {
  if (!isUuid(id)) return;
  const { error } = await serviceClient().from("conversations").update({ archived: true }).eq("id", id).eq("owner_id", ownerId).eq("conversation_type", "general");
  if (error) throw error;
}

function toMessage(row: MessageRow): ConversationMessage { const metadata = row.metadata || {}; const requestedExecutionMode = parseChatExecutionMode(metadata.requested_execution_mode); const actualExecutionMode = parseChatExecutionMode(metadata.actual_execution_mode); return { id: row.client_message_id || row.id, role: row.role, content: row.content, createdAt: row.created_at, source: row.source === "voice" ? "voice" : "text", status: row.status || "completed", provider: typeof metadata.provider === "string" ? metadata.provider : undefined, model: typeof metadata.model === "string" ? metadata.model : undefined, execution: requestedExecutionMode && actualExecutionMode && metadata.chat_type === "general" ? { requestedExecutionMode, actualExecutionMode, chatType: "general", localEngineUsed: metadata.local_engine_used === true, externalLlmUsed: metadata.external_llm_used === true, errorCode: typeof metadata.error_code === "string" ? metadata.error_code : undefined, durationMs: typeof metadata.duration_ms === "number" ? metadata.duration_ms : undefined, searchUsed: metadata.search_used === true } : undefined }; }
function messageMetadata(message: ConversationMessage) { return { provider: message.provider || null, model: message.model || null, requested_execution_mode: message.execution?.requestedExecutionMode || null, actual_execution_mode: message.execution?.actualExecutionMode || null, chat_type: message.execution?.chatType || null, local_engine_used: message.execution?.localEngineUsed || false, external_llm_used: message.execution?.externalLlmUsed || false, error_code: message.execution?.errorCode || null, duration_ms: message.execution?.durationMs || null, search_used: message.execution?.searchUsed || false }; }
function cleanTitle(value: string) { return value.trim().slice(0, 120) || "새 대화"; }
function isUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
