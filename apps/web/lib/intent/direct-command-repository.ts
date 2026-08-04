import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { findIntentCommandMatch, normalizeIntentText, type IntentCommand } from "./direct-command-engine";
import { previewBulkImport } from "./bulk-direct-command-import";
import { AUTO_LEARNING_WINDOW_DAYS, AUTO_PROMOTION_COUNT, MAX_QUERY_VARIANTS, REPEATED_QUERY_SIMILARITY_THRESHOLD, RESPONSE_CONSISTENCY_THRESHOLD } from "./repeated-query-learning";

export type CommandCreatedBy = "user" | "auto";
export type DirectCommandRecord = IntentCommand & {
  title: string;
  tags: string[];
  createdBy: CommandCreatedBy;
  createdAt: string;
  updatedAt: string;
  usageCount: number;
  lastUsedAt: string | null;
};

export type DirectCommandInput = {
  title: string;
  canonicalTrigger: string;
  triggers?: string[];
  response: string;
  enabled?: boolean;
  tags?: string[];
};

export type ImportSummary = { created: number; merged: number; skipped: number; failed: number };
export type BulkCommitSummary = { created: number; merged: number; duplicate: number; error: number };
export type StorageStatus = { provider: "supabase" | "local" | "unavailable"; connected: boolean; readable: boolean; writable: boolean };
export type DirectCommandPage = { commands: DirectCommandRecord[]; nextCursor: string | null };

type QueryPattern = { id?: string; normalized: string; examples: string[]; count: number; response: string; status?: string; lastSeenAt?: string };
type MemoryState = { commands: DirectCommandRecord[]; patterns: Map<string, QueryPattern>; processedMessageIds: Set<string> };

declare global {
  // eslint-disable-next-line no-var
  var heatherIntentMemoryByOwner: Map<string, MemoryState> | undefined;
}

const ownerMemory = globalThis.heatherIntentMemoryByOwner ?? new Map<string, MemoryState>();
globalThis.heatherIntentMemoryByOwner = ownerMemory;

const MAX_TITLE_LENGTH = 200;
const MAX_TRIGGER_LENGTH = 500;
const MAX_RESPONSE_LENGTH = 10000;
const MAX_TRIGGERS = 20;
const MAX_IMPORT_COMMANDS = 200;

export class DirectCommandRepository {
  private readonly client: SupabaseClient | null;
  private readonly memory: MemoryState;
  private ownershipPrepared = false;

  constructor(private readonly ownerUserId: string) {
    if (!isUuid(ownerUserId)) throw new Error("Direct command owner is not configured.");
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    this.client = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
    this.memory = ownerMemory.get(ownerUserId) ?? { commands: [], patterns: new Map(), processedMessageIds: new Set() };
    ownerMemory.set(ownerUserId, this.memory);
  }

  get configured() { return Boolean(this.client); }

  async list(search = ""): Promise<DirectCommandRecord[]> {
    await this.prepareOwnership();
    const commands = this.client ? await this.listSupabase() : this.memory.commands;
    return filterCommands(commands, search);
  }

  async listPage({ search = "", cursor, limit = 30 }: { search?: string; cursor?: string | null; limit?: number } = {}): Promise<DirectCommandPage> {
    const commands = await this.list(search);
    const start = decodeCursor(cursor);
    const size = Math.max(1, Math.min(limit, 100));
    const page = commands.slice(start, start + size);
    const next = start + page.length;
    return { commands: page, nextCursor: next < commands.length ? encodeCursor(next) : null };
  }

  async find(message: string) {
    const commands = await this.list();
    return findIntentCommandMatch(message, commands);
  }

  async create(input: DirectCommandInput, createdBy: CommandCreatedBy = "user"): Promise<DirectCommandRecord> {
    const prepared = validateInput(input);
    const duplicate = findIntentCommandMatch(prepared.canonicalTrigger, await this.list());
    if (duplicate) throw new Error("A matching direct command already exists.");
    if (!this.client) {
      const now = new Date().toISOString();
      const record: DirectCommandRecord = { id: randomUUID(), ...prepared, createdBy, createdAt: now, updatedAt: now, usageCount: 0, lastUsedAt: null };
      this.memory.commands.unshift(record);
      return record;
    }
    const { data, error } = await this.client.from("direct_commands").insert({
      owner_user_id: this.ownerUserId,
      title: prepared.title,
      question: prepared.canonicalTrigger,
      canonical_trigger: prepared.canonicalTrigger,
      normalized_question: normalizeIntentText(prepared.canonicalTrigger),
      response: prepared.response,
      enabled: prepared.enabled,
      tags: prepared.tags,
      created_by: createdBy
    }).select("*").single();
    if (error) throw error;
    const id = String(data.id);
    if (prepared.triggers.length) {
      const { error: triggerError } = await this.client.from("direct_command_triggers").insert(prepared.triggers.map((trigger) => ({ owner_user_id: this.ownerUserId, command_id: id, trigger, normalized_trigger: normalizeIntentText(trigger) })));
      if (triggerError) throw triggerError;
    }
    return (await this.list()).find((command) => command.id === id) as DirectCommandRecord;
  }

  async update(id: string, input: Partial<DirectCommandInput>): Promise<DirectCommandRecord> {
    const existing = (await this.list()).find((command) => command.id === id);
    if (!existing) throw new Error("Direct command not found.");
    const prepared = validateInput({ ...existing, ...input, triggers: input.triggers ?? existing.triggers });
    if (!this.client) {
      const record = { ...existing, ...prepared, updatedAt: new Date().toISOString() };
      this.memory.commands = this.memory.commands.map((command) => command.id === id ? record : command);
      return record;
    }
    const { error } = await this.client.from("direct_commands").update({ title: prepared.title, question: prepared.canonicalTrigger, canonical_trigger: prepared.canonicalTrigger, normalized_question: normalizeIntentText(prepared.canonicalTrigger), response: prepared.response, enabled: prepared.enabled, tags: prepared.tags }).eq("id", id).eq("owner_user_id", this.ownerUserId);
    if (error) throw error;
    const { error: deleteError } = await this.client.from("direct_command_triggers").delete().eq("command_id", id).eq("owner_user_id", this.ownerUserId);
    if (deleteError) throw deleteError;
    if (prepared.triggers.length) {
      const { error: triggerError } = await this.client.from("direct_command_triggers").insert(prepared.triggers.map((trigger) => ({ owner_user_id: this.ownerUserId, command_id: id, trigger, normalized_trigger: normalizeIntentText(trigger) })));
      if (triggerError) throw triggerError;
    }
    return (await this.list()).find((command) => command.id === id) as DirectCommandRecord;
  }

  async remove(id: string) {
    if (!this.client) { this.memory.commands = this.memory.commands.filter((command) => command.id !== id); return; }
    await this.prepareOwnership();
    const { error } = await this.client.from("direct_commands").delete().eq("id", id).eq("owner_user_id", this.ownerUserId);
    if (error) throw error;
  }

  async incrementUsage(id: string) {
    if (!this.client) {
      this.memory.commands = this.memory.commands.map((command) => command.id === id ? { ...command, usageCount: command.usageCount + 1, lastUsedAt: new Date().toISOString() } : command);
      return;
    }
    await this.prepareOwnership();
    const { data: command, error: readError } = await this.client.from("direct_commands").select("usage_count").eq("id", id).eq("owner_user_id", this.ownerUserId).single();
    if (readError) throw readError;
    const { error } = await this.client.from("direct_commands").update({ usage_count: Number(command.usage_count || 0) + 1, last_used_at: new Date().toISOString() }).eq("id", id).eq("owner_user_id", this.ownerUserId);
    if (error) throw error;
  }

  async import(items: unknown): Promise<ImportSummary> {
    if (!Array.isArray(items) || items.length > MAX_IMPORT_COMMANDS) throw new Error("Invalid import payload.");
    const summary: ImportSummary = { created: 0, merged: 0, skipped: 0, failed: 0 };
    for (const item of items) {
      try {
        const input = validateInput(item as DirectCommandInput);
        const existing = await this.find(input.canonicalTrigger);
        if (!existing) { await this.create(input); summary.created += 1; continue; }
        const record = (await this.list()).find((command) => command.id === existing.command.id);
        if (!record) { summary.failed += 1; continue; }
        const candidates = [...record.triggers, input.canonicalTrigger, ...input.triggers];
        const mergedTriggers = uniqueTriggers(record.canonicalTrigger, candidates);
        if (mergedTriggers.length === record.triggers.length) { summary.skipped += 1; continue; }
        await this.update(record.id, { triggers: mergedTriggers });
        summary.merged += 1;
      } catch { summary.failed += 1; }
    }
    return summary;
  }

  async commitBulkImport(items: Array<DirectCommandInput | null>): Promise<BulkCommitSummary> {
    const initial = previewBulkImport(items, await this.list());
    const summary: BulkCommitSummary = { created: 0, merged: 0, duplicate: 0, error: 0 };
    for (const item of initial.items) {
      if (item.status === "duplicate") { summary.duplicate += 1; continue; }
      if (item.status === "error" || !item.input) { summary.error += 1; continue; }
      try {
        if (item.status === "create") { await this.create(item.input); summary.created += 1; continue; }
        const existing = (await this.list()).find((command) => command.id === item.existingId);
        if (!existing) { summary.error += 1; continue; }
        const triggers = uniqueTriggers(existing.canonicalTrigger, [...existing.triggers, item.input.canonicalTrigger, ...(item.input.triggers || [])]);
        if (triggers.length === existing.triggers.length) { summary.duplicate += 1; continue; }
        await this.update(existing.id, { triggers });
        summary.merged += 1;
      } catch { summary.error += 1; }
    }
    return summary;
  }

  async export() {
    return (await this.list()).map(({ title, canonicalTrigger, triggers, response, enabled, tags }) => ({ title, canonicalTrigger, triggers, response, enabled, tags }));
  }

  async recordRepeatedFallback({ message, response, messageId }: { message: string; response: string; messageId?: string }) {
    if (messageId && this.memory.processedMessageIds.has(messageId)) return { promoted: false };
    if (messageId) { this.memory.processedMessageIds.add(messageId); if (this.memory.processedMessageIds.size > 1000) this.memory.processedMessageIds.delete(this.memory.processedMessageIds.values().next().value as string); }
    const normalized = normalizeRepeatedQuery(message);
    if (!normalized) return { promoted: false };
    const cutoff = new Date(Date.now() - AUTO_LEARNING_WINDOW_DAYS * 86400000).toISOString();
    await this.prepareOwnership();
    const persisted = this.client ? await this.client.from("query_patterns").select("id, normalized_query, representative_query, examples, occurrence_count, latest_response, status, updated_at").eq("owner_user_id", this.ownerUserId).gte("updated_at", cutoff).limit(250) : null;
    if (persisted?.error) throw persisted.error;
    const rows = ((persisted?.data || []) as Array<Record<string, unknown>>).map((row) => ({ id: String(row.id), normalized: String(row.normalized_query), examples: Array.isArray(row.examples) ? row.examples.map(String) : [], count: Number(row.occurrence_count || 0), response: String(row.latest_response || ""), status: String(row.status || "observed"), lastSeenAt: String(row.updated_at || "") }));
    const candidate = rows.find((pattern) => pattern.normalized === normalized) || rows.filter((pattern) => pattern.status === "observed").map((pattern) => ({ pattern, score: repeatedQuerySimilarity(normalized, pattern.normalized) })).filter(({ score }) => score >= REPEATED_QUERY_SIMILARITY_THRESHOLD).sort((a, b) => b.score - a.score)[0]?.pattern;
    const pattern = candidate || this.memory.patterns.get(normalized) || { normalized, examples: [], count: 0, response: "", status: "observed" };
    if (pattern.status === "promoted" || pattern.status === "excluded" || pattern.status === "ignored") return { promoted: false };
    const consistent = !pattern.response || responseSimilarity(pattern.response, response) >= RESPONSE_CONSISTENCY_THRESHOLD;
    pattern.count = consistent ? pattern.count + 1 : 1;
    pattern.response = response;
    if (!pattern.examples.includes(message)) pattern.examples.push(message);
    pattern.examples = pattern.examples.slice(-MAX_QUERY_VARIANTS);
    pattern.lastSeenAt = new Date().toISOString();
    this.memory.patterns.set(pattern.normalized, pattern);
    if (this.client) {
      const payload = { owner_user_id: this.ownerUserId, normalized_query: pattern.normalized, representative_query: pattern.examples[0] || message, examples: pattern.examples, occurrence_count: pattern.count, latest_response: response, status: "observed" };
      const query = pattern.id ? this.client.from("query_patterns").update(payload).eq("id", pattern.id).eq("owner_user_id", this.ownerUserId) : this.client.from("query_patterns").upsert(payload, { onConflict: "owner_user_id,normalized_query" });
      const { error } = await query;
      if (error) throw error;
    }
    if (pattern.count < AUTO_PROMOTION_COUNT) return { promoted: false };
    const existing = await this.find(pattern.examples[0] || message);
    if (existing) {
      const existingRecord = (await this.list()).find((command) => command.id === existing.command.id);
      if (!existingRecord || responseSimilarity(existing.command.response, response) < RESPONSE_CONSISTENCY_THRESHOLD) return this.excludePattern(pattern, "conflict");
      const triggers = uniqueTriggers(existingRecord.canonicalTrigger, [...existingRecord.triggers, ...pattern.examples]);
      if (triggers.length > existingRecord.triggers.length) await this.update(existingRecord.id, { triggers });
      await this.markPattern(pattern, "promoted");
      return { promoted: false, merged: true };
    }
    const created = await this.create({ title: truncate(pattern.examples[0] || message, 64), canonicalTrigger: pattern.examples[0] || message, triggers: uniqueTriggers(pattern.examples[0] || message, pattern.examples.slice(1)), response, enabled: true, tags: ["auto-generated"] }, "auto");
    await this.markPattern(pattern, "promoted");
    return { promoted: true, command: created };
  }

  async recordFallback(message: string, response: string, eligible: boolean) { if (!eligible) return { promoted: false }; return this.recordRepeatedFallback({ message, response }); }

  private async markPattern(pattern: QueryPattern, status: "promoted" | "excluded") {
    pattern.status = status;
    if (!this.client) return;
    const { error } = pattern.id
      ? await this.client.from("query_patterns").update({ status }).eq("id", pattern.id).eq("owner_user_id", this.ownerUserId)
      : await this.client.from("query_patterns").update({ status }).eq("normalized_query", pattern.normalized).eq("owner_user_id", this.ownerUserId);
    if (error) throw error;
  }

  private async excludePattern(pattern: QueryPattern, _reason: string) { await this.markPattern(pattern, "excluded"); return { promoted: false, excluded: true }; }

  async logIntent(result: "direct_command" | "fallback", message: string, commandId?: string) {
    if (!this.client) return;
    await this.prepareOwnership();
    const { createHash } = await import("node:crypto");
    const { error } = await this.client.from("intent_events").insert({ owner_user_id: this.ownerUserId, input_hash: createHash("sha256").update(normalizeIntentText(message)).digest("hex"), result, command_id: commandId || null });
    if (error) throw error;
  }

  async storageStatus(): Promise<StorageStatus> {
    if (!this.client) return { provider: "local", connected: false, readable: false, writable: false };
    await this.prepareOwnership();
    const read = await this.client.from("direct_commands").select("id", { head: true, count: "exact" }).eq("owner_user_id", this.ownerUserId).limit(1);
    const triggerRead = await this.client.from("direct_command_triggers").select("id", { head: true, count: "exact" }).eq("owner_user_id", this.ownerUserId).limit(1);
    if (read.error || triggerRead.error) return { provider: "unavailable", connected: false, readable: false, writable: false };
    const write = await this.client.from("direct_commands").update({ updated_at: new Date().toISOString() }).eq("id", "00000000-0000-0000-0000-000000000000").eq("owner_user_id", this.ownerUserId);
    return { provider: write.error ? "unavailable" : "supabase", connected: !write.error, readable: true, writable: !write.error };
  }

  private async prepareOwnership() {
    if (!this.client || this.ownershipPrepared) return;
    const claimCommands = await this.client.from("direct_commands").update({ owner_user_id: this.ownerUserId }).is("owner_user_id", null);
    if (claimCommands.error) throw new Error("Apply the owner-only direct command migration before using Direct Commands.");
    await this.client.from("query_patterns").update({ owner_user_id: this.ownerUserId }).is("owner_user_id", null);
    await this.client.from("intent_events").update({ owner_user_id: this.ownerUserId }).is("owner_user_id", null);
    const { data: commands, error } = await this.client.from("direct_commands").select("id").eq("owner_user_id", this.ownerUserId).limit(5000);
    if (error) throw error;
    const ids = (commands || []).map((row) => String(row.id));
    for (let index = 0; index < ids.length; index += 500) {
      const { error: triggerError } = await this.client.from("direct_command_triggers").update({ owner_user_id: this.ownerUserId }).in("command_id", ids.slice(index, index + 500)).is("owner_user_id", null);
      if (triggerError) throw triggerError;
    }
    this.ownershipPrepared = true;
  }

  private async listSupabase(): Promise<DirectCommandRecord[]> {
    const { data: rows, error } = await this.client!.from("direct_commands").select("*, direct_command_triggers(trigger)").eq("owner_user_id", this.ownerUserId).order("created_at", { ascending: false });
    if (error) throw error;
    return (rows || []).map((row: Record<string, unknown>) => ({
      id: String(row.id), title: String(row.title), canonicalTrigger: String(row.canonical_trigger || row.question),
      triggers: Array.isArray(row.direct_command_triggers) ? row.direct_command_triggers.map((trigger: { trigger: string }) => trigger.trigger) : [],
      response: String(row.response), enabled: Boolean(row.enabled), tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
      createdBy: row.created_by === "auto" ? "auto" : "user", createdAt: String(row.created_at), updatedAt: String(row.updated_at), usageCount: Number(row.usage_count || 0), lastUsedAt: row.last_used_at ? String(row.last_used_at) : null
    }));
  }
}

function filterCommands(commands: DirectCommandRecord[], search: string) {
  const keyword = normalizeIntentText(search);
  if (!keyword) return commands;
  return commands.filter((command) => normalizeIntentText([command.title, command.canonicalTrigger, ...command.triggers, ...command.tags, command.response].join(" ")).includes(keyword));
}

function encodeCursor(offset: number) { return Buffer.from(String(offset), "utf8").toString("base64url"); }
function decodeCursor(cursor?: string | null) {
  if (!cursor) return 0;
  try {
    const value = Number.parseInt(Buffer.from(cursor, "base64url").toString("utf8"), 10);
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  } catch { return 0; }
}

function validateInput(input: DirectCommandInput) {
  const title = input.title?.trim();
  const canonicalTrigger = input.canonicalTrigger?.trim();
  const response = input.response?.trim();
  if (!title || !canonicalTrigger || !response || title.length > MAX_TITLE_LENGTH || canonicalTrigger.length > MAX_TRIGGER_LENGTH || response.length > MAX_RESPONSE_LENGTH) throw new Error("Title, trigger, and response are required.");
  const triggers = uniqueTriggers(canonicalTrigger, input.triggers || []);
  if (triggers.length > MAX_TRIGGERS) throw new Error("Too many triggers.");
  return { title, canonicalTrigger, triggers, response, enabled: input.enabled !== false, tags: [...new Set((input.tags || []).map((tag) => tag.trim()).filter(Boolean))].slice(0, 20) };
}

function uniqueTriggers(canonicalTrigger: string, triggers: string[]) {
  const canonical = normalizeIntentText(canonicalTrigger);
  const seen = new Set<string>();
  return triggers.map((trigger) => trigger.trim()).filter((trigger) => {
    const normalized = normalizeIntentText(trigger);
    if (!normalized || normalized === canonical || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  }).slice(0, MAX_TRIGGERS);
}

function normalizeRepeatedQuery(value: string) {
  return normalizeIntentText(value).replace(/개발\s*(현황|진행\s*상황|어디까지)/g, "개발 진행").replace(/\b(current|status|progress)\b/g, "progress").trim();
}

function repeatedQuerySimilarity(left: string, right: string) {
  if (left === right) return 1;
  const leftTokens = new Set(left.split(" ").filter(Boolean));
  const rightTokens = new Set(right.split(" ").filter(Boolean));
  if (!leftTokens.size || !rightTokens.size || hasOpposingMeaning(leftTokens, rightTokens)) return 0;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return intersection / union;
}

function responseSimilarity(left: string, right: string) {
  const normalize = (value: string) => value.normalize("NFKC").replace(/\s+/g, " ").replace(/(?:provider|model|intent|debug)\s*[:=][^\n]+/gi, "").trim().toLocaleLowerCase();
  const first = normalize(left); const second = normalize(right);
  if (first === second) return 1;
  const longest = Math.max(first.length, second.length);
  if (!longest) return 0;
  let same = 0;
  for (let index = 0; index < Math.min(first.length, second.length); index += 1) if (first[index] === second[index]) same += 1;
  return same / longest;
}

function hasOpposingMeaning(left: Set<string>, right: Set<string>) {
  return [["활성화", "비활성화"], ["삭제", "생성"], ["보내", "취소"], ["enable", "disable"], ["delete", "create"]].some(([first, second]) => (left.has(first) && right.has(second)) || (left.has(second) && right.has(first)));
}

function truncate(value: string, length: number) { return value.length > length ? `${value.slice(0, length - 1)}…` : value; }
function isUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
