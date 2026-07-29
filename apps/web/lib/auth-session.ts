import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "./supabase-client";

let cachedSession: Session | null | undefined;
let restorePromise: Promise<Session | null> | null = null;

/**
 * Restores the browser-persisted Supabase session once per app runtime.
 * A near-expiry token is refreshed before protected pages decide to show a sign-in gate.
 */
export async function restoreHeatherSession(): Promise<Session | null> {
  if (cachedSession !== undefined) return cachedSession;
  if (restorePromise) return restorePromise;

  restorePromise = (async () => {
    const client = getSupabaseBrowserClient();
    if (!client) return null;
    const { data } = await client.auth.getSession();
    let session = data.session;
    const expiresSoon = session?.expires_at && session.expires_at * 1000 - Date.now() < 90_000;
    if (session && expiresSoon) {
      const refreshed = await client.auth.refreshSession();
      // Keep the persisted session if a temporary refresh failure occurs offline.
      session = refreshed.data.session || session;
    }
    cachedSession = session;
    return session;
  })().finally(() => { restorePromise = null; });

  return restorePromise;
}

export function syncHeatherSession(session: Session | null) {
  cachedSession = session;
}
