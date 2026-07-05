import { normalizeDirectCommandText } from "./direct-command-matching";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "./supabase-client";

export type DirectCommand = {
  id: string;
  title: string;
  question: string;
  normalizedQuestion: string;
  response: string;
  enabled: boolean;
  usageCount: number;
  lastUsedAt: string | null;
  tags: string[];
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type DirectCommandInput = {
  title: string;
  question: string;
  response: string;
  enabled?: boolean;
  tags?: string[];
  notes?: string;
};

export type ImportMode = "skip_duplicates" | "replace_all";

export type DirectCommandStore = {
  isConfigured: boolean;
  getAllDirectCommands(): Promise<DirectCommand[]>;
  createDirectCommand(input: DirectCommandInput): Promise<DirectCommand>;
  updateDirectCommand(id: string, input: Partial<DirectCommandInput>): Promise<DirectCommand>;
  deleteDirectCommand(id: string): Promise<void>;
  enableDirectCommand(id: string): Promise<DirectCommand>;
  disableDirectCommand(id: string): Promise<DirectCommand>;
  incrementDirectCommandUsage(id: string): Promise<void>;
  importDirectCommands(commands: DirectCommandInput[], mode: ImportMode): Promise<DirectCommand[]>;
  exportDirectCommands(): Promise<DirectCommand[]>;
};

type DbDirectCommand = {
  id: string;
  title: string;
  question: string;
  normalized_question: string;
  response: string;
  enabled: boolean;
  usage_count: number;
  last_used_at: string | null;
  tags: string[];
  notes: string;
  created_at: string;
  updated_at: string;
};

const LOCAL_STORAGE_KEY = "heather.directCommands.v1";
const PAGE_SIZE = 1000;
const INSERT_BATCH_SIZE = 500;

export function createDirectCommandStore(): DirectCommandStore {
  if (isSupabaseConfigured()) return createSupabaseDirectCommandStore();
  return createLocalDirectCommandStore();
}

export function readLegacyLocalStorageCommands(): DirectCommandInput[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<Partial<DirectCommandInput>>;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item.title && item.question && item.response).map((item) => ({
      title: String(item.title),
      question: String(item.question),
      response: String(item.response),
      enabled: item.enabled !== false,
      tags: [],
      notes: ""
    }));
  } catch {
    return [];
  }
}

function createSupabaseDirectCommandStore(): DirectCommandStore {
  const maybeClient = getSupabaseBrowserClient();
  if (!maybeClient) return createLocalDirectCommandStore();
  const client = maybeClient;

  async function fetchAllRows() {
    const rows: DbDirectCommand[] = [];
    let page = 0;
    while (true) {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error } = await client.from("direct_commands").select("*").order("created_at", { ascending: false }).range(from, to);
      if (error) throw error;
      const chunk = (data || []) as DbDirectCommand[];
      rows.push(...chunk);
      if (chunk.length < PAGE_SIZE) break;
      page += 1;
    }
    return rows;
  }

  return {
    isConfigured: true,
    async getAllDirectCommands() {
      return (await fetchAllRows()).map(fromDb);
    },
    async createDirectCommand(input) {
      const payload = toDbInsert(input);
      const { data, error } = await client.from("direct_commands").insert(payload).select("*").single();
      if (error) throw error;
      return fromDb(data as DbDirectCommand);
    },
    async updateDirectCommand(id, input) {
      const payload = toDbUpdate(input);
      const { data, error } = await client.from("direct_commands").update(payload).eq("id", id).select("*").single();
      if (error) throw error;
      return fromDb(data as DbDirectCommand);
    },
    async deleteDirectCommand(id) {
      const { error } = await client.from("direct_commands").delete().eq("id", id);
      if (error) throw error;
    },
    async enableDirectCommand(id) {
      return this.updateDirectCommand(id, { enabled: true });
    },
    async disableDirectCommand(id) {
      return this.updateDirectCommand(id, { enabled: false });
    },
    async incrementDirectCommandUsage(id) {
      const { error } = await client.rpc("increment_direct_command_usage", { command_id: id });
      if (!error) return;
      const commands = await this.getAllDirectCommands();
      const current = commands.find((command) => command.id === id);
      if (current) {
        await client.from("direct_commands").update({ usage_count: current.usageCount + 1, last_used_at: new Date().toISOString() }).eq("id", id);
      }
    },
    async importDirectCommands(commands, mode) {
      if (mode === "replace_all") {
        const existing = await this.getAllDirectCommands();
        await Promise.all(existing.map((command) => this.deleteDirectCommand(command.id)));
      }
      const existing = await this.getAllDirectCommands();
      const existingNormalized = new Set(existing.map((command) => command.normalizedQuestion));
      const payloads = commands.filter((command) => {
        const normalized = normalizeDirectCommandText(command.question);
        if (!normalized) return false;
        if (mode === "skip_duplicates" && existingNormalized.has(normalized)) return false;
        existingNormalized.add(normalized);
        return true;
      }).map(toDbInsert);
      const created: DirectCommand[] = [];
      for (let index = 0; index < payloads.length; index += INSERT_BATCH_SIZE) {
        const batch = payloads.slice(index, index + INSERT_BATCH_SIZE);
        const { data, error } = await client.from("direct_commands").insert(batch).select("*");
        if (error) throw error;
        created.push(...((data || []) as DbDirectCommand[]).map(fromDb));
      }
      return created;
    },
    async exportDirectCommands() {
      return this.getAllDirectCommands();
    }
  };
}

function createLocalDirectCommandStore(): DirectCommandStore {
  function read(): DirectCommand[] {
    if (typeof window === "undefined") return [];
    const legacy = readLegacyLocalStorageCommands();
    return legacy.map((item, index) => {
      const now = new Date().toISOString();
      return {
        id: `local-${index}-${normalizeDirectCommandText(item.question).slice(0, 12)}`,
        title: item.title,
        question: item.question,
        normalizedQuestion: normalizeDirectCommandText(item.question),
        response: item.response,
        enabled: item.enabled !== false,
        usageCount: 0,
        lastUsedAt: null,
        tags: item.tags || [],
        notes: item.notes || "",
        createdAt: now,
        updatedAt: now
      };
    });
  }
  function write(commands: DirectCommand[]) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(commands.map(({ id: _id, normalizedQuestion: _n, usageCount: _u, lastUsedAt: _l, createdAt: _c, updatedAt: _up, ...rest }) => rest)));
  }
  return {
    isConfigured: false,
    async getAllDirectCommands() { return read(); },
    async createDirectCommand(input) {
      const now = new Date().toISOString();
      const command: DirectCommand = { id: `local-${Date.now()}`, title: input.title, question: input.question, normalizedQuestion: normalizeDirectCommandText(input.question), response: input.response, enabled: input.enabled !== false, usageCount: 0, lastUsedAt: null, tags: input.tags || [], notes: input.notes || "", createdAt: now, updatedAt: now };
      write([command, ...read()]);
      return command;
    },
    async updateDirectCommand(id, input) {
      const updated = read().map((command) => command.id === id ? { ...command, ...input, normalizedQuestion: input.question ? normalizeDirectCommandText(input.question) : command.normalizedQuestion, updatedAt: new Date().toISOString() } : command);
      write(updated);
      const found = updated.find((command) => command.id === id);
      if (!found) throw new Error("Direct command not found.");
      return found;
    },
    async deleteDirectCommand(id) { write(read().filter((command) => command.id !== id)); },
    async enableDirectCommand(id) { return this.updateDirectCommand(id, { enabled: true }); },
    async disableDirectCommand(id) { return this.updateDirectCommand(id, { enabled: false }); },
    async incrementDirectCommandUsage(id) { write(read().map((command) => command.id === id ? { ...command, usageCount: command.usageCount + 1, lastUsedAt: new Date().toISOString() } : command)); },
    async importDirectCommands(commands, mode) {
      const existing = mode === "replace_all" ? [] : read();
      const existingNormalized = new Set(existing.map((command) => command.normalizedQuestion));
      const now = new Date().toISOString();
      const incoming = commands.filter((command) => {
        const normalized = normalizeDirectCommandText(command.question);
        if (mode === "skip_duplicates" && existingNormalized.has(normalized)) return false;
        existingNormalized.add(normalized);
        return true;
      }).map((command) => ({ id: `local-${Date.now()}-${Math.random().toString(16).slice(2)}`, title: command.title, question: command.question, normalizedQuestion: normalizeDirectCommandText(command.question), response: command.response, enabled: command.enabled !== false, usageCount: 0, lastUsedAt: null, tags: command.tags || [], notes: command.notes || "", createdAt: now, updatedAt: now }));
      write([...incoming, ...existing]);
      return incoming;
    },
    async exportDirectCommands() { return read(); }
  };
}

function fromDb(row: DbDirectCommand): DirectCommand {
  return { id: row.id, title: row.title, question: row.question, normalizedQuestion: row.normalized_question, response: row.response, enabled: row.enabled, usageCount: row.usage_count, lastUsedAt: row.last_used_at, tags: row.tags || [], notes: row.notes || "", createdAt: row.created_at, updatedAt: row.updated_at };
}

function toDbInsert(input: DirectCommandInput) {
  return { title: input.title.trim(), question: input.question.trim(), normalized_question: normalizeDirectCommandText(input.question), response: input.response, enabled: input.enabled !== false, tags: input.tags || [], notes: input.notes || "" };
}

function toDbUpdate(input: Partial<DirectCommandInput>) {
  const update: Record<string, string | boolean | string[]> = { updated_at: new Date().toISOString() };
  if (input.title !== undefined) update.title = input.title.trim();
  if (input.question !== undefined) { update.question = input.question.trim(); update.normalized_question = normalizeDirectCommandText(input.question); }
  if (input.response !== undefined) update.response = input.response;
  if (input.enabled !== undefined) update.enabled = input.enabled;
  if (input.tags !== undefined) update.tags = input.tags;
  if (input.notes !== undefined) update.notes = input.notes;
  return update;
}
