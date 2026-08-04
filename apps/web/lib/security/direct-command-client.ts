"use client";

import { getSupabaseBrowserClient } from "../supabase-client";

export async function directCommandAuthorizationHeaders(): Promise<Record<string, string>> {
  const client = getSupabaseBrowserClient();
  const session = await client?.auth.getSession();
  const token = session?.data.session?.access_token;
  if (!token) throw new Error("Not found.");
  return { Authorization: `Bearer ${token}` };
}

export async function canAccessDirectCommands(): Promise<boolean> {
  try {
    const headers = await directCommandAuthorizationHeaders();
    const response = await fetch("/api/direct-commands/access", { headers, cache: "no-store" });
    return response.ok;
  } catch {
    return false;
  }
}
