import type { Conversation, HeatherSettings, MemoryRecord, ProjectRecord } from "@heather/core";

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
  clearAll(): Promise<void>;
}

export interface SupabaseRepositoryConfig {
  url: string;
  anonKey: string;
}
