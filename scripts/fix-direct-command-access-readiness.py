from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: str, old: str, new: str) -> None:
    target = ROOT / path
    content = target.read_text(encoding="utf-8")
    if new in content:
        print(f"{path}: Direct Command readiness fix already applied")
        return
    count = content.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one Direct Command readiness target, found {count}")
    target.write_text(content.replace(old, new, 1), encoding="utf-8")


# Direct Command authorization has three states: checking, allowed, and denied.
# Route changes remount HeatherWorkspace. The temporary checking state must not
# be interpreted as a denial before the server access request has completed.
replace_once(
    "apps/web/lib/use-heather-data.ts",
    '  const [directCommandsAllowed, setDirectCommandsAllowed] = useState(false);\n',
    '  const [directCommandsAllowed, setDirectCommandsAllowed] = useState(false);\n  const [directCommandsReady, setDirectCommandsReady] = useState(false);\n',
)
replace_once(
    "apps/web/lib/use-heather-data.ts",
    '''    if (!client) {
      const generation = ++authGeneration.current;
      setUser(null);
      setMemories([]);
      setDirectCommandsAllowed(false);
      setAuthReady(true);
      setConversations([]);
      void reloadConversations(generation);
      return;
    }''',
    '''    if (!client) {
      const generation = ++authGeneration.current;
      setUser(null);
      setMemories([]);
      setDirectCommandsAllowed(false);
      setDirectCommandsReady(true);
      setAuthReady(true);
      setConversations([]);
      void reloadConversations(generation);
      return;
    }''',
)
replace_once(
    "apps/web/lib/use-heather-data.ts",
    '''      setUser(restoredUser);
      setMemories([]);
      setDirectCommandsAllowed(false);
      setAuthReady(true);''',
    '''      setUser(restoredUser);
      setMemories([]);
      setDirectCommandsAllowed(false);
      setDirectCommandsReady(!restoredUser);
      setAuthReady(true);''',
)
replace_once(
    "apps/web/lib/use-heather-data.ts",
    '''      if (restoredUser) void canAccessDirectCommands().then((allowed) => {
        if (active && generation === authGeneration.current) setDirectCommandsAllowed(allowed);
      }).catch(() => {
        if (active && generation === authGeneration.current) setDirectCommandsAllowed(false);
      });''',
    '''      if (restoredUser) void canAccessDirectCommands().then((allowed) => {
        if (!active || generation !== authGeneration.current) return;
        setDirectCommandsAllowed(allowed);
        setDirectCommandsReady(true);
      }).catch(() => {
        if (!active || generation !== authGeneration.current) return;
        setDirectCommandsAllowed(false);
        setDirectCommandsReady(true);
      });''',
)
replace_once(
    "apps/web/lib/use-heather-data.ts",
    '''    setConversations([]);
    setDirectCommandsAllowed(false);
    const client = getSupabaseBrowserClient();''',
    '''    setConversations([]);
    setDirectCommandsAllowed(false);
    setDirectCommandsReady(true);
    const client = getSupabaseBrowserClient();''',
)
replace_once(
    "apps/web/lib/use-heather-data.ts",
    '''    auth: { user, ready: authReady, configured: Boolean(getSupabaseBrowserClient()), directCommandsAllowed, signInWithGoogle, signOut },''',
    '''    auth: { user, ready: authReady, configured: Boolean(getSupabaseBrowserClient()), directCommandsAllowed, directCommandsReady, signInWithGoogle, signOut },''',
)
replace_once(
    "apps/web/components/heather/HeatherWorkspace.tsx",
    '''  useEffect(() => {
    if (data.auth.ready && workspace === "direct" && !data.auth.directCommandsAllowed) onNavigate("/dashboard");
  }, [data.auth.directCommandsAllowed, data.auth.ready, onNavigate, workspace]);
  if (workspace === "direct" && !data.auth.directCommandsAllowed) return null;''',
    '''  useEffect(() => {
    if (data.auth.ready && data.auth.directCommandsReady && workspace === "direct" && !data.auth.directCommandsAllowed) onNavigate("/dashboard");
  }, [data.auth.directCommandsAllowed, data.auth.directCommandsReady, data.auth.ready, onNavigate, workspace]);
  if (workspace === "direct" && !data.auth.directCommandsReady) return null;
  if (workspace === "direct" && !data.auth.directCommandsAllowed) return null;''',
)

print("Direct Command access readiness race fixed.")
