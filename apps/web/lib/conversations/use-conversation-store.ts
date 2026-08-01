"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Conversation, ConversationMessage } from "@heather/core";
import type { ConversationListItem, ConversationMessagePage, ConversationPage, ConversationType } from "./types";
import type { ChatExecutionMode } from "@heather/core";
import { getSupabaseBrowserClient } from "../supabase-client";

const PAGE_SIZE = 25;

export function useConversationStore(type: ConversationType) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [messagesCursor, setMessagesCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const setConversationInUrl = useCallback((id: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (id) params.set("conversation", id); else params.delete("conversation");
    router.replace(params.size ? `${pathname}?${params.toString()}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const loadMessages = useCallback(async (id: string) => {
    const response = await fetch(`/api/conversations/${encodeURIComponent(id)}/messages?type=${type}&limit=40`, { cache: "no-store" });
    if (!response.ok) throw new Error("Messages could not be loaded.");
    const data = await response.json() as ConversationMessagePage;
    return data;
  }, [type]);

  const selectConversation = useCallback(async (id: string | null, updateUrl = true) => {
    if (!id) {
      setActiveConversation(null);
      setMessagesCursor(null);
      if (updateUrl) setConversationInUrl(null);
      return;
    }
    const item = conversations.find((conversation) => conversation.id === id);
    if (!item) return;
    const page = await loadMessages(id);
    setActiveConversation({ ...item, messages: page.messages });
    setMessagesCursor(page.nextCursor);
    if (updateUrl) setConversationInUrl(id);
  }, [conversations, loadMessages, setConversationInUrl]);

  const reloadList = useCallback(async (search = "") => {
    const response = await fetch(`/api/conversations?type=${type}&limit=${PAGE_SIZE}${search ? `&search=${encodeURIComponent(search)}` : ""}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Conversations could not be loaded.");
    const data = await response.json() as ConversationPage;
    setConversations(data.conversations);
    setNextCursor(data.nextCursor);
    return data.conversations;
  }, [type]);

  useEffect(() => {
    let cancelled = false;
    const wanted = searchParams.get("conversation");
    void reloadList().then(async (items) => {
      if (cancelled) return;
      const selected = wanted && items.some((item) => item.id === wanted) ? wanted : null;
      if (selected) {
        const page = await loadMessages(selected);
        if (!cancelled) {
          const item = items.find((candidate) => candidate.id === selected)!;
          setActiveConversation({ ...item, messages: page.messages });
          setMessagesCursor(page.nextCursor);
        }
      } else if (!cancelled) {
        setActiveConversation(null);
        setMessagesCursor(null);
      }
    }).catch(() => { if (!cancelled) { setConversations([]); setActiveConversation(null); } }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  // The URL chooses the restored conversation; list reload itself is stable by type.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  const reloadConversation = useCallback(async (id: string) => {
    const [conversationResponse, messagePage] = await Promise.all([
      fetch(`/api/conversations/${encodeURIComponent(id)}?type=${type}`, { cache: "no-store" }),
      loadMessages(id)
    ]);
    if (!conversationResponse.ok) throw new Error("Conversation was not found.");
    const { conversation } = await conversationResponse.json() as { conversation: ConversationListItem };
    setConversations((current) => [conversation, ...current.filter((item) => item.id !== id)]);
    setActiveConversation({ ...conversation, messages: messagePage.messages });
    setMessagesCursor(messagePage.nextCursor);
    setConversationInUrl(id);
  }, [loadMessages, setConversationInUrl, type]);

  const refreshAfterSend = useCallback(async (id: string) => {
    await reloadConversation(id);
    await reloadList();
  }, [reloadConversation, reloadList]);

  const searchConversations = useCallback(async (search: string) => {
    return reloadList(search);
  }, [reloadList]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const response = await fetch(`/api/conversations?type=${type}&limit=${PAGE_SIZE}&cursor=${encodeURIComponent(nextCursor)}`, { cache: "no-store" });
      if (!response.ok) return;
      const page = await response.json() as ConversationPage;
      setConversations((current) => [...current, ...page.conversations.filter((item) => !current.some((existing) => existing.id === item.id))]);
      setNextCursor(page.nextCursor);
    } finally { setLoadingMore(false); }
  }, [loadingMore, nextCursor, type]);

  const loadOlderMessages = useCallback(async () => {
    if (!activeConversation || !messagesCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const response = await fetch(`/api/conversations/${encodeURIComponent(activeConversation.id)}/messages?type=${type}&limit=40&before=${encodeURIComponent(messagesCursor)}`, { cache: "no-store" });
      if (!response.ok) return;
      const page = await response.json() as ConversationMessagePage;
      setActiveConversation((current) => current ? { ...current, messages: [...page.messages, ...current.messages] } : current);
      setMessagesCursor(page.nextCursor);
    } finally { setLoadingMore(false); }
  }, [activeConversation, loadingMore, messagesCursor, type]);

  const archiveConversation = useCallback(async (id: string) => {
    const response = await fetch(`/api/conversations/${encodeURIComponent(id)}?type=${type}`, { method: "DELETE" });
    if (!response.ok) throw new Error("Conversation could not be archived.");
    setConversations((current) => current.filter((item) => item.id !== id));
    if (activeConversation?.id === id) await selectConversation(null);
  }, [activeConversation?.id, selectConversation, type]);

  const setExecutionMode = useCallback(async (id: string, executionMode: ChatExecutionMode) => {
    const session = await getSupabaseBrowserClient()?.auth.getSession();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (session?.data.session?.access_token) headers.Authorization = `Bearer ${session.data.session.access_token}`;
    const response = await fetch(`/api/conversations/${encodeURIComponent(id)}`, { method: "PATCH", headers, body: JSON.stringify({ type, executionMode }) });
    if (!response.ok) throw new Error("Conversation execution mode could not be updated.");
    const { conversation } = await response.json() as { conversation: ConversationListItem };
    setConversations((current) => current.map((item) => item.id === id ? conversation : item));
    setActiveConversation((current) => current?.id === id ? { ...current, executionMode: conversation.executionMode, executionModeUpdatedAt: conversation.executionModeUpdatedAt } : current);
  }, [type]);

  const applyOptimistic = useCallback((message: ConversationMessage) => {
    const base: Conversation = activeConversation || { id: `pending-${message.id}`, title: type === "research" ? "새 연구 대화" : "새 대화", messages: [], createdAt: message.createdAt, updatedAt: message.createdAt, conversationType: type };
    setActiveConversation({ ...base, title: base.messages.length ? base.title : message.content.slice(0, 48), messages: [...base.messages, message], updatedAt: message.createdAt });
  }, [activeConversation, type]);

  return { conversations, activeConversation, loading, loadingMore, selectConversation, searchConversations, refreshAfterSend, archiveConversation, setExecutionMode, applyOptimistic, loadMore, loadOlderMessages, setNewConversation: () => selectConversation(null), activeConversationId: activeConversation?.id || null };
}
