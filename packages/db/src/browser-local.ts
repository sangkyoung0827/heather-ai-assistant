import type {
  AutomationRecipe,
  Conversation,
  HeatherSettings,
  MemoryRecord,
  ProjectRecord,
  TeachingRecord
} from "@heather/core";
import {
  createDefaultSettings,
  createSeedAutomationRecipes,
  createSeedMemories,
  createSeedProjects,
  createSeedTeachings
} from "./seed";
import type { HeatherDatabase } from "./types";

const STORAGE_PREFIX = "heather.ai";

type CollectionName = "conversations" | "projects" | "memories" | "teachings" | "automationRecipes";

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
    const rawSettings = storage().getItem(key("settings"));
    const stored = readJson<Partial<HeatherSettings>>("settings", defaults);
    const currentMonth = new Date().toISOString().slice(0, 7);
    const merged = {
      ...defaults,
      ...stored
    };

    const hasStoredSettings = Boolean(rawSettings);
    const isLegacyLocalOnlyDefault =
      hasStoredSettings &&
      merged.aiMode === "local_only" &&
      (!stored.ollamaBaseUrl || stored.ollamaBaseUrl === "http://127.0.0.1:11434") &&
      (!stored.ollamaModel || stored.ollamaModel === "llama3.1");
    const isLegacyOllamaModel = hasStoredSettings && stored.ollamaModel === "gemma4:latest";

    if (isLegacyLocalOnlyDefault || isLegacyOllamaModel) {
      merged.aiMode = "local_model";
      merged.ollamaBaseUrl = defaults.ollamaBaseUrl;
      merged.ollamaModel = defaults.ollamaModel;
      merged.cacheResponses = false;
      writeJson("settings", merged);
    }

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

  async listTeachings(): Promise<TeachingRecord[]> {
    const teachings = readCollection<TeachingRecord>("teachings", []);
    if (teachings.length) return teachings;

    const seeded = createSeedTeachings();
    writeJson("teachings", seeded);
    return seeded;
  }

  async saveTeaching(teaching: TeachingRecord): Promise<void> {
    writeJson("teachings", upsert(await this.listTeachings(), teaching));
  }

  async deleteTeaching(id: string): Promise<void> {
    writeJson(
      "teachings",
      (await this.listTeachings()).filter((teaching) => teaching.id !== id)
    );
  }

  async listAutomationRecipes(): Promise<AutomationRecipe[]> {
    const recipes = readCollection<AutomationRecipe>("automationRecipes", []);
    if (recipes.length) return recipes;

    const seeded = createSeedAutomationRecipes();
    writeJson("automationRecipes", seeded);
    return seeded;
  }

  async saveAutomationRecipe(recipe: AutomationRecipe): Promise<void> {
    writeJson("automationRecipes", upsert(await this.listAutomationRecipes(), recipe));
  }

  async deleteAutomationRecipe(id: string): Promise<void> {
    writeJson(
      "automationRecipes",
      (await this.listAutomationRecipes()).filter((recipe) => recipe.id !== id)
    );
  }

  async clearAll(): Promise<void> {
    storage().removeItem(key("settings"));
    storage().removeItem(key("conversations"));
    storage().removeItem(key("projects"));
    storage().removeItem(key("memories"));
    storage().removeItem(key("teachings"));
    storage().removeItem(key("automationRecipes"));
  }
}
