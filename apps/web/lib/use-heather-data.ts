"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AutomationRecipe,
  Conversation,
  HeatherSettings,
  MemoryRecord,
  ProjectRecord,
  TeachingRecord
} from "@heather/core";
import { BrowserHeatherDatabase, createDefaultSettings } from "@heather/db";
import type { User } from "@supabase/supabase-js";
import { SupabaseMemoryRepository } from "./memory-repository";
import { PersonalConversationRepository } from "./personal-conversation-repository";
import { getSupabaseBrowserClient } from "./supabase-client";
import { restoreHeatherSession, syncHeatherSession } from "./auth-session";

function sortByUpdated<T extends { updated_at?: string; updatedAt?: string; created_at?: string; createdAt?: string }>(
  items: T[]
): T[] {
  return [...items].sort((a, b) => {
    const aTime = a.updated_at || a.updatedAt || a.created_at || a.createdAt || "";
    const bTime = b.updated_at || b.updatedAt || b.created_at || b.createdAt || "";
    return bTime.localeCompare(aTime);
  });
}

export function useHeatherData() {
  const db = useMemo(() => new BrowserHeatherDatabase(), []);
  const memoryRepository = useMemo(() => new SupabaseMemoryRepository(), []);
  const conversationRepository = useMemo(() => new PersonalConversationRepository(), []);
  const [coreReady, setCoreReady] = useState(false);
  const [settings, setSettings] = useState<HeatherSettings>(createDefaultSettings());
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [teachings, setTeachings] = useState<TeachingRecord[]>([]);
  const [automationRecipes, setAutomationRecipes] = useState<AutomationRecipe[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const reloadCore = useCallback(async () => {
    const [nextSettings, nextProjects, nextTeachings, nextAutomationRecipes] = await Promise.all([
      db.getSettings(),
      db.listProjects(),
      db.listTeachings(),
      db.listAutomationRecipes()
    ]);

    setSettings(nextSettings);
    setProjects(sortByUpdated(nextProjects));
    setTeachings(sortByUpdated(nextTeachings));
    setAutomationRecipes(sortByUpdated(nextAutomationRecipes));
    setCoreReady(true);
  }, [db]);

  const reloadConversations = useCallback(async () => {
    try {
      setConversations(sortByUpdated(await conversationRepository.list()));
    } catch {
      setConversations([]);
    }
  }, [conversationRepository]);

  const reloadMemories = useCallback(async (nextUser: User | null) => {
    if (!nextUser) { setMemories([]); return; }
    try {
      const [personal, research] = await Promise.all([memoryRepository.listPersonal(), memoryRepository.listPrivateResearch()]);
      setMemories(sortByUpdated([...personal, ...research]));
    } catch { setMemories([]); }
  }, [memoryRepository]);

  useEffect(() => {
    void reloadCore();
  }, [reloadCore]);

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) {
      setUser(null);
      setAuthReady(true);
      setConversations([]);
      void reloadConversations();
      return;
    }

    let active = true;
    const applySession = (session: Awaited<ReturnType<typeof restoreHeatherSession>>) => {
      if (!active) return;
      const restoredUser = session?.user || null;
      setUser(restoredUser);
      setAuthReady(true);
      setConversations([]);
      void reloadConversations();
      void reloadMemories(restoredUser);
    };

    void restoreHeatherSession().then(applySession).catch(() => applySession(null));
    const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
      syncHeatherSession(session);
      applySession(session);
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, [reloadConversations, reloadMemories]);

  const saveSettings = useCallback(async (nextSettings: HeatherSettings) => {
    setSettings(nextSettings);
    await db.saveSettings(nextSettings);
  }, [db]);

  const saveConversation = useCallback(async (conversation: Conversation) => {
    setConversations((current) => sortByUpdated(upsert(current, conversation)));
    if (!user) await conversationRepository.save(conversation);
  }, [conversationRepository, user]);

  const deleteConversation = useCallback(async (id: string) => {
    setConversations((current) => current.filter((conversation) => conversation.id !== id));
    if (!user) await conversationRepository.archive(id);
  }, [conversationRepository, user]);

  const mergeConversations = useCallback(async (incoming: Conversation[]) => {
    setConversations(sortByUpdated(incoming));
  }, []);

  const saveProject = useCallback(async (project: ProjectRecord) => {
    setProjects((current) => sortByUpdated(upsert(current, project)));
    await db.saveProject(project);
  }, [db]);

  const deleteProject = useCallback(async (id: string) => {
    setProjects((current) => current.filter((project) => project.id !== id));
    await db.deleteProject(id);
  }, [db]);

  const saveMemory = useCallback(async (memory: MemoryRecord) => {
    const saved = memory.source.startsWith("research") || memory.type === "project_context"
      ? await memoryRepository.savePrivateResearch(memory)
      : await memoryRepository.savePersonal(memory);
    setMemories((current) => sortByUpdated(upsert(current, saved)));
  }, [memoryRepository]);

  const deleteMemory = useCallback(async (id: string) => {
    const existing = memories.find((memory) => memory.id === id);
    if (existing?.source.startsWith("research") || existing?.type === "project_context") await memoryRepository.deleteResearch(id);
    else await memoryRepository.deletePersonal(id);
    setMemories((current) => current.filter((memory) => memory.id !== id));
  }, [memories, memoryRepository]);

  const saveTeaching = useCallback(async (teaching: TeachingRecord) => {
    setTeachings((current) => sortByUpdated(upsert(current, teaching)));
    await db.saveTeaching(teaching);
  }, [db]);

  const deleteTeaching = useCallback(async (id: string) => {
    setTeachings((current) => current.filter((teaching) => teaching.id !== id));
    await db.deleteTeaching(id);
  }, [db]);

  const saveAutomationRecipe = useCallback(async (recipe: AutomationRecipe) => {
    setAutomationRecipes((current) => sortByUpdated(upsert(current, recipe)));
    await db.saveAutomationRecipe(recipe);
  }, [db]);

  const deleteAutomationRecipe = useCallback(async (id: string) => {
    setAutomationRecipes((current) => current.filter((recipe) => recipe.id !== id));
    await db.deleteAutomationRecipe(id);
  }, [db]);

  const clearAll = useCallback(async () => {
    await Promise.all([db.clearAll(), conversationRepository.clearAnonymous()]);
    setConversations([]);
    await reloadCore();
    if (!user) await reloadConversations();
  }, [conversationRepository, db, reloadConversations, reloadCore, user]);

  const signInWithGoogle = useCallback(async () => {
    const client = getSupabaseBrowserClient();
    if (!client) throw new Error("Supabase is not configured.");
    const { error } = await client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/auth/callback` } });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    const client = getSupabaseBrowserClient();
    if (client) await client.auth.signOut({ scope: "local" });
    syncHeatherSession(null);
  }, []);

  return {
    ready: coreReady && authReady,
    settings,
    conversations,
    projects,
    memories,
    teachings,
    automationRecipes,
    auth: { user, ready: authReady, configured: Boolean(getSupabaseBrowserClient()), signInWithGoogle, signOut },
    saveSettings,
    saveConversation,
    deleteConversation,
    mergeConversations,
    saveProject,
    deleteProject,
    saveMemory,
    deleteMemory,
    saveTeaching,
    deleteTeaching,
    saveAutomationRecipe,
    deleteAutomationRecipe,
    clearAll,
    reload: reloadCore
  };
}

function upsert<T extends { id: string }>(items: T[], item: T): T[] {
  const index = items.findIndex((candidate) => candidate.id === item.id);
  if (index === -1) return [item, ...items];
  const next = [...items];
  next[index] = item;
  return next;
}
