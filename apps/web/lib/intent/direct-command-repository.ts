import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { findIntentCommandMatch, normalizeIntentText, type IntentCommand } from "./direct-command-engine";

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

type QueryPattern = { normalized: string; examples: string[]; count: number; response: string };
type MemoryState = { commands: DirectCommandRecord[]; patterns: Map<string, QueryPattern> };

declare global {
  // eslint-disable-next-line no-var
  var heatherIntentMemory: MemoryState | undefined;
}

const memory = globalThis.heatherIntentMemory ?? { commands: [], patterns: new Map<string, QueryPattern>() };
globalThis.heatherIntentMemory = memory;

const MAX_TEXT_LENGTH = 4000;
const MAX_TRIGGERS = 20;
const MAX_IMPORT_COMMANDS = 200;

export class DirectCommandRepository {
  private readonly client: SupabaseClient | null;

  constructor() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    this.client = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  }

  get configured() { return Boolean(this.client); }

  async list(search = ""): Promise<DirectCommandRecord[]> {
    const commands = this.client ? await this.listSupabase() : memory.commands;
    const keyword = normalizeIntentText(search);
    if (!keyword) return commands;
    return commands.filter((command) => normalizeIntentText([command.title, command.canonicalTrigger, ...command.triggers, ...command.tags].join(" ")).includes(keyword));
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
      memory.commands.unshift(record);
      return record;
    }
    const { data, error } = await this.client.from("direct_commands").insert({
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
      const { error: triggerError } = await this.client.from("direct_command_triggers").insert(prepared.triggers.map((trigger) => ({ command_id: id, trigger, normalized_trigger: normalizeIntentText(trigger) })));
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
      memory.commands = memory.commands.map((command) => command.id === id ? record : command);
      return record;
    }
    const { error } = await this.client.from("direct_commands").update({ title: prepared.title, question: prepared.canonicalTrigger, canonical_trigger: prepared.canonicalTrigger, normalized_question: normalizeIntentText(prepared.canonicalTrigger), response: prepared.response, enabled: prepared.enabled, tags: prepared.tags }).eq("id", id);
    if (error) throw error;
    const { error: deleteError } = await this.client.from("direct_command_triggers").delete().eq("command_id", id);
    if (deleteError) throw deleteError;
    if (prepared.triggers.length) {
      const { error: triggerError } = await this.client.from("direct_command_triggers").insert(prepared.triggers.map((trigger) => ({ command_id: id, trigger, normalized_trigger: normalizeIntentText(trigger) })));
      if (triggerError) throw triggerError;
    }
    return (await this.list()).find((command) => command.id === id) as DirectCommandRecord;
  }

  async remove(id: string) {
    if (!this.client) { memory.commands = memory.commands.filter((command) => command.id !== id); return; }
    const { error } = await this.client.from("direct_commands").delete().eq("id", id);
    if (error) throw error;
  }

  async incrementUsage(id: string) {
    if (!this.client) {
      memory.commands = memory.commands.map((command) => command.id === id ? { ...command, usageCount: command.usageCount + 1, lastUsedAt: new Date().toISOString() } : command);
      return;
    }
    const { error } = await this.client.rpc("increment_direct_command_usage", { command_id: id });
    if (error) throw error;
  }

  async import(items: unknown): Promise<DirectCommandRecord[]> {
    if (!Array.isArray(items) || items.length > MAX_IMPORT_COMMANDS) throw new Error("Invalid import payload.");
    const created: DirectCommandRecord[] = [];
    for (const item of items) {
      try { created.push(await this.create(item as DirectCommandInput)); } catch (error) { if (!(error instanceof Error) || !error.message.includes("already exists")) throw error; }
    }
    return created;
  }

  async export() {
    return (await this.list()).map(({ title, canonicalTrigger, triggers, response, enabled, tags }) => ({ title, canonicalTrigger, triggers, response, enabled, tags }));
  }

  async recordFallback(message: string, response: string, eligible: boolean) {
    if (!eligible) return { promoted: false };
    const normalized = normalizeIntentText(message);
    if (!normalized) return { promoted: false };
    const persisted = this.client
      ? await this.client.from("query_patterns").select("occurrence_count, examples, status").eq("normalized_query", normalized).maybeSingle()
      : null;
    if (persisted?.error) throw persisted.error;
    const persistedRow = persisted?.data as { occurrence_count: number; examples: string[]; status: string } | null | undefined;
    const pattern = memory.patterns.get(normalized) ?? { normalized, examples: persistedRow?.examples || [], count: persistedRow?.occurrence_count || 0, response };
    pattern.count += 1;
    pattern.response = response;
    if (!pattern.examples.includes(message)) pattern.examples.push(message);
    memory.patterns.set(normalized, pattern);
    if (this.client) {
      const { error } = await this.client.from("query_patterns").upsert({ normalized_query: normalized, representative_query: pattern.examples[0] || message, examples: pattern.examples.slice(0, MAX_TRIGGERS + 1), occurrence_count: pattern.count, latest_response: response, status: pattern.count >= 3 ? "promoted" : "observed" }, { onConflict: "normalized_query" });
      if (error) throw error;
    }
    if (pattern.count < 3) return { promoted: false };
    const existing = await this.find(message);
    if (existing) return { promoted: false };
    const created = await this.create({ title: truncate(message, 64), canonicalTrigger: pattern.examples[0] || message, triggers: pattern.examples.slice(1), response, enabled: true, tags: ["auto"] }, "auto");
    return { promoted: true, command: created };
  }

  async logIntent(result: "direct_command" | "fallback", message: string, commandId?: string) {
    if (!this.client) return;
    const { createHash } = await import("node:crypto");
    const { error } = await this.client.from("intent_events").insert({ input_hash: createHash("sha256").update(normalizeIntentText(message)).digest("hex"), result, command_id: commandId || null });
    if (error) throw error;
  }

  private async listSupabase(): Promise<DirectCommandRecord[]> {
    const { data: rows, error } = await this.client!.from("direct_commands").select("*, direct_command_triggers(trigger)").order("created_at", { ascending: false });
    if (error) throw error;
    return (rows || []).map((row: Record<string, unknown>) => ({
      id: String(row.id), title: String(row.title), canonicalTrigger: String(row.canonical_trigger || row.question),
      triggers: Array.isArray(row.direct_command_triggers) ? row.direct_command_triggers.map((trigger: { trigger: string }) => trigger.trigger) : [],
      response: String(row.response), enabled: Boolean(row.enabled), tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
      createdBy: row.created_by === "auto" ? "auto" : "user", createdAt: String(row.created_at), updatedAt: String(row.updated_at), usageCount: Number(row.usage_count || 0), lastUsedAt: row.last_used_at ? String(row.last_used_at) : null
    }));
  }
}

function validateInput(input: DirectCommandInput) {
  const title = input.title?.trim();
  const canonicalTrigger = input.canonicalTrigger?.trim();
  const response = input.response?.trim();
  if (!title || !canonicalTrigger || !response || title.length > 160 || canonicalTrigger.length > MAX_TEXT_LENGTH || response.length > MAX_TEXT_LENGTH) throw new Error("Title, trigger, and response are required.");
  const triggers = [...new Set((input.triggers || []).map((trigger) => trigger.trim()).filter(Boolean))].filter((trigger) => normalizeIntentText(trigger) !== normalizeIntentText(canonicalTrigger));
  if (triggers.length > MAX_TRIGGERS) throw new Error("Too many triggers.");
  return { title, canonicalTrigger, triggers, response, enabled: input.enabled !== false, tags: [...new Set((input.tags || []).map((tag) => tag.trim()).filter(Boolean))].slice(0, 12) };
}

function truncate(value: string, length: number) { return value.length > length ? `${value.slice(0, length - 1)}…` : value; }
