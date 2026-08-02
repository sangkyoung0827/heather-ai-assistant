"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "../../../lib/supabase-client";
import { syncHeatherSession } from "../../../lib/auth-session";
import { HEATHER_AUTH_RETURN_KEY } from "../../../components/auth/AuthReturnTracker";

function safeReturnPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/auth/")) return "/dashboard";
  return value;
}

export default function AuthCallbackPage() {
  const [message, setMessage] = useState("Signing you in...");
  useEffect(() => {
    let active = true;

    async function completeSignIn() {
      const params = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.slice(1));
      const code = params.get("code");
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      const providerError = params.get("error_description") || hashParams.get("error_description");
      const client = getSupabaseBrowserClient();
      if (params.get("error") || hashParams.get("error") || !client) {
        if (active) setMessage(providerError || "Sign-in was cancelled or could not be completed.");
        return;
      }

      try {
        if (code) {
          const { error } = await client.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (accessToken && refreshToken) {
          // Preserve compatibility with an OAuth response already using the implicit flow.
          const { error } = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          if (error) throw error;
        } else {
          const { data, error } = await client.auth.getSession();
          if (error || !data.session) throw error || new Error("No session returned from OAuth.");
        }
        const { data: persisted, error: persistedError } = await client.auth.getSession();
        if (persistedError || !persisted.session) throw persistedError || new Error("No saved session was available after OAuth.");
        syncHeatherSession(persisted.session);
        const returnTo = safeReturnPath(window.sessionStorage.getItem(HEATHER_AUTH_RETURN_KEY));
        window.sessionStorage.removeItem(HEATHER_AUTH_RETURN_KEY);
        window.history.replaceState({}, document.title, window.location.pathname);
        // A full navigation makes the destination workspace initialize from the persisted session.
        if (active) window.location.replace(returnTo);
      } catch (error) {
        if (active) setMessage(error instanceof Error ? `Sign-in could not be completed: ${error.message}` : "Sign-in could not be completed. Please try again.");
      }
    }

    void completeSignIn();
    return () => { active = false; };
  }, []);
  return <main className="grid min-h-screen place-items-center bg-[#090a0d] text-slate-100"><p>{message}</p></main>;
}
