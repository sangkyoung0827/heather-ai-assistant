import { createClient } from "@supabase/supabase-js";
import type { Conversation, ConversationMessage } from "@heather/core";

type ConversationRow = { id: string; title: string; created_at: string; updated_at: string; archived: boolean; last_message_at: string };
type MessageRow = { id: string; conversation_id: string; role: ConversationMessage["role"]; content: string; source: string | null; status: ConversationMessage["status"] | null; client_message_id: string | null; metadata: Record<string, unknown> | null; created_at: string };

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Heather conversation storage is not configured.");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function listPersonalConversations(ownerId: string): Promise<Conversation[]> {
  const client = serviceClient();
  const { data, error } = await client.from("conversations").select("id,title,created_at,updated_at,archived,last_message_at").eq("owner_id", ownerId).eq("conversation_type", "general").eq("archived", false).order("last_message_at", { ascending: false }).limit(100);
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
  return rows.map((row) => ({ id: row.id, title: row.title, createdAt: row.created_at, updatedAt: row.updated_at, lastMessageAt: row.last_message_at, archived: row.archived, conversationType: "general", messages: grouped.get(row.id) || [] }));
}

export async function savePersonalConversation(ownerId: string, conversation: Conversation): Promise<Conversation> {
  const client = serviceClient();
  let id = isUuid(conversation.id) ? conversation.id : null;
  if (id) {
    const { data, error } = await client.from("conversations").select("id").eq("id", id).eq("owner_id", ownerId).eq("conversation_type", "general").maybeSingle();
    if (error || !data) throw new Error("Conversation was not found.");
  } else {
    const { data, error } = await client.from("conversations").insert({ owner_id: ownerId, conversation_type: "general", title: cleanTitle(conversation.title), archived: false, metadata: { source: "personal_chat" } }).select("id").single();
    if (error || !data) throw error || new Error("Could not create conversation.");
    id = String(data.id);
  }
  const { data: existing, error: existingError } = await client.from("conversation_messages").select("client_message_id").eq("conversation_id", id).not("client_message_id", "is", null);
  if (existingError) throw existingError;
  const known = new Set((existing || []).map((row) => String(row.client_message_id)));
  const messages = conversation.messages.filter((message) => !known.has(message.id)).slice(-120);
  if (messages.length) {
    const { error } = await client.from("conversation_messages").insert(messages.map((message) => ({ conversation_id: id, role: message.role, content: message.content.trim().slice(0, 12000), source: message.source || "text", status: message.status || "completed", client_message_id: message.id, metadata: { provider: message.provider, model: message.model }, created_at: message.createdAt })));
    if (error) throw error;
  }
  const updatedAt = new Date().toISOString();
  const { error: updateError } = await client.from("conversations").update({ title: cleanTitle(conversation.title), last_message_at: updatedAt }).eq("id", id).eq("owner_id", ownerId);
  if (updateError) throw updateError;
  return { ...conversation, id, conversationType: "general", updatedAt, lastMessageAt: updatedAt };
}

export async function archivePersonalConversation(ownerId: string, id: string) {
  if (!isUuid(id)) return;
  const { error } = await serviceClient().from("conversations").update({ archived: true }).eq("id", id).eq("owner_id", ownerId).eq("conversation_type", "general");
  if (error) throw error;
}

function toMessage(row: MessageRow): ConversationMessage { const metadata = row.metadata || {}; return { id: row.client_message_id || row.id, role: row.role, content: row.content, createdAt: row.created_at, source: row.source === "voice" ? "voice" : "text", status: row.status || "completed", provider: typeof metadata.provider === "string" ? metadata.provider : undefined, model: typeof metadata.model === "string" ? metadata.model : undefined }; }
function cleanTitle(value: string) { return value.trim().slice(0, 120) || "새 대화"; }
function isUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
