from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "apps/web/lib/use-heather-data.ts"
content = PATH.read_text(encoding="utf-8")


def replace_once(old: str, new: str) -> None:
    global content
    if new in content:
        return
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f"Expected one account-session security pattern, found {count}: {old[:180]}")
    content = content.replace(old, new, 1)


replace_once(
    'import { useCallback, useEffect, useMemo, useState } from "react";',
    'import { useCallback, useEffect, useMemo, useRef, useState } from "react";'
)

replace_once(
    '''  const [authReady, setAuthReady] = useState(false);
  const [directCommandsAllowed, setDirectCommandsAllowed] = useState(false);''',
    '''  const [authReady, setAuthReady] = useState(false);
  const [directCommandsAllowed, setDirectCommandsAllowed] = useState(false);
  // Every authentication transition invalidates earlier asynchronous reads.
  // A result from account A can therefore never overwrite account B's state.
  const authGeneration = useRef(0);'''
)

replace_once(
    '''  const reloadConversations = useCallback(async () => {
    try {
      setConversations(sortByUpdated(await conversationRepository.list()));
    } catch {
      setConversations([]);
    }
  }, [conversationRepository]);''',
    '''  const reloadConversations = useCallback(async (generation = authGeneration.current) => {
    try {
      const next = sortByUpdated(await conversationRepository.list());
      if (generation === authGeneration.current) setConversations(next);
    } catch {
      if (generation === authGeneration.current) setConversations([]);
    }
  }, [conversationRepository]);'''
)

replace_once(
    '''  const reloadMemories = useCallback(async (nextUser: User | null) => {
    if (!nextUser) { setMemories([]); return; }
    try {
      const [personal, research] = await Promise.all([memoryRepository.listPersonal(), memoryRepository.listPrivateResearch()]);
      setMemories(sortByUpdated([...personal, ...research]));
    } catch { setMemories([]); }
  }, [memoryRepository]);''',
    '''  const reloadMemories = useCallback(async (nextUser: User | null, generation = authGeneration.current) => {
    if (!nextUser) {
      if (generation === authGeneration.current) setMemories([]);
      return;
    }
    try {
      const [personal, research] = await Promise.all([memoryRepository.listPersonal(), memoryRepository.listPrivateResearch()]);
      if (generation === authGeneration.current) setMemories(sortByUpdated([...personal, ...research]));
    } catch {
      if (generation === authGeneration.current) setMemories([]);
    }
  }, [memoryRepository]);'''
)

replace_once(
    '''    if (!client) {
      setUser(null);
      setDirectCommandsAllowed(false);
      setAuthReady(true);
      setConversations([]);
      void reloadConversations();
      return;
    }''',
    '''    if (!client) {
      const generation = ++authGeneration.current;
      setUser(null);
      setMemories([]);
      setDirectCommandsAllowed(false);
      setAuthReady(true);
      setConversations([]);
      void reloadConversations(generation);
      return;
    }'''
)

replace_once(
    '''    const applySession = (session: Awaited<ReturnType<typeof restoreHeatherSession>>) => {
      if (!active) return;
      const restoredUser = session?.user || null;
      setUser(restoredUser);
      setDirectCommandsAllowed(false);
      setAuthReady(true);
      setConversations([]);
      void reloadConversations();
      void reloadMemories(restoredUser);
      if (restoredUser) void canAccessDirectCommands().then((allowed) => { if (active) setDirectCommandsAllowed(allowed); }).catch(() => { if (active) setDirectCommandsAllowed(false); });
    };''',
    '''    const applySession = (session: Awaited<ReturnType<typeof restoreHeatherSession>>) => {
      if (!active) return;
      const generation = ++authGeneration.current;
      const restoredUser = session?.user || null;
      // Clear account-bound state synchronously before any new account request.
      setUser(restoredUser);
      setMemories([]);
      setDirectCommandsAllowed(false);
      setAuthReady(true);
      setConversations([]);
      void reloadConversations(generation);
      void reloadMemories(restoredUser, generation);
      if (restoredUser) void canAccessDirectCommands().then((allowed) => {
        if (active && generation === authGeneration.current) setDirectCommandsAllowed(allowed);
      }).catch(() => {
        if (active && generation === authGeneration.current) setDirectCommandsAllowed(false);
      });
    };'''
)

replace_once(
    '''  const signOut = useCallback(async () => {
    const client = getSupabaseBrowserClient();
    if (client) await client.auth.signOut({ scope: "local" });
    syncHeatherSession(null);
    setDirectCommandsAllowed(false);
  }, []);''',
    '''  const signOut = useCallback(async () => {
    ++authGeneration.current;
    setUser(null);
    setMemories([]);
    setConversations([]);
    setDirectCommandsAllowed(false);
    const client = getSupabaseBrowserClient();
    if (client) await client.auth.signOut({ scope: "local" });
    syncHeatherSession(null);
  }, []);'''
)

PATH.write_text(content, encoding="utf-8")
print("Account-session memory isolation patch applied.")
