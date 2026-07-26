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
import { getSupabaseBrowserClient } from "./supabase-client";

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
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<HeatherSettings>(createDefaultSettings());
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [teachings, setTeachings] = useState<TeachingRecord[]>([]);
  const [automationRecipes, setAutomationRecipes] = useState<AutomationRecipe[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const reload = useCallback(async () => {
    const [
      nextSettings,
      nextConversations,
      nextProjects,
      nextTeachings,
      nextAutomationRecipes
    ] = await Promise.all([
      db.getSettings(),
      db.listConversations(),
      db.listProjects(),
      db.listTeachings(),
      db.listAutomationRecipes()
    ]);

    setSettings(nextSettings);
    setConversations(sortByUpdated(nextConversations));
    setProjects(sortByUpdated(nextProjects));
    setMemories([]);
    setTeachings(sortByUpdated(nextTeachings));
    setAutomationRecipes(sortByUpdated(nextAutomationRecipes));
    setReady(true);
  }, [db]);

  const reloadMemories = useCallback(async (nextUser: User | null) => {
    if (!nextUser) { setMemories([]); return; }
    try {
      const [personal, research] = await Promise.all([memoryRepository.listPersonal(), memoryRepository.listPrivateResearch()]);
      setMemories(sortByUpdated([...personal, ...research]));
    } catch { setMemories([]); }
  }, [memoryRepository]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) { setAuthReady(true); return; }
    void client.auth.getUser().then(({ data }) => { setUser(data.user); setAuthReady(true); void reloadMemories(data.user); });
    const { data: listener } = client.auth.onAuthStateChange((_event, session) => { setUser(session?.user || null); setAuthReady(true); void reloadMemories(session?.user || null); });
    return () => listener.subscription.unsubscribe();
  }, [reloadMemories]);

  const saveSettings = useCallback(
    async (nextSettings: HeatherSettings) => {
      setSettings(nextSettings);
      await db.saveSettings(nextSettings);
    },
    [db]
  );

  const saveConversation = useCallback(
    async (conversation: Conversation) => {
      setConversations((current) => sortByUpdated(upsert(current, conversation)));
      await db.saveConversation(conversation);
    },
    [db]
  );

  const deleteConversation = useCallback(
    async (id: string) => {
      setConversations((current) => current.filter((conversation) => conversation.id !== id));
      await db.deleteConversation(id);
    },
    [db]
  );

  const saveProject = useCallback(
    async (project: ProjectRecord) => {
      setProjects((current) => sortByUpdated(upsert(current, project)));
      await db.saveProject(project);
    },
    [db]
  );

  const deleteProject = useCallback(
    async (id: string) => {
      setProjects((current) => current.filter((project) => project.id !== id));
      await db.deleteProject(id);
    },
    [db]
  );

  const saveMemory = useCallback(
    async (memory: MemoryRecord) => {
      const saved = memory.source.startsWith("research") || memory.type === "project_context" ? await memoryRepository.savePrivateResearch(memory) : await memoryRepository.savePersonal(memory);
      setMemories((current) => sortByUpdated(upsert(current, saved)));
    },
    [memoryRepository]
  );

  const deleteMemory = useCallback(
    async (id: string) => {
      const existing = memories.find((memory) => memory.id === id);
      if (existing?.source.startsWith("research") || existing?.type === "project_context") await memoryRepository.deleteResearch(id); else await memoryRepository.deletePersonal(id);
      setMemories((current) => current.filter((memory) => memory.id !== id));
    },
    [memories, memoryRepository]
  );

  const saveTeaching = useCallback(
    async (teaching: TeachingRecord) => {
      setTeachings((current) => sortByUpdated(upsert(current, teaching)));
      await db.saveTeaching(teaching);
    },
    [db]
  );

  const deleteTeaching = useCallback(
    async (id: string) => {
      setTeachings((current) => current.filter((teaching) => teaching.id !== id));
      await db.deleteTeaching(id);
    },
    [db]
  );

  const saveAutomationRecipe = useCallback(
    async (recipe: AutomationRecipe) => {
      setAutomationRecipes((current) => sortByUpdated(upsert(current, recipe)));
      await db.saveAutomationRecipe(recipe);
    },
    [db]
  );

  const deleteAutomationRecipe = useCallback(
    async (id: string) => {
      setAutomationRecipes((current) => current.filter((recipe) => recipe.id !== id));
      await db.deleteAutomationRecipe(id);
    },
    [db]
  );

  const clearAll = useCallback(async () => {
    await db.clearAll();
    await reload();
  }, [db, reload]);

  const signInWithGoogle = useCallback(async () => {
    const client = getSupabaseBrowserClient();
    if (!client) throw new Error("Supabase is not configured.");
    const { error } = await client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/auth/callback` } });
    if (error) throw error;
  }, []);
  const signOut = useCallback(async () => { const client = getSupabaseBrowserClient(); if (client) await client.auth.signOut(); }, []);

  return {
    ready,
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
    saveProject,
    deleteProject,
    saveMemory,
    deleteMemory,
    saveTeaching,
    deleteTeaching,
    saveAutomationRecipe,
    deleteAutomationRecipe,
    clearAll,
    reload
  };
}

function upsert<T extends { id: string }>(items: T[], item: T): T[] {
  const index = items.findIndex((candidate) => candidate.id === item.id);
  if (index === -1) return [item, ...items];

  const next = [...items];
  next[index] = item;
  return next;
}
