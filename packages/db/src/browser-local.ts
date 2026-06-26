import type { Conversation, HeatherSettings, MemoryRecord, ProjectRecord } from "@heather/core";
import { createDefaultSettings, createSeedMemories, createSeedProjects } from "./seed";
import type { HeatherDatabase } from "./types";

const STORAGE_PREFIX = "heather.ai";

type CollectionName = "conversations" | "projects" | "memories";

function storage(): Storage {
  if (typeof window === "undefined") {
    throw new Error("BrowserHeatherDatabase can only be used in the browser.");
  }

  return window.localStorage;
}

function key(name: string): string {
  return `${STORAGE_PREFIX}.${name}`;
}

function readJson<T>(name: string, fallback: T): T {
  const raw = storage().getItem(key(name));
  if (!raw) return fallback;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(name: string, value: T): void {
  storage().setItem(key(name), JSON.stringify(value));
}

function readCollection<T extends { id: string }>(name: CollectionName, fallback: T[]): T[] {
  return readJson<T[]>(name, fallback);
}

function upsert<T extends { id: string }>(items: T[], item: T): T[] {
  const index = items.findIndex((candidate) => candidate.id === item.id);
  if (index === -1) return [item, ...items];

  const next = [...items];
  next[index] = item;
  return next;
}

export class BrowserHeatherDatabase implements HeatherDatabase {
  async getSettings(): Promise<HeatherSettings> {
    const defaults = createDefaultSettings();
    const stored = readJson<Partial<HeatherSettings>>("settings", defaults);
    const currentMonth = new Date().toISOString().slice(0, 7);
    const merged = {
      ...defaults,
      ...stored
    };

    if (merged.apiUsageMonth !== currentMonth) {
      merged.apiUsageMonth = currentMonth;
      merged.apiCallsThisMonth = 0;
    }

    return merged;
  }

  async saveSettings(settings: HeatherSettings): Promise<void> {
    writeJson("settings", settings);
  }

  async listConversations(): Promise<Conversation[]> {
    return readCollection<Conversation>("conversations", []);
  }

  async saveConversation(conversation: Conversation): Promise<void> {
    writeJson("conversations", upsert(await this.listConversations(), conversation));
  }

  async deleteConversation(id: string): Promise<void> {
    writeJson(
      "conversations",
      (await this.listConversations()).filter((conversation) => conversation.id !== id)
    );
  }

  async listProjects(): Promise<ProjectRecord[]> {
    const projects = readCollection<ProjectRecord>("projects", []);
    if (projects.length) return projects;

    const seeded = createSeedProjects();
    writeJson("projects", seeded);
    return seeded;
  }

  async saveProject(project: ProjectRecord): Promise<void> {
    writeJson("projects", upsert(await this.listProjects(), project));
  }

  async deleteProject(id: string): Promise<void> {
    writeJson(
      "projects",
      (await this.listProjects()).filter((project) => project.id !== id)
    );
  }

  async listMemories(): Promise<MemoryRecord[]> {
    const memories = readCollection<MemoryRecord>("memories", []);
    if (memories.length) return memories;

    const seeded = createSeedMemories();
    writeJson("memories", seeded);
    return seeded;
  }

  async saveMemory(memory: MemoryRecord): Promise<void> {
    writeJson("memories", upsert(await this.listMemories(), memory));
  }

  async deleteMemory(id: string): Promise<void> {
    writeJson(
      "memories",
      (await this.listMemories()).filter((memory) => memory.id !== id)
    );
  }

  async clearAll(): Promise<void> {
    storage().removeItem(key("settings"));
    storage().removeItem(key("conversations"));
    storage().removeItem(key("projects"));
    storage().removeItem(key("memories"));
  }
}
