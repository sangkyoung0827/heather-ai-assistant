import { directCommandAuthorizationHeaders } from "./security/direct-command-client";

export type DirectCommand = {
  id: string;
  title: string;
  canonicalTrigger: string;
  triggers: string[];
  response: string;
  enabled: boolean;
  tags: string[];
  createdBy: "user" | "auto";
  createdAt: string;
  updatedAt: string;
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
export type DirectCommandPage = { commands: DirectCommand[]; nextCursor: string | null };

export type DirectCommandStore = {
  getAllDirectCommands(search?: string): Promise<DirectCommand[]>;
  getDirectCommandPage(options?: { q?: string; cursor?: string | null; limit?: number }): Promise<DirectCommandPage>;
  createDirectCommand(input: DirectCommandInput): Promise<DirectCommand>;
  updateDirectCommand(id: string, input: Partial<DirectCommandInput>): Promise<DirectCommand>;
  deleteDirectCommand(id: string): Promise<void>;
  enableDirectCommand(id: string): Promise<DirectCommand>;
  disableDirectCommand(id: string): Promise<DirectCommand>;
  importDirectCommands(commands: DirectCommandInput[]): Promise<ImportSummary>;
  exportDirectCommands(): Promise<DirectCommandInput[]>;
};

const LEGACY_STORAGE_KEY = "heather.directCommands.v1";

export function createDirectCommandStore(): DirectCommandStore {
  return {
    async getAllDirectCommands(search = "") {
      const query = search ? `?search=${encodeURIComponent(search)}` : "";
      return (await request<{ commands: DirectCommand[] }>(`/api/direct-commands${query}`)).commands;
    },
    async getDirectCommandPage(options = {}) {
      const params = new URLSearchParams();
      if (options.q) params.set("q", options.q);
      if (options.cursor) params.set("cursor", options.cursor);
      params.set("limit", String(options.limit || 30));
      return request<DirectCommandPage>(`/api/direct-commands?${params.toString()}`);
    },
    async createDirectCommand(input) { return (await request<{ command: DirectCommand }>("/api/direct-commands", { method: "POST", body: JSON.stringify(input) })).command; },
    async updateDirectCommand(id, input) { return (await request<{ command: DirectCommand }>(`/api/direct-commands/${id}`, { method: "PATCH", body: JSON.stringify(input) })).command; },
    async deleteDirectCommand(id) { await request(`/api/direct-commands/${id}`, { method: "DELETE" }); },
    async enableDirectCommand(id) { return this.updateDirectCommand(id, { enabled: true }); },
    async disableDirectCommand(id) { return this.updateDirectCommand(id, { enabled: false }); },
    async importDirectCommands(commands) { return (await request<{ summary: ImportSummary }>("/api/direct-commands/import", { method: "POST", body: JSON.stringify({ commands }) })).summary; },
    async exportDirectCommands() { return (await request<{ commands: DirectCommandInput[] }>("/api/direct-commands/export")).commands; }
  };
}

export function readLegacyLocalStorageCommands(): DirectCommandInput[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as Array<Record<string, unknown>> : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      const trigger = String(item.canonicalTrigger || item.question || "").trim();
      const response = String(item.response || "").trim();
      const title = String(item.title || "").trim();
      return title && trigger && response ? [{ title, canonicalTrigger: trigger, triggers: Array.isArray(item.triggers) ? item.triggers.map(String) : [], response, enabled: item.enabled !== false, tags: Array.isArray(item.tags) ? item.tags.map(String) : [] }] : [];
    });
  } catch { return []; }
}

async function request<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const authorization = await directCommandAuthorizationHeaders();
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: {
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...authorization,
      ...(init?.headers || {})
    }
  });
  if (response.status === 204) return undefined as T;
  const payload = await response.json() as T & { error?: string };
  if (!response.ok || payload.error) throw new Error(payload.error || "Direct command request failed.");
  return payload;
}
