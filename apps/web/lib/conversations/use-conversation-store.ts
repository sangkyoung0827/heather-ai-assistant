"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ChatExecutionMode, Conversation, ConversationMessage } from "@heather/core";
import type { ConversationListItem, ConversationMessagePage, ConversationPage, ConversationType } from "./types";
import { getSupabaseBrowserClient } from "../supabase-client";
import { IndexedDbConversationRepository } from "../indexeddb-conversation-repository";

const PAGE_SIZE = 25;

export function useConversationStore(type: ConversationType) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const anonymousRepository = useMemo(() => new IndexedDbConversationRepository(), []);
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const activeConversationRef = useRef<Conversation | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [messagesCursor, setMessagesCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) {
      setAuthenticated(false);
      setAuthReady(true);
      return;
    }
    let active = true;
    const apply = (session: Awaited<ReturnType<typeof client.auth.getSession>>["data"]["session"]) => {
      if (!active) return;
      setAuthenticated(Boolean(session?.access_token));
      setAuthReady(true);
    };
    void client.auth.getSession().then(({ data }) => apply(data.session)).catch(() => apply(null));
    const { data: listener } = client.auth.onAuthStateChange((_event, session) => apply(session));
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  const setActive = useCallback((conversation: Conversation | null) => {
    activeConversationRef.current = conversation;
    setActiveConversation(conversation);
  }, []);

  const setConversationInUrl = useCallback((id: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (id) params.set("conversation", id); else params.delete("conversation");
    router.replace(params.size ? `${pathname}?${params.toString()}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const loadMessages = useCallback(async (id: string) => {
    if (!authenticated) {
      const conversation = await anonymousRepository.get(id, type);
      return { messages: conversation?.messages || [], nextCursor: null } satisfies ConversationMessagePage;
    }
    const response = await fetch(`/api/conversations/${encodeURIComponent(id)}/messages?type=${type}&limit=40`, {
      headers: await authorizationHeaders(),
      cache: "no-store"
    });
    if (!response.ok) throw new Error("Messages could not be loaded.");
    return response.json() as Promise<ConversationMessagePage>;
  }, [anonymousRepository, authenticated, type]);

  const reloadList = useCallback(async (search = "") => {
    if (!authReady) return [];
    if (!authenticated) {
      const query = search.trim().toLocaleLowerCase();
      const rows = (await anonymousRepository.list(type))
        .filter((conversation) => !query || `${conversation.title} ${conversation.messages.map((message) => message.content).join(" ")}`.toLocaleLowerCase().includes(query))
        .map((conversation) => toListItem(conversation, type));
      setConversations(rows);
      setNextCursor(null);
      return rows;
    }

    const response = await fetch(`/api/conversations?type=${type}&limit=${PAGE_SIZE}${search ? `&search=${encodeURIComponent(search)}` : ""}`, {
      headers: await authorizationHeaders(),
      cache: "no-store"
    });
    if (!response.ok) throw new Error("Conversations could not be loaded.");
    const data = await response.json() as ConversationPage;
    setConversations(data.conversations);
    setNextCursor(data.nextCursor);
    return data.conversations;
  }, [anonymousRepository, authReady, authenticated, type]);

  const selectConversation = useCallback(async (id: string | null, updateUrl = true) => {
    if (!id) {
      setActive(null);
      setMessagesCursor(null);
      if (updateUrl) setConversationInUrl(null);
      return;
    }
    const item = conversations.find((conversation) => conversation.id === id);
    if (!item) return;
    const page = await loadMessages(id);
    setActive({ ...item, messages: page.messages });
    setMessagesCursor(page.nextCursor);
    if (updateUrl) setConversationInUrl(id);
  }, [conversations, loadMessages, setActive, setConversationInUrl]);

  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;
    const wanted = searchParams.get("conversation");
    setLoading(true);
    setConversations([]);
    setActive(null);
    setNextCursor(null);
    setMessagesCursor(null);
    void reloadList().then(async (items) => {
      if (cancelled) return;
      const selected = wanted && items.some((item) => item.id === wanted) ? wanted : null;
      if (!selected) return;
      const page = await loadMessages(selected);
      if (cancelled) return;
      const item = items.find((candidate) => candidate.id === selected)!;
      setActive({ ...item, messages: page.messages });
      setMessagesCursor(page.nextCursor);
    }).catch(() => {
      if (!cancelled) {
        setConversations([]);
        setActive(null);
      }
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  // Storage is deliberately reset whenever authentication changes. Anonymous
  // IndexedDB records are never merged into the authenticated Supabase list.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, authenticated, type]);

  const reloadConversation = useCallback(async (id: string) => {
    if (!authenticated) {
      const conversation = await anonymousRepository.get(id, type);
      if (!conversation) throw new Error("Conversation was not found.");
      const item = toListItem(conversation, type);
      setConversations((current) => [item, ...current.filter((candidate) => candidate.id !== id)]);
      setActive(conversation);
      setMessagesCursor(null);
      setConversationInUrl(id);
      return;
    }
    const [conversationResponse, messagePage] = await Promise.all([
      fetch(`/api/conversations/${encodeURIComponent(id)}?type=${type}`, { headers: await authorizationHeaders(), cache: "no-store" }),
      loadMessages(id)
    ]);
    if (!conversationResponse.ok) throw new Error("Conversation was not found.");
    const { conversation } = await conversationResponse.json() as { conversation: ConversationListItem };
    setConversations((current) => [conversation, ...current.filter((item) => item.id !== id)]);
    setActive({ ...conversation, messages: messagePage.messages });
    setMessagesCursor(messagePage.nextCursor);
    setConversationInUrl(id);
  }, [anonymousRepository, authenticated, loadMessages, setActive, setConversationInUrl, type]);

  const refreshAfterSend = useCallback(async (id: string) => {
    if (authenticated) {
      await reloadConversation(id);
      await reloadList();
      return;
    }
    const current = activeConversationRef.current;
    if (!current) return;
    const now = new Date().toISOString();
    const persisted: Conversation = { ...current, id, conversationType: type, updatedAt: now };
    await anonymousRepository.save(persisted, type);
    const item = toListItem(persisted, type);
    setActive(persisted);
    setConversations((existing) => [item, ...existing.filter((conversation) => conversation.id !== id && conversation.id !== current.id)]);
    setConversationInUrl(id);
  }, [anonymousRepository, authenticated, reloadConversation, reloadList, setActive, setConversationInUrl, type]);

  const searchConversations = useCallback(async (search: string) => reloadList(search), [reloadList]);

  const loadMore = useCallback(async () => {
    if (!authenticated || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const response = await fetch(`/api/conversations?type=${type}&limit=${PAGE_SIZE}&cursor=${encodeURIComponent(nextCursor)}`, {
        headers: await authorizationHeaders(),
        cache: "no-store"
      });
      if (!response.ok) return;
      const page = await response.json() as ConversationPage;
      setConversations((current) => [...current, ...page.conversations.filter((item) => !current.some((existing) => existing.id === item.id))]);
      setNextCursor(page.nextCursor);
    } finally { setLoadingMore(false); }
  }, [authenticated, loadingMore, nextCursor, type]);

  const loadOlderMessages = useCallback(async () => {
    if (!authenticated || !activeConversation || !messagesCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const response = await fetch(`/api/conversations/${encodeURIComponent(activeConversation.id)}/messages?type=${type}&limit=40&before=${encodeURIComponent(messagesCursor)}`, {
        headers: await authorizationHeaders(),
        cache: "no-store"
      });
      if (!response.ok) return;
      const page = await response.json() as ConversationMessagePage;
      setActive(activeConversationRef.current ? { ...activeConversationRef.current, messages: [...page.messages, ...activeConversationRef.current.messages] } : null);
      setMessagesCursor(page.nextCursor);
    } finally { setLoadingMore(false); }
  }, [activeConversation, authenticated, loadingMore, messagesCursor, setActive, type]);

  const archiveConversation = useCallback(async (id: string) => {
    if (!authenticated) {
      await anonymousRepository.archive(id, type);
    } else {
      const response = await fetch(`/api/conversations/${encodeURIComponent(id)}?type=${type}`, {
        method: "DELETE",
        headers: await authorizationHeaders()
      });
      if (!response.ok) throw new Error("Conversation could not be archived.");
    }
    setConversations((current) => current.filter((item) => item.id !== id));
    if (activeConversationRef.current?.id === id) await selectConversation(null);
  }, [anonymousRepository, authenticated, selectConversation, type]);

  const setExecutionMode = useCallback(async (id: string, executionMode: ChatExecutionMode) => {
    if (!authenticated) {
      const current = await anonymousRepository.get(id, type);
      if (!current) return;
      const updated = { ...current, executionMode, executionModeUpdatedAt: new Date().toISOString() };
      await anonymousRepository.save(updated, type);
      setActive(activeConversationRef.current?.id === id ? updated : activeConversationRef.current);
      setConversations((items) => items.map((item) => item.id === id ? toListItem(updated, type) : item));
      return;
    }
    const response = await fetch(`/api/conversations/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { ...(await authorizationHeaders()), "Content-Type": "application/json" },
      body: JSON.stringify({ type, executionMode })
    });
    if (!response.ok) throw new Error("Conversation execution mode could not be updated.");
    const { conversation } = await response.json() as { conversation: ConversationListItem };
    setConversations((current) => current.map((item) => item.id === id ? conversation : item));
    if (activeConversationRef.current?.id === id) setActive({ ...activeConversationRef.current, executionMode: conversation.executionMode, executionModeUpdatedAt: conversation.executionModeUpdatedAt });
  }, [anonymousRepository, authenticated, setActive, type]);

  const applyOptimistic = useCallback((message: ConversationMessage) => {
    const current = activeConversationRef.current;
    const base: Conversation = current || {
      id: `pending-${message.id}`,
      title: type === "research" ? "새 연구 대화" : "새 대화",
      messages: [],
      createdAt: message.createdAt,
      updatedAt: message.createdAt,
      conversationType: type
    };
    const next = {
      ...base,
      title: base.messages.length ? base.title : message.content.slice(0, 48) || base.title,
      messages: [...base.messages, message],
      updatedAt: message.createdAt
    };
    setActive(next);
  }, [setActive, type]);

  return {
    conversations,
    activeConversation,
    loading: loading || !authReady,
    loadingMore,
    selectConversation,
    searchConversations,
    refreshAfterSend,
    archiveConversation,
    setExecutionMode,
    applyOptimistic,
    loadMore,
    loadOlderMessages,
    setNewConversation: () => selectConversation(null),
    activeConversationId: activeConversation?.id || null
  };
}

async function authorizationHeaders(): Promise<Record<string, string>> {
  const session = await getSupabaseBrowserClient()?.auth.getSession();
  const token = session?.data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function toListItem(conversation: Conversation, type: ConversationType): ConversationListItem {
  const lastMessage = conversation.messages[conversation.messages.length - 1];
  return {
    ...conversation,
    messages: [],
    preview: lastMessage?.content || "",
    lastMessageAt: lastMessage?.createdAt || conversation.updatedAt || conversation.createdAt,
    conversationType: type
  };
}
