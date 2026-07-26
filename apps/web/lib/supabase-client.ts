import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

export function isSupabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function getSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) return null;

  if (!browserClient) {
    browserClient = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        storage: {
          getItem: (key) => document.cookie.split("; ").find((entry) => entry.startsWith(`${encodeURIComponent(key)}=`))?.split("=").slice(1).join("=") ? decodeURIComponent(document.cookie.split("; ").find((entry) => entry.startsWith(`${encodeURIComponent(key)}=`))!.split("=").slice(1).join("=")) : null,
          setItem: (key, value) => { document.cookie = `${encodeURIComponent(key)}=${encodeURIComponent(value)}; Path=/; SameSite=Lax; Secure; Max-Age=31536000`; },
          removeItem: (key) => { document.cookie = `${encodeURIComponent(key)}=; Path=/; SameSite=Lax; Secure; Max-Age=0`; }
        }
      }
    });
  }

  return browserClient;
}
