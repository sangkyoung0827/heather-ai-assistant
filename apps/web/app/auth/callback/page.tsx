"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "../../../lib/supabase-client";

export default function AuthCallbackPage() {
  const router = useRouter(); const [message, setMessage] = useState("Signing you in...");
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
        window.history.replaceState({}, document.title, window.location.pathname);
        if (active) router.replace("/dashboard");
      } catch (error) {
        if (active) setMessage(error instanceof Error ? `Sign-in could not be completed: ${error.message}` : "Sign-in could not be completed. Please try again.");
      }
    }

    void completeSignIn();
    return () => { active = false; };
  }, [router]);
  return <main className="grid min-h-screen place-items-center bg-[#090a0d] text-slate-100"><p>{message}</p></main>;
}
