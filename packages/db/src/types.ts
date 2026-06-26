import type {
  AutomationRecipe,
  Conversation,
  HeatherSettings,
  MemoryRecord,
  ProjectRecord,
  TeachingRecord
} from "@heather/core";

export interface HeatherDatabase {
  getSettings(): Promise<HeatherSettings>;
  saveSettings(settings: HeatherSettings): Promise<void>;
  listConversations(): Promise<Conversation[]>;
  saveConversation(conversation: Conversation): Promise<void>;
  deleteConversation(id: string): Promise<void>;
  listProjects(): Promise<ProjectRecord[]>;
  saveProject(project: ProjectRecord): Promise<void>;
  deleteProject(id: string): Promise<void>;
  listMemories(): Promise<MemoryRecord[]>;
  saveMemory(memory: MemoryRecord): Promise<void>;
  deleteMemory(id: string): Promise<void>;
  listTeachings(): Promise<TeachingRecord[]>;
  saveTeaching(teaching: TeachingRecord): Promise<void>;
  deleteTeaching(id: string): Promise<void>;
  listAutomationRecipes(): Promise<AutomationRecipe[]>;
  saveAutomationRecipe(recipe: AutomationRecipe): Promise<void>;
  deleteAutomationRecipe(id: string): Promise<void>;
  clearAll(): Promise<void>;
}

export interface SupabaseRepositoryConfig {
  url: string;
  anonKey: string;
}
