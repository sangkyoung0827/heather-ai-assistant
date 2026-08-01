import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ChatExecutionMode, Conversation, ConversationMessage, MessageAttachment } from "@heather/core";
import type { ConversationListItem, ConversationType, StoredMessageStatus } from "./types";
import { executionModeForStoredValue, parseChatExecutionMode } from "../chat/execution-mode";

const MAX_MESSAGE_LENGTH = 12_000;
const MAX_TITLE_LENGTH = 120;
const MAX_METADATA_BYTES = 4_000;

type ConversationRow = Record<string, unknown>;
type MessageRow = Record<string, unknown>;

export type AttachmentInput = Omit<MessageAttachment, "url">;

export class ConversationRepository {
  private readonly client: SupabaseClient;

  constructor() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Heather conversation storage is not configured.");
    this.client = createClient(url, key, { auth: { persistSession: false } });
  }

  async list(type: ConversationType, options: { limit?: number; cursor?: string; search?: string } = {}) {
    const limit = clampLimit(options.limit, 25, 50);
    let query = this.client
      .from("conversations")
      .select("id, conversation_type, title, summary, archived, execution_mode, execution_mode_updated_at, created_at, updated_at, last_message_at, metadata")
      .eq("conversation_type", type)
      .eq("archived", false)
      .order("last_message_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);
    if (options.search?.trim()) query = query.ilike("title", `%${escapeLike(options.search.trim())}%`);
    if (options.cursor) query = query.lt("last_message_at", options.cursor);
    const { data, error } = await query;
    if (error) throw error;
    const rows = (data || []) as ConversationRow[];
    const page = rows.slice(0, limit);
    const ids = page.map((row) => String(row.id));
    const previews = await this.getPreviews(ids);
    return {
      conversations: page.map((row) => toConversationListItem(row, previews.get(String(row.id)) || "")),
      nextCursor: rows.length > limit ? String(page.at(-1)?.last_message_at || "") : null
    };
  }

  async get(id: string, type: ConversationType): Promise<ConversationListItem | null> {
    const { data, error } = await this.client
      .from("conversations")
      .select("id, conversation_type, title, summary, archived, execution_mode, execution_mode_updated_at, created_at, updated_at, last_message_at, metadata")
      .eq("id", id)
      .eq("conversation_type", type)
      .maybeSingle();
    if (error) throw error;
    return data ? toConversationListItem(data as ConversationRow, (await this.getPreviews([id])).get(id) || "") : null;
  }

  async listMessages(id: string, type: ConversationType, options: { limit?: number; before?: string } = {}) {
    await this.requireConversation(id, type);
    const limit = clampLimit(options.limit, 40, 60);
    let query = this.client
      .from("conversation_messages")
      .select("id, conversation_id, role, content, source, status, client_message_id, metadata, created_at")
      .eq("conversation_id", id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);
    if (options.before) query = query.lt("created_at", options.before);
    const { data, error } = await query;
    if (error) throw error;
    const rows = (data || []) as MessageRow[];
    const pageRows = rows.slice(0, limit).reverse();
    const attachments = await this.getAttachments(pageRows);
    const page = pageRows.map((row) => toConversationMessage(row, attachments.get(String(row.id)) || []));
    return { messages: page, nextCursor: rows.length > limit ? String(rows[limit - 1]?.created_at || "") : null };
  }

  async beginMessage(input: { conversationId?: string; type: ConversationType; title: string; content: string; clientMessageId: string; executionMode?: ChatExecutionMode; ownerId?: string; allowEmpty?: boolean }) {
    const content = validateContent(input.content, input.allowEmpty);
    const clientMessageId = validateClientMessageId(input.clientMessageId);
    const conversation = input.conversationId
      ? await this.requireConversation(input.conversationId, input.type, input.ownerId)
      : await this.create(input.type, input.title, input.executionMode, input.ownerId);
    const { data: existing, error: existingError } = await this.client
      .from("conversation_messages")
      .select("id, conversation_id, role, content, source, status, client_message_id, metadata, created_at")
      .eq("conversation_id", String(conversation.id))
      .eq("client_message_id", clientMessageId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) return { conversation: toConversationListItem(conversation, ""), userMessage: toConversationMessage(existing as MessageRow), duplicate: true };
    const { data, error } = await this.client
      .from("conversation_messages")
      .insert({ conversation_id: String(conversation.id), role: "user", content, status: "completed", client_message_id: clientMessageId, metadata: {} })
      .select("id, conversation_id, role, content, source, status, client_message_id, metadata, created_at")
      .single();
    if (error) throw error;
    const now = new Date().toISOString();
    const { error: updateError } = await this.client
      .from("conversations")
      .update({ last_message_at: now })
      .eq("id", String(conversation.id));
    if (updateError) throw updateError;
    return { conversation: toConversationListItem({ ...conversation, last_message_at: now }, content), userMessage: toConversationMessage(data as MessageRow), duplicate: false };
  }

  async findCompletedAssistant(conversationId: string, clientMessageId: string) {
    const { data, error } = await this.client
      .from("conversation_messages")
      .select("id, conversation_id, role, content, source, status, client_message_id, metadata, created_at")
      .eq("conversation_id", conversationId)
      .eq("role", "assistant")
      .contains("metadata", { reply_to: clientMessageId })
      .eq("status", "completed")
      .maybeSingle();
    if (error) throw error;
    return data ? toConversationMessage(data as MessageRow) : null;
  }

  async findUserMessage(conversationId: string, clientMessageId: string) {
    const { data, error } = await this.client
      .from("conversation_messages")
      .select("id, conversation_id, role, content, source, status, client_message_id, metadata, created_at")
      .eq("conversation_id", conversationId)
      .eq("role", "user")
      .eq("client_message_id", clientMessageId)
      .maybeSingle();
    if (error) throw error;
    return data ? toConversationMessage(data as MessageRow) : null;
  }

  async getStoredTurn(input: { conversationId: string; type: ConversationType; clientMessageId: string; ownerId?: string }) {
    const conversation = await this.requireConversation(input.conversationId, input.type, input.ownerId);
    const userMessage = await this.findUserMessage(input.conversationId, input.clientMessageId);
    if (!userMessage) throw new Error("The saved media message was not found.");
    return { conversation: toConversationListItem(conversation, ""), userMessage, duplicate: false };
  }

  async createAttachments(messageId: string, attachments: AttachmentInput[]) {
    if (!attachments.length) return [];
    const { data, error: readError } = await this.client.from("conversation_messages").select("metadata").eq("id", messageId).single();
    if (readError) throw readError;
    const metadata = data?.metadata && typeof data.metadata === "object" ? data.metadata as Record<string, unknown> : {};
    const safeAttachments = attachments.map(({ id, type, storagePath, mimeType, sizeBytes, width, height, status }) => ({ id, type, storagePath, mimeType, sizeBytes, width, height, status }));
    const { error } = await this.client.from("conversation_messages").update({ metadata: { ...metadata, attachments: safeAttachments } }).eq("id", messageId);
    if (error) throw error;
    return attachments;
  }

  async deleteMessage(messageId: string) {
    const { error } = await this.client.from("conversation_messages").delete().eq("id", messageId);
    if (error) throw error;
  }

  storage() {
    return this.client.storage.from("chat-media");
  }

  async ensureMediaBucket() {
    const { data, error } = await this.client.storage.getBucket("chat-media");
    if (!data) {
      const created = await this.client.storage.createBucket("chat-media", {
        public: false,
        fileSizeLimit: 10 * 1024 * 1024,
        allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"]
      });
      if (created.error && !/already exists/i.test(created.error.message)) throw created.error;
      return;
    }
    if (error) throw error;
    if (data.public) {
      const updated = await this.client.storage.updateBucket("chat-media", {
        public: false,
        fileSizeLimit: 10 * 1024 * 1024,
        allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"]
      });
      if (updated.error) throw updated.error;
    }
  }

  async appendAssistant(input: { conversationId: string; content: string; source: string; status?: StoredMessageStatus; replyTo: string; metadata?: Record<string, unknown> }) {
    const metadata = { ...(input.metadata || {}), reply_to: input.replyTo };
    if (JSON.stringify(metadata).length > MAX_METADATA_BYTES) throw new Error("Message metadata is too large.");
    const { data, error } = await this.client
      .from("conversation_messages")
      .insert({ conversation_id: input.conversationId, role: "assistant", content: validateContent(input.content), source: input.source.slice(0, 80), status: input.status || "completed", metadata })
      .select("id, conversation_id, role, content, source, status, client_message_id, metadata, created_at")
      .single();
    if (error) throw error;
    const now = new Date().toISOString();
    const { error: updateError } = await this.client.from("conversations").update({ last_message_at: now }).eq("id", input.conversationId);
    if (updateError) throw updateError;
    return toConversationMessage(data as MessageRow);
  }

  async update(id: string, type: ConversationType, input: { title?: string; archived?: boolean; executionMode?: ChatExecutionMode; ownerId?: string }) {
    await this.requireConversation(id, type, input.ownerId);
    const update: Record<string, unknown> = {};
    if (typeof input.title === "string") update.title = validateTitle(input.title, type);
    if (typeof input.archived === "boolean") update.archived = input.archived;
    if (input.executionMode) update.execution_mode = requireExecutionMode(input.executionMode);
    if (input.executionMode) update.execution_mode_updated_at = new Date().toISOString();
    let query = this.client.from("conversations").update(update).eq("id", id).eq("conversation_type", type);
    if (input.ownerId) query = query.eq("owner_id", input.ownerId);
    const { data, error } = await query.select("id, conversation_type, title, summary, archived, execution_mode, execution_mode_updated_at, created_at, updated_at, last_message_at, metadata").single();
    if (error) throw error;
    return toConversationListItem(data as ConversationRow, "");
  }

  private async create(type: ConversationType, title: string, executionMode?: ChatExecutionMode, ownerId?: string) {
    const { data, error } = await this.client
      .from("conversations")
      .insert({ conversation_type: type, title: validateTitle(title, type), execution_mode: executionMode ? requireExecutionMode(executionMode) : "ADVANCED_REASONING", owner_id: ownerId, metadata: {} })
      .select("id, conversation_type, title, summary, archived, execution_mode, execution_mode_updated_at, created_at, updated_at, last_message_at, metadata")
      .single();
    if (error) throw error;
    return data as ConversationRow;
  }

  private async requireConversation(id: string, type: ConversationType, ownerId?: string) {
    if (!isUuid(id)) throw new Error("Conversation was not found.");
    let query = this.client
      .from("conversations")
      .select("id, conversation_type, title, summary, archived, execution_mode, execution_mode_updated_at, owner_id, created_at, updated_at, last_message_at, metadata")
      .eq("id", id)
      .eq("conversation_type", type)
      .eq("archived", false);
    if (ownerId) query = query.eq("owner_id", ownerId);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Conversation was not found.");
    return data as ConversationRow;
  }

  private async getPreviews(ids: string[]) {
    const previews = new Map<string, string>();
    if (!ids.length) return previews;
    const { data, error } = await this.client
      .from("conversation_messages")
      .select("conversation_id, content, created_at")
      .in("conversation_id", ids)
      .order("created_at", { ascending: false });
    if (error) throw error;
    for (const row of (data || []) as MessageRow[]) {
      const id = String(row.conversation_id);
      if (!previews.has(id)) previews.set(id, String(row.content || ""));
    }
    return previews;
  }

  private async getAttachments(messageRows: MessageRow[]) {
    const attachments = new Map<string, MessageAttachment[]>();
    for (const row of messageRows) {
      const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {};
      const rawAttachments = Array.isArray(metadata.attachments) ? metadata.attachments : [];
      const hydrated: MessageAttachment[] = [];
      for (const raw of rawAttachments) {
        if (!raw || typeof raw !== "object") continue;
        const item = raw as Record<string, unknown>;
        const storagePath = typeof item.storagePath === "string" ? item.storagePath : "";
        const mimeType = typeof item.mimeType === "string" ? item.mimeType : "";
        if (!storagePath || !mimeType || item.status !== "ready") continue;
        const signed = await this.client.storage.from("chat-media").createSignedUrl(storagePath, 60 * 30);
        hydrated.push({ id: String(item.id), type: "image", storagePath, mimeType, sizeBytes: Number(item.sizeBytes || 0), width: numberOrUndefined(item.width), height: numberOrUndefined(item.height), status: "ready", url: signed.data?.signedUrl });
      }
      if (hydrated.length) attachments.set(String(row.id), hydrated);
    }
    return attachments;
  }
}

export function createConversationTitle(message: string, type: ConversationType) {
  const compact = message.replace(/[`*_#>[\]]/g, "").replace(/\s+/g, " ").trim();
  if (!compact) return type === "research" ? "새 연구 대화" : "새 대화";
  return compact.length > 48 ? `${compact.slice(0, 47)}…` : compact;
}

function toConversationListItem(row: ConversationRow, preview: string): ConversationListItem {
  return { id: String(row.id), title: String(row.title), messages: [], createdAt: String(row.created_at), updatedAt: String(row.updated_at), archived: Boolean(row.archived), conversationType: row.conversation_type === "research" ? "research" : "general", lastMessageAt: String(row.last_message_at), executionMode: executionModeForStoredValue(row.execution_mode), executionModeUpdatedAt: typeof row.execution_mode_updated_at === "string" ? row.execution_mode_updated_at : undefined, preview };
}

function toConversationMessage(row: MessageRow, attachments: MessageAttachment[] = []): ConversationMessage {
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {};
  const requestedExecutionMode = parseChatExecutionMode(metadata.requested_execution_mode);
  const actualExecutionMode = parseChatExecutionMode(metadata.actual_execution_mode);
  return { id: String(row.id), role: row.role as ConversationMessage["role"], content: String(row.content), createdAt: String(row.created_at), status: row.status as StoredMessageStatus, source: row.source === "voice" ? "voice" : "text", provider: typeof metadata.provider === "string" ? metadata.provider : undefined, model: typeof metadata.model === "string" ? metadata.model : undefined, execution: requestedExecutionMode && actualExecutionMode && (metadata.chat_type === "general" || metadata.chat_type === "research") ? { requestedExecutionMode, actualExecutionMode, chatType: metadata.chat_type, localEngineUsed: metadata.local_engine_used === true, externalLlmUsed: metadata.external_llm_used === true, errorCode: typeof metadata.error_code === "string" ? metadata.error_code : undefined, durationMs: typeof metadata.duration_ms === "number" ? metadata.duration_ms : undefined, searchUsed: metadata.search_used === true } : undefined, attachments };
}

function validateTitle(value: string, type: ConversationType) { const title = value.trim() || (type === "research" ? "새 연구 대화" : "새 대화"); if (title.length > MAX_TITLE_LENGTH) return title.slice(0, MAX_TITLE_LENGTH); return title; }
function validateContent(value: string, allowEmpty = false) { const content = value.trim(); if ((!allowEmpty && !content) || content.length > MAX_MESSAGE_LENGTH) throw new Error("Message must be between 1 and 12,000 characters."); return content; }
function validateClientMessageId(value: string) { const id = value.trim(); if (!id || id.length > 160) throw new Error("Invalid client message ID."); return id; }
function clampLimit(value: number | undefined, fallback: number, max: number) { const number = Number(value); return Number.isFinite(number) ? Math.min(Math.max(Math.floor(number), 1), max) : fallback; }
function isUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function escapeLike(value: string) { return value.replace(/[%_]/g, "\\$&"); }
function numberOrUndefined(value: unknown) { const number = Number(value); return Number.isFinite(number) && number > 0 ? number : undefined; }
function requireExecutionMode(value: unknown): ChatExecutionMode { const mode = parseChatExecutionMode(value); if (!mode) throw new Error("Invalid execution mode."); return mode; }
