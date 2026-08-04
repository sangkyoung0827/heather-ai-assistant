from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: str, old: str, new: str) -> None:
    target = ROOT / path
    text = target.read_text(encoding="utf-8")
    if new in text:
        return
    if old not in text:
        raise RuntimeError(f"Expected persistence patch target was not found in {path}")
    target.write_text(text.replace(old, new, 1), encoding="utf-8")


replace_once(
    "apps/web/lib/conversations/repository.ts",
    '''  constructor() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Heather conversation storage is not configured.");
    this.client = createClient(url, key, { auth: { persistSession: false } });
  }''',
    '''  constructor(client?: SupabaseClient) {
    if (client) {
      this.client = client;
      return;
    }
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Heather conversation storage is not configured.");
    this.client = createClient(url, key, { auth: { persistSession: false } });
  }'''
)
replace_once(
    "apps/web/lib/conversations/repository.ts",
    '''  async list(type: ConversationType, options: { limit?: number; cursor?: string; search?: string } = {}) {''',
    '''  async list(type: ConversationType, options: { limit?: number; cursor?: string; search?: string; ownerId?: string } = {}) {'''
)
replace_once(
    "apps/web/lib/conversations/repository.ts",
    '''      .order("id", { ascending: false })
      .limit(limit + 1);
    if (options.search?.trim()) query = query.ilike("title", `%${escapeLike(options.search.trim())}%`);''',
    '''      .order("id", { ascending: false })
      .limit(limit + 1);
    if (options.ownerId) query = query.eq("owner_id", options.ownerId);
    if (options.search?.trim()) query = query.ilike("title", `%${escapeLike(options.search.trim())}%`);'''
)
replace_once(
    "apps/web/lib/conversations/repository.ts",
    '''  async get(id: string, type: ConversationType): Promise<ConversationListItem | null> {
    const { data, error } = await this.client
      .from("conversations")
      .select("id, conversation_type, title, summary, archived, execution_mode, execution_mode_updated_at, created_at, updated_at, last_message_at, metadata")
      .eq("id", id)
      .eq("conversation_type", type)
      .maybeSingle();
    if (error) throw error;
    return data ? toConversationListItem(data as ConversationRow, (await this.getPreviews([id])).get(id) || "") : null;
  }''',
    '''  async get(id: string, type: ConversationType, ownerId?: string): Promise<ConversationListItem | null> {
    let query = this.client
      .from("conversations")
      .select("id, conversation_type, title, summary, archived, execution_mode, execution_mode_updated_at, created_at, updated_at, last_message_at, metadata")
      .eq("id", id)
      .eq("conversation_type", type);
    if (ownerId) query = query.eq("owner_id", ownerId);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return data ? toConversationListItem(data as ConversationRow, (await this.getPreviews([id])).get(id) || "") : null;
  }'''
)
replace_once(
    "apps/web/lib/conversations/repository.ts",
    '''  async listMessages(id: string, type: ConversationType, options: { limit?: number; before?: string } = {}) {
    await this.requireConversation(id, type);''',
    '''  async listMessages(id: string, type: ConversationType, options: { limit?: number; before?: string; ownerId?: string } = {}) {
    await this.requireConversation(id, type, options.ownerId);'''
)

replace_once(
    "apps/web/lib/personal-conversation-server.ts",
    '''import { createClient } from "@supabase/supabase-js";''',
    '''import { createClient, type SupabaseClient } from "@supabase/supabase-js";'''
)
replace_once(
    "apps/web/lib/personal-conversation-server.ts",
    '''function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Heather conversation storage is not configured.");
  return createClient(url, key, { auth: { persistSession: false } });
}''',
    '''function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Heather conversation storage is not configured.");
  return createClient(url, key, { auth: { persistSession: false } });
}

function conversationClient(client?: SupabaseClient) {
  return client || serviceClient();
}'''
)
replace_once(
    "apps/web/lib/personal-conversation-server.ts",
    '''export async function listPersonalConversations(ownerId: string): Promise<Conversation[]> {
  const client = serviceClient();''',
    '''export async function listPersonalConversations(ownerId: string, authenticatedClient?: SupabaseClient): Promise<Conversation[]> {
  const client = conversationClient(authenticatedClient);'''
)
replace_once(
    "apps/web/lib/personal-conversation-server.ts",
    '''export async function savePersonalConversation(ownerId: string, conversation: Conversation): Promise<Conversation> {
  const client = serviceClient();''',
    '''export async function savePersonalConversation(ownerId: string, conversation: Conversation, authenticatedClient?: SupabaseClient): Promise<Conversation> {
  const client = conversationClient(authenticatedClient);'''
)
replace_once(
    "apps/web/lib/personal-conversation-server.ts",
    '''export async function getPersonalConversationExecutionMode(ownerId: string, id: string): Promise<ChatExecutionMode | null> {
  if (!isUuid(id)) return null;
  const { data, error } = await serviceClient().from("conversations")''',
    '''export async function getPersonalConversationExecutionMode(ownerId: string, id: string, authenticatedClient?: SupabaseClient): Promise<ChatExecutionMode | null> {
  if (!isUuid(id)) return null;
  const { data, error } = await conversationClient(authenticatedClient).from("conversations")'''
)
replace_once(
    "apps/web/lib/personal-conversation-server.ts",
    '''export async function updatePersonalConversationExecutionMode(ownerId: string, id: string, executionMode: ChatExecutionMode) {''',
    '''export async function updatePersonalConversationExecutionMode(ownerId: string, id: string, executionMode: ChatExecutionMode, authenticatedClient?: SupabaseClient) {'''
)
replace_once(
    "apps/web/lib/personal-conversation-server.ts",
    '''  const { data, error } = await serviceClient().from("conversations").update({ execution_mode: mode, execution_mode_updated_at: new Date().toISOString() })''',
    '''  const { data, error } = await conversationClient(authenticatedClient).from("conversations").update({ execution_mode: mode, execution_mode_updated_at: new Date().toISOString() })'''
)
replace_once(
    "apps/web/lib/personal-conversation-server.ts",
    '''export async function archivePersonalConversation(ownerId: string, id: string) {
  if (!isUuid(id)) return;
  const { error } = await serviceClient().from("conversations")''',
    '''export async function archivePersonalConversation(ownerId: string, id: string, authenticatedClient?: SupabaseClient) {
  if (!isUuid(id)) return;
  const { error } = await conversationClient(authenticatedClient).from("conversations")'''
)

replace_once(
    "apps/web/app/api/personal-conversations/route.ts",
    '''return NextResponse.json({ conversations: await listPersonalConversations(context.user.id) });''',
    '''return NextResponse.json({ conversations: await listPersonalConversations(context.user.id, context.client) });'''
)
replace_once(
    "apps/web/app/api/personal-conversations/route.ts",
    '''return NextResponse.json({ conversation: await savePersonalConversation(context.user.id, body.conversation) });''',
    '''return NextResponse.json({ conversation: await savePersonalConversation(context.user.id, body.conversation, context.client) });'''
)
replace_once(
    "apps/web/app/api/personal-conversations/route.ts",
    '''await updatePersonalConversationExecutionMode(context.user.id, body.id, executionMode);''',
    '''await updatePersonalConversationExecutionMode(context.user.id, body.id, executionMode, context.client);'''
)
replace_once(
    "apps/web/app/api/personal-conversations/route.ts",
    '''await archivePersonalConversation(context.user.id, body.id);''',
    '''await archivePersonalConversation(context.user.id, body.id, context.client);'''
)

replace_once(
    "apps/web/app/api/conversations/route.ts",
    '''import type { ConversationType } from "../../../lib/conversations/types";''',
    '''import type { ConversationType } from "../../../lib/conversations/types";
import { requireContextUser } from "../../../lib/context-control/server";'''
)
replace_once(
    "apps/web/app/api/conversations/route.ts",
    '''    const page = await new ConversationRepository().list(type, {''',
    '''    const context = await requireContextUser(request);
    const page = await new ConversationRepository(context.client).list(type, {'''
)
replace_once(
    "apps/web/app/api/conversations/route.ts",
    '''      search: url.searchParams.get("search") || undefined
    });''',
    '''      search: url.searchParams.get("search") || undefined,
      ownerId: context.user.id
    });'''
)
replace_once(
    "apps/web/app/api/conversations/[id]/route.ts",
    '''    const conversation = await new ConversationRepository().get(params.id, type);''',
    '''    const context = await requireContextUser(request);
    const conversation = await new ConversationRepository(context.client).get(params.id, type, context.user.id);'''
)
replace_once(
    "apps/web/app/api/conversations/[id]/route.ts",
    '''    const context = executionMode ? await requireContextUser(request) : null;
    const conversation = await new ConversationRepository().update(params.id, type, { title: body.title, archived: body.archived, executionMode: executionMode || undefined, ownerId: context?.user.id });''',
    '''    const context = await requireContextUser(request);
    const conversation = await new ConversationRepository(context.client).update(params.id, type, { title: body.title, archived: body.archived, executionMode: executionMode || undefined, ownerId: context.user.id });'''
)
replace_once(
    "apps/web/app/api/conversations/[id]/route.ts",
    '''    await new ConversationRepository().update(params.id, type, { archived: true });''',
    '''    const context = await requireContextUser(request);
    await new ConversationRepository(context.client).update(params.id, type, { archived: true, ownerId: context.user.id });'''
)
replace_once(
    "apps/web/app/api/conversations/[id]/messages/route.ts",
    '''import type { ConversationType } from "../../../../../lib/conversations/types";''',
    '''import type { ConversationType } from "../../../../../lib/conversations/types";
import { requireContextUser } from "../../../../../lib/context-control/server";'''
)
replace_once(
    "apps/web/app/api/conversations/[id]/messages/route.ts",
    '''    return NextResponse.json(await new ConversationRepository().listMessages(params.id, type, { limit: Number(url.searchParams.get("limit") || 40), before: url.searchParams.get("before") || undefined }));''',
    '''    const context = await requireContextUser(request);
    return NextResponse.json(await new ConversationRepository(context.client).listMessages(params.id, type, { limit: Number(url.searchParams.get("limit") || 40), before: url.searchParams.get("before") || undefined, ownerId: context.user.id }));'''
)

replace_once(
    "apps/web/app/api/research/local-turn/route.ts",
    '''    const conversations = new ConversationRepository();''',
    '''    const conversations = new ConversationRepository(context.client);'''
)
replace_once(
    "apps/web/app/api/research/local-turn/route.ts",
    '''          clientMessageId
        })''',
    '''          clientMessageId,
          ownerId: context.user.id
        })'''
)
replace_once(
    "apps/web/app/api/research/local-turn/route.ts",
    '''          ownerId: payload.conversationId ? undefined : context.user.id''',
    '''          ownerId: context.user.id'''
)
replace_once(
    "apps/web/app/api/research/chat/route.ts",
    '''    const conversations = new ConversationRepository();
    const requestedExecutionMode = resolveRequestedExecutionMode(payload.executionMode);
    const user = await requireContextUser(request);''',
    '''    const user = await requireContextUser(request);
    const conversations = new ConversationRepository(user.client);
    const requestedExecutionMode = resolveRequestedExecutionMode(payload.executionMode);'''
)
replace_once(
    "apps/web/app/api/research/chat/route.ts",
    '''? await conversations.getStoredTurn({ conversationId: payload.conversationId, type: "research", clientMessageId })''',
    '''? await conversations.getStoredTurn({ conversationId: payload.conversationId, type: "research", clientMessageId, ownerId: user.user.id })'''
)
replace_once(
    "apps/web/app/api/research/chat/route.ts",
    '''ownerId: payload.conversationId ? undefined : user.user.id''',
    '''ownerId: user.user.id'''
)

replace_once(
    "apps/web/app/api/conversations/media/route.ts",
    '''import { parseChatExecutionMode } from "../../../../lib/chat/execution-mode";''',
    '''import { parseChatExecutionMode } from "../../../../lib/chat/execution-mode";
import { requireContextUser } from "../../../../lib/context-control/server";'''
)
replace_once(
    "apps/web/app/api/conversations/media/route.ts",
    '''    const repository = new ConversationRepository();
    await repository.ensureMediaBucket();''',
    '''    const context = await requireContextUser(request);
    const repository = new ConversationRepository(context.client);
    await repository.ensureMediaBucket();'''
)
replace_once(
    "apps/web/app/api/conversations/media/route.ts",
    '''      executionMode: executionMode || undefined,
      allowEmpty: true''',
    '''      executionMode: executionMode || undefined,
      ownerId: context.user.id,
      allowEmpty: true'''
)

print("Authenticated conversation persistence patch applied.")
