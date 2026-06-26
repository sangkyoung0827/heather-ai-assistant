"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  Conversation,
  HeatherSettings,
  MemoryRecord,
  ProjectRecord,
  TeachingRecord
} from "@heather/core";
import { BrowserHeatherDatabase, createDefaultSettings } from "@heather/db";

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
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<HeatherSettings>(createDefaultSettings());
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [teachings, setTeachings] = useState<TeachingRecord[]>([]);

  const reload = useCallback(async () => {
    const [nextSettings, nextConversations, nextProjects, nextMemories, nextTeachings] = await Promise.all([
      db.getSettings(),
      db.listConversations(),
      db.listProjects(),
      db.listMemories(),
      db.listTeachings()
    ]);

    setSettings(nextSettings);
    setConversations(sortByUpdated(nextConversations));
    setProjects(sortByUpdated(nextProjects));
    setMemories(sortByUpdated(nextMemories));
    setTeachings(sortByUpdated(nextTeachings));
    setReady(true);
  }, [db]);

  useEffect(() => {
    void reload();
  }, [reload]);

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
      setMemories((current) => sortByUpdated(upsert(current, memory)));
      await db.saveMemory(memory);
    },
    [db]
  );

  const deleteMemory = useCallback(
    async (id: string) => {
      setMemories((current) => current.filter((memory) => memory.id !== id));
      await db.deleteMemory(id);
    },
    [db]
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

  const clearAll = useCallback(async () => {
    await db.clearAll();
    await reload();
  }, [db, reload]);

  return {
    ready,
    settings,
    conversations,
    projects,
    memories,
    teachings,
    saveSettings,
    saveConversation,
    deleteConversation,
    saveProject,
    deleteProject,
    saveMemory,
    deleteMemory,
    saveTeaching,
    deleteTeaching,
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
