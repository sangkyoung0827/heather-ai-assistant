from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    content = read(path)
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected exactly one match, found {count}\n--- pattern ---\n{old[:500]}")
    write(path, content.replace(old, new, 1))


# Fail-closed owner matcher is kept pure so it can be tested without Supabase network calls.
write(
    "apps/web/lib/security/heather-owner.ts",
    '''import { createClient, type User } from "@supabase/supabase-js";

export class HeatherOwnerAccessError extends Error {
  constructor(message = "Not found.", readonly status = 404) {
    super(message);
  }
}

export async function getAuthenticatedRequestUser(request: Request): Promise<User | null> {
  return getAuthenticatedUserFromAuthorization(request.headers.get("authorization"));
}

export async function getAuthenticatedUserFromAuthorization(authorization: string | null): Promise<User | null> {
  const token = authorization?.replace(/^Bearer\\s+/i, "").trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !anonKey) return null;

  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  const { data, error } = await client.auth.getUser(token);
  return error || !data.user ? null : data.user;
}

export function isConfiguredHeatherOwner(user: Pick<User, "id" | "email"> | null): boolean {
  if (!user) return false;
  const configuredId = process.env.HEATHER_OWNER_USER_ID?.trim();
  const configuredEmail = process.env.HEATHER_OWNER_EMAIL?.trim().toLocaleLowerCase();
  // Fail closed until at least one exact Supabase identity is configured.
  if (!configuredId && !configuredEmail) return false;
  if (configuredId && user.id !== configuredId) return false;
  if (configuredEmail && user.email?.toLocaleLowerCase() !== configuredEmail) return false;
  return true;
}

export async function getHeatherOwner(request: Request): Promise<User | null> {
  const user = await getAuthenticatedRequestUser(request);
  return isConfiguredHeatherOwner(user) ? user : null;
}

export async function requireHeatherOwner(request: Request): Promise<User> {
  const owner = await getHeatherOwner(request);
  if (!owner) throw new HeatherOwnerAccessError();
  return owner;
}

export function ownerAccessStatus(error: unknown) {
  return error instanceof HeatherOwnerAccessError ? error.status : 400;
}
'''
)

# Personal chat: only the configured owner can resolve or execute Direct Commands.
replace_once(
    "apps/web/app/api/chat/route.ts",
    'import { getPersonalConversationExecutionMode } from "../../../lib/personal-conversation-server";\n',
    'import { getPersonalConversationExecutionMode } from "../../../lib/personal-conversation-server";\nimport { getHeatherOwner } from "../../../lib/security/heather-owner";\n'
)
replace_once(
    "apps/web/app/api/chat/route.ts",
    '''  report?.("direct_command_check", "active", 20, { type: "direct_command" });
  const directCommands = new DirectCommandRepository();
  let directMatch: Awaited<ReturnType<DirectCommandRepository["find"]>> = null;
  try {
    directMatch = await directCommands.find(receivedPayload.message);
  } catch {
    report?.("direct_command_check", "warning", 24, { type: "direct_command" });
  }
  if (directMatch && !personalDocumentRequest && !personalMemoIntent) {''',
    '''  report?.("direct_command_check", "active", 20, { type: "direct_command" });
  const directOwner = await getHeatherOwner(request);
  const directCommands = directOwner ? new DirectCommandRepository(directOwner.id) : null;
  let directMatch: Awaited<ReturnType<DirectCommandRepository["find"]>> = null;
  if (directCommands) {
    try {
      directMatch = await directCommands.find(receivedPayload.message);
    } catch {
      report?.("direct_command_check", "warning", 24, { type: "direct_command" });
    }
  }
  if (directCommands && directMatch && !personalDocumentRequest && !personalMemoIntent) {'''
)

# Research chat: signed-in non-owner accounts never query the owner's command corpus.
replace_once(
    "apps/web/app/api/research/chat/route.ts",
    'import { DEFAULT_CHAT_EXECUTION_MODE, executionModeForStoredValue, isExecutionModeSelectorEnabled, parseChatExecutionMode } from "../../../../lib/chat/execution-mode";\n',
    'import { DEFAULT_CHAT_EXECUTION_MODE, executionModeForStoredValue, isExecutionModeSelectorEnabled, parseChatExecutionMode } from "../../../../lib/chat/execution-mode";\nimport { getHeatherOwner } from "../../../../lib/security/heather-owner";\n'
)
replace_once(
    "apps/web/app/api/research/chat/route.ts",
    '''    emit?.("direct_command_check", "active", { source_type: "direct_command" });
    const directCommands = new DirectCommandRepository();
    const directMatch = await directCommands.find(payload.message);
    emit?.("direct_command_check", "completed", { source_type: "direct_command" });
    if (directMatch) {''',
    '''    emit?.("direct_command_check", "active", { source_type: "direct_command" });
    const directOwner = await getHeatherOwner(request);
    const directCommands = directOwner ? new DirectCommandRepository(directOwner.id) : null;
    const directMatch = directCommands ? await directCommands.find(payload.message) : null;
    emit?.("direct_command_check", "completed", { source_type: "direct_command" });
    if (directCommands && directMatch) {'''
)

# Legacy intent resolver receives the same owner-only protection and preserves auth on fallback.
replace_once(
    "apps/web/app/api/intent/resolve/route.ts",
    'import { runMatchedSkill } from "../../../../lib/skills/agent-runtime";\n',
    'import { runMatchedSkill } from "../../../../lib/skills/agent-runtime";\nimport { getHeatherOwner } from "../../../../lib/security/heather-owner";\n'
)
replace_once(
    "apps/web/app/api/intent/resolve/route.ts",
    '''    const repository = new DirectCommandRepository();
    const match = await repository.find(payload.message);
    if (match) {''',
    '''    const directOwner = await getHeatherOwner(request);
    const repository = directOwner ? new DirectCommandRepository(directOwner.id) : null;
    const match = repository ? await repository.find(payload.message) : null;
    if (repository && match) {'''
)
replace_once(
    "apps/web/app/api/intent/resolve/route.ts",
    '''      await repository.logIntent("fallback", payload.message);''',
    '''      await repository?.logIntent("fallback", payload.message);'''
)
replace_once(
    "apps/web/app/api/intent/resolve/route.ts",
    '''      headers: { "Content-Type": "application/json" },''',
    '''      headers: {
        "Content-Type": "application/json",
        ...(request.headers.get("authorization") ? { Authorization: request.headers.get("authorization")! } : {})
      },'''
)
replace_once(
    "apps/web/app/api/intent/resolve/route.ts",
    '''    await new RepeatedQueryLearningService(repository).recordSuccessfulFallback({ message: payload.message, response: fallback.message, messageId: payload.messageId }).catch(() => undefined);
    await repository.logIntent("fallback", payload.message);''',
    '''    if (repository) {
      await new RepeatedQueryLearningService(repository).recordSuccessfulFallback({ message: payload.message, response: fallback.message, messageId: payload.messageId }).catch(() => undefined);
      await repository.logIntent("fallback", payload.message);
    }'''
)

# Client auth state includes a server-verified owner-only capability flag.
replace_once(
    "apps/web/lib/use-heather-data.ts",
    'import { restoreHeatherSession, syncHeatherSession } from "./auth-session";\n',
    'import { restoreHeatherSession, syncHeatherSession } from "./auth-session";\nimport { canAccessDirectCommands } from "./security/direct-command-client";\n'
)
replace_once(
    "apps/web/lib/use-heather-data.ts",
    '  const [authReady, setAuthReady] = useState(false);\n',
    '  const [authReady, setAuthReady] = useState(false);\n  const [directCommandsAllowed, setDirectCommandsAllowed] = useState(false);\n'
)
replace_once(
    "apps/web/lib/use-heather-data.ts",
    '''      setUser(null);
      setAuthReady(true);''',
    '''      setUser(null);
      setDirectCommandsAllowed(false);
      setAuthReady(true);'''
)
replace_once(
    "apps/web/lib/use-heather-data.ts",
    '''      setUser(restoredUser);
      setAuthReady(true);
      setConversations([]);
      void reloadConversations();
      void reloadMemories(restoredUser);''',
    '''      setUser(restoredUser);
      setDirectCommandsAllowed(false);
      setAuthReady(true);
      setConversations([]);
      void reloadConversations();
      void reloadMemories(restoredUser);
      if (restoredUser) void canAccessDirectCommands().then((allowed) => { if (active) setDirectCommandsAllowed(allowed); }).catch(() => { if (active) setDirectCommandsAllowed(false); });'''
)
replace_once(
    "apps/web/lib/use-heather-data.ts",
    '''    syncHeatherSession(null);
  }, []);''',
    '''    syncHeatherSession(null);
    setDirectCommandsAllowed(false);
  }, []);'''
)
replace_once(
    "apps/web/lib/use-heather-data.ts",
    '    auth: { user, ready: authReady, configured: Boolean(getSupabaseBrowserClient()), signInWithGoogle, signOut },\n',
    '    auth: { user, ready: authReady, configured: Boolean(getSupabaseBrowserClient()), directCommandsAllowed, signInWithGoogle, signOut },\n'
)

# Hide the Direct Command navigation, dashboard metric, and page body from every non-owner.
replace_once(
    "apps/web/components/heather/HeatherWorkspace.tsx",
    '    <GlobalRail active={workspace} onNavigate={navigate} settings={data.settings} />',
    '    <GlobalRail active={workspace} onNavigate={navigate} settings={data.settings} directCommandsAllowed={data.auth.directCommandsAllowed} />'
)
replace_once(
    "apps/web/components/heather/HeatherWorkspace.tsx",
    'function GlobalRail({ active, onNavigate, settings }: { active: WorkspaceId; onNavigate: (path: string) => void; settings: ReturnType<typeof useHeatherData>["settings"] }) {',
    'function GlobalRail({ active, onNavigate, settings, directCommandsAllowed }: { active: WorkspaceId; onNavigate: (path: string) => void; settings: ReturnType<typeof useHeatherData>["settings"]; directCommandsAllowed: boolean }) {'
)
replace_once(
    "apps/web/components/heather/HeatherWorkspace.tsx",
    '{NODES.map((node) => <RailButton key={node.id}',
    '{NODES.filter((node) => node.id !== "direct" || directCommandsAllowed).map((node) => <RailButton key={node.id}'
)
replace_once(
    "apps/web/components/heather/HeatherWorkspace.tsx",
    '<DashboardMetric icon={Command} label={t.direct} value={t.manage} detail={t.directDetail} onClick={() => onNavigate("/direct-commands")} />',
    '{auth.directCommandsAllowed ? <DashboardMetric icon={Command} label={t.direct} value={t.manage} detail={t.directDetail} onClick={() => onNavigate("/direct-commands")} /> : null}'
)
replace_once(
    "apps/web/components/heather/HeatherWorkspace.tsx",
    '''  const researcherMode = pathname.startsWith("/researcher/materials") ? "materials" : pathname.startsWith("/researcher/memory") ? "memory" : pathname.startsWith("/researcher/process") ? "process" : "chat";''',
    '''  const researcherMode = pathname.startsWith("/researcher/materials") ? "materials" : pathname.startsWith("/researcher/memory") ? "memory" : pathname.startsWith("/researcher/process") ? "process" : "chat";
  useEffect(() => {
    if (data.auth.ready && workspace === "direct" && !data.auth.directCommandsAllowed) onNavigate("/dashboard");
  }, [data.auth.directCommandsAllowed, data.auth.ready, onNavigate, workspace]);
  if (workspace === "direct" && !data.auth.directCommandsAllowed) return null;'''
)

# Explicit owner predicates complement RLS for legacy personal/research memory CRUD.
write(
    "apps/web/lib/memory-repository.ts",
    '''import type { MemoryRecord } from "@heather/core";
import { getSupabaseBrowserClient } from "./supabase-client";

export type Team = { id: string; name: string; description: string; role: "owner" | "editor" | "viewer" };
export type ResearchProject = { id: string; teamId: string; name: string; description: string; status: string };

type MemoryTable = "personal_memories" | "research_memories";

export class SupabaseMemoryRepository {
  private client() { const client = getSupabaseBrowserClient(); if (!client) throw new Error("Supabase is not configured."); return client; }

  async listPersonal() {
    const userId = await this.userId();
    const { data, error } = await this.client().from("personal_memories").select("*").eq("user_id", userId).order("updated_at", { ascending: false });
    if (error) throw error;
    return (data || []).map((row) => toMemory(row, "personal"));
  }

  async listPrivateResearch() {
    const userId = await this.userId();
    const { data, error } = await this.client().from("research_memories").select("*").eq("owner_id", userId).eq("scope", "private").order("updated_at", { ascending: false });
    if (error) throw error;
    return (data || []).map((row) => toMemory(row, "research"));
  }

  async listTeamResearch(teamId: string, projectId: string) {
    const { data, error } = await this.client().from("research_memories").select("*").eq("scope", "team").eq("team_id", teamId).eq("project_id", projectId).order("updated_at", { ascending: false });
    if (error) throw error;
    return (data || []).map((row) => toMemory(row, "research"));
  }

  async savePersonal(memory: MemoryRecord) {
    const userId = await this.userId();
    return this.save("personal_memories", memory, "user_id", userId, { user_id: userId, memory_type: memory.type });
  }

  async savePrivateResearch(memory: MemoryRecord) {
    const userId = await this.userId();
    return this.save("research_memories", memory, "owner_id", userId, { owner_id: userId, scope: "private", memory_type: "project_context" });
  }

  async saveTeamResearch(memory: MemoryRecord, teamId: string, projectId: string) {
    const userId = await this.userId();
    return this.save("research_memories", memory, "owner_id", userId, { owner_id: userId, scope: "team", team_id: teamId, project_id: projectId, memory_type: "project_context" });
  }

  async deletePersonal(id: string) {
    const userId = await this.userId();
    const { error } = await this.client().from("personal_memories").delete().eq("id", id).eq("user_id", userId);
    if (error) throw error;
  }

  async deleteResearch(id: string) {
    const userId = await this.userId();
    const { error } = await this.client().from("research_memories").delete().eq("id", id).eq("owner_id", userId);
    if (error) throw error;
  }

  async listTeams(): Promise<Team[]> {
    const { data, error } = await this.client().from("research_team_members").select("role, research_teams(id,name,description)").eq("status", "active");
    if (error) throw error;
    return (data || []).flatMap((row: Record<string, unknown>) => {
      const team = row.research_teams as Record<string, unknown> | null;
      return team ? [{ id: String(team.id), name: String(team.name), description: String(team.description || ""), role: row.role as Team["role"] }] : [];
    });
  }

  async listProjects(teamId: string): Promise<ResearchProject[]> {
    const { data, error } = await this.client().from("research_projects").select("id,team_id,name,description,status").eq("team_id", teamId).order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []).map((row) => ({ id: String(row.id), teamId: String(row.team_id), name: String(row.name), description: String(row.description || ""), status: String(row.status) }));
  }

  async createTeam(name: string, description = "") {
    const userId = await this.userId();
    const { data, error } = await this.client().from("research_teams").insert({ name, description, owner_id: userId }).select("id,name,description").single();
    if (error) throw error;
    return { id: String(data.id), name: String(data.name), description: String(data.description || ""), role: "owner" as const };
  }

  async createProject(teamId: string, name: string, description = "") {
    const userId = await this.userId();
    const { data, error } = await this.client().from("research_projects").insert({ team_id: teamId, name, description, created_by: userId }).select("id,team_id,name,description,status").single();
    if (error) throw error;
    return { id: String(data.id), teamId: String(data.team_id), name: String(data.name), description: String(data.description || ""), status: String(data.status) };
  }

  private async userId() {
    const { data } = await this.client().auth.getUser();
    if (!data.user) throw new Error("Sign in is required.");
    return data.user.id;
  }

  private async save(table: MemoryTable, memory: MemoryRecord, ownerColumn: "user_id" | "owner_id", ownerId: string, owner: Record<string, unknown>) {
    const row = { content: memory.content, title: null, summary: null, tags: memory.tags, metadata: {}, archived: memory.archived, ...owner };
    const isExisting = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(memory.id);
    const query = isExisting
      ? this.client().from(table).update(row).eq("id", memory.id).eq(ownerColumn, ownerId).select("*").single()
      : this.client().from(table).insert(row).select("*").single();
    const { data, error } = await query;
    if (error || !data) throw error || new Error("Memory could not be saved for this account.");
    return toMemory(data, table === "personal_memories" ? "personal" : "research");
  }
}

function toMemory(row: Record<string, unknown>, kind: "personal" | "research"): MemoryRecord {
  return { id: String(row.id), content: String(row.content), created_at: String(row.created_at), updated_at: String(row.updated_at), archived: Boolean(row.archived), confidence: .72, type: String(row.memory_type || (kind === "research" ? "project_context" : "important_fact")) as MemoryRecord["type"], source: kind, tags: Array.isArray(row.tags) ? row.tags.map(String) : [] };
}
'''
)

# Security migration: owner-only Direct Commands and strict account isolation for personal memory.
write(
    "supabase/migrations/014_owner_only_direct_commands_and_memory_isolation.sql",
    '''-- Heather owner-only Direct Commands and personal-memory isolation hardening.
-- Legacy direct-command rows remain invisible (owner_user_id IS NULL) until the
-- configured Heather owner first uses the server, which claims those rows.

alter table if exists public.direct_commands add column if not exists owner_user_id uuid references auth.users(id) on delete cascade;
alter table if exists public.direct_command_triggers add column if not exists owner_user_id uuid references auth.users(id) on delete cascade;
alter table if exists public.query_patterns add column if not exists owner_user_id uuid references auth.users(id) on delete cascade;
alter table if exists public.intent_events add column if not exists owner_user_id uuid references auth.users(id) on delete cascade;

create index if not exists direct_commands_owner_created_idx on public.direct_commands(owner_user_id, created_at desc);
create index if not exists direct_command_triggers_owner_command_idx on public.direct_command_triggers(owner_user_id, command_id);
create index if not exists query_patterns_owner_idx on public.query_patterns(owner_user_id);
create index if not exists intent_events_owner_idx on public.intent_events(owner_user_id);

do $$
declare item record;
begin
  for item in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = 'query_patterns' and c.contype = 'u'
      and pg_get_constraintdef(c.oid) ilike '%normalized_query%'
  loop execute format('alter table public.query_patterns drop constraint %I', item.conname); end loop;
  for item in
    select indexname from pg_indexes
    where schemaname = 'public' and tablename = 'query_patterns'
      and indexdef ilike 'create unique index%' and indexdef ilike '%normalized_query%'
  loop execute format('drop index if exists public.%I', item.indexname); end loop;
end $$;
create unique index if not exists query_patterns_owner_normalized_uidx on public.query_patterns(owner_user_id, normalized_query);

alter table if exists public.direct_commands enable row level security;
alter table if exists public.direct_command_triggers enable row level security;
alter table if exists public.query_patterns enable row level security;
alter table if exists public.intent_events enable row level security;
alter table if exists public.direct_commands force row level security;
alter table if exists public.direct_command_triggers force row level security;
alter table if exists public.query_patterns force row level security;
alter table if exists public.intent_events force row level security;

do $$
declare table_name text; policy_name text;
begin
  foreach table_name in array array['direct_commands','direct_command_triggers','query_patterns','intent_events'] loop
    for policy_name in select policyname from pg_policies where schemaname='public' and tablename=table_name loop
      execute format('drop policy if exists %I on public.%I', policy_name, table_name);
    end loop;
  end loop;
end $$;

create policy "direct commands own rows" on public.direct_commands
  for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy "direct command triggers own rows" on public.direct_command_triggers
  for all using (
    owner_user_id = auth.uid() and exists (
      select 1 from public.direct_commands command
      where command.id = command_id and command.owner_user_id = auth.uid()
    )
  ) with check (
    owner_user_id = auth.uid() and exists (
      select 1 from public.direct_commands command
      where command.id = command_id and command.owner_user_id = auth.uid()
    )
  );
create policy "query patterns own rows" on public.query_patterns
  for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy "intent events own rows" on public.intent_events
  for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

-- Remove every permissive legacy policy from personal-memory tables before
-- recreating strict account predicates. Multiple permissive policies combine
-- with OR, so leaving one old policy would defeat isolation.
do $$
declare table_name text; policy_name text;
begin
  foreach table_name in array array['personal_memories','personal_memos','personal_memo_entries','personal_memo_versions','conversation_memo_contexts'] loop
    if to_regclass('public.' || table_name) is not null then
      execute format('alter table public.%I enable row level security', table_name);
      execute format('alter table public.%I force row level security', table_name);
      for policy_name in select policyname from pg_policies where schemaname='public' and tablename=table_name loop
        execute format('drop policy if exists %I on public.%I', policy_name, table_name);
      end loop;
    end if;
  end loop;
end $$;

create policy "personal memories own rows" on public.personal_memories
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "persistent personal memos own rows" on public.personal_memos
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "persistent personal memo entries own rows" on public.personal_memo_entries
  for all using (
    user_id = auth.uid() and exists (
      select 1 from public.personal_memos memo where memo.id = memo_id and memo.user_id = auth.uid()
    )
  ) with check (
    user_id = auth.uid() and exists (
      select 1 from public.personal_memos memo where memo.id = memo_id and memo.user_id = auth.uid()
    )
  );
create policy "persistent personal memo versions own rows" on public.personal_memo_versions
  for all using (
    user_id = auth.uid() and exists (
      select 1 from public.personal_memos memo where memo.id = memo_id and memo.user_id = auth.uid()
    )
  ) with check (
    user_id = auth.uid() and exists (
      select 1 from public.personal_memos memo where memo.id = memo_id and memo.user_id = auth.uid()
    )
  );
create policy "conversation memo contexts own rows strict" on public.conversation_memo_contexts
  for all using (
    user_id = auth.uid() and exists (
      select 1 from public.personal_memos memo where memo.id = active_memo_id and memo.user_id = auth.uid()
    )
  ) with check (
    user_id = auth.uid() and exists (
      select 1 from public.personal_memos memo where memo.id = active_memo_id and memo.user_id = auth.uid()
    )
  );

create or replace function public.enforce_personal_memo_parent_owner()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from public.personal_memos memo where memo.id = new.memo_id and memo.user_id = new.user_id) then
    raise exception 'personal memo owner mismatch' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists personal_memo_entries_owner_guard on public.personal_memo_entries;
create trigger personal_memo_entries_owner_guard before insert or update on public.personal_memo_entries
  for each row execute function public.enforce_personal_memo_parent_owner();
drop trigger if exists personal_memo_versions_owner_guard on public.personal_memo_versions;
create trigger personal_memo_versions_owner_guard before insert or update on public.personal_memo_versions
  for each row execute function public.enforce_personal_memo_parent_owner();

create or replace function public.enforce_conversation_memo_context_owner()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from public.personal_memos memo where memo.id = new.active_memo_id and memo.user_id = new.user_id) then
    raise exception 'conversation memo owner mismatch' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists conversation_memo_context_owner_guard on public.conversation_memo_contexts;
create trigger conversation_memo_context_owner_guard before insert or update on public.conversation_memo_contexts
  for each row execute function public.enforce_conversation_memo_context_owner();
'''
)

write(
    "apps/web/tests/heather-owner-access.test.ts",
    '''import assert from "node:assert/strict";
import test from "node:test";
import { isConfiguredHeatherOwner } from "../lib/security/heather-owner";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";

function withOwnerEnv(values: { id?: string; email?: string }, run: () => void) {
  const previousId = process.env.HEATHER_OWNER_USER_ID;
  const previousEmail = process.env.HEATHER_OWNER_EMAIL;
  if (values.id === undefined) delete process.env.HEATHER_OWNER_USER_ID; else process.env.HEATHER_OWNER_USER_ID = values.id;
  if (values.email === undefined) delete process.env.HEATHER_OWNER_EMAIL; else process.env.HEATHER_OWNER_EMAIL = values.email;
  try { run(); } finally {
    if (previousId === undefined) delete process.env.HEATHER_OWNER_USER_ID; else process.env.HEATHER_OWNER_USER_ID = previousId;
    if (previousEmail === undefined) delete process.env.HEATHER_OWNER_EMAIL; else process.env.HEATHER_OWNER_EMAIL = previousEmail;
  }
}

test("direct command owner access fails closed without configured identity", () => {
  withOwnerEnv({}, () => assert.equal(isConfiguredHeatherOwner({ id: OWNER_ID, email: "owner@example.com" }), false));
});

test("anonymous and mismatched accounts are denied", () => {
  withOwnerEnv({ id: OWNER_ID }, () => {
    assert.equal(isConfiguredHeatherOwner(null), false);
    assert.equal(isConfiguredHeatherOwner({ id: OTHER_ID, email: "other@example.com" }), false);
  });
});

test("the exact configured owner UUID is accepted", () => {
  withOwnerEnv({ id: OWNER_ID }, () => assert.equal(isConfiguredHeatherOwner({ id: OWNER_ID, email: "owner@example.com" }), true));
});

test("when UUID and email are configured both must match", () => {
  withOwnerEnv({ id: OWNER_ID, email: "Waterfalling@Example.com" }, () => {
    assert.equal(isConfiguredHeatherOwner({ id: OWNER_ID, email: "waterfalling@example.com" }), true);
    assert.equal(isConfiguredHeatherOwner({ id: OWNER_ID, email: "other@example.com" }), false);
    assert.equal(isConfiguredHeatherOwner({ id: OTHER_ID, email: "waterfalling@example.com" }), false);
  });
});
'''
)

package_path = "apps/web/package.json"
package = json.loads(read(package_path))
intent_script = package["scripts"]["test:intent"]
if "tests/heather-owner-access.test.ts" not in intent_script:
    package["scripts"]["test:intent"] = intent_script + " tests/heather-owner-access.test.ts"
write(package_path, json.dumps(package, ensure_ascii=False, indent=2) + "\n")

# No server path may instantiate a global, ownerless command repository.
remaining = []
for candidate in (ROOT / "apps/web").rglob("*.ts*"):
    text = candidate.read_text(encoding="utf-8")
    if "new DirectCommandRepository()" in text:
        remaining.append(str(candidate.relative_to(ROOT)))
if remaining:
    raise RuntimeError("Ownerless DirectCommandRepository call sites remain: " + ", ".join(remaining))

print("Owner-only Direct Commands and personal-memory isolation patch applied.")
