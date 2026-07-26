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
      const client = getSupabaseBrowserClient();
      const code = params.get("code");
      if (params.get("error") || !client) {
        if (active) setMessage(params.get("error_description") || "Sign-in was cancelled or could not be completed.");
        return;
      }

      try {
        if (code) {
          const { error } = await client.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else {
          // Implicit OAuth returns tokens in the URL hash. Supabase initializes that session on the client.
          const { data, error } = await client.auth.getSession();
          if (error || !data.session) throw error || new Error("No session returned from OAuth.");
        }
        if (active) router.replace("/memory/personal");
      } catch {
        if (active) setMessage("Sign-in could not be completed. Please try again.");
      }
    }

    void completeSignIn();
    return () => { active = false; };
  }, [router]);
  return <main className="grid min-h-screen place-items-center bg-[#090a0d] text-slate-100"><p>{message}</p></main>;
}
