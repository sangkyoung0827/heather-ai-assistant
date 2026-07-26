"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "../../../lib/supabase-client";

export default function AuthCallbackPage() {
  const router = useRouter(); const [message, setMessage] = useState("Signing you in...");
  useEffect(() => { const params = new URLSearchParams(window.location.search); const client = getSupabaseBrowserClient(); const code = params.get("code"); if (params.get("error") || !client || !code) { setMessage(params.get("error_description") || "Sign-in was cancelled or could not be completed."); return; } void client.auth.exchangeCodeForSession(code).then(({ error }) => { if (error) { setMessage("Sign-in could not be completed."); return; } router.replace("/memory/personal"); }); }, [router]);
  return <main className="grid min-h-screen place-items-center bg-[#090a0d] text-slate-100"><p>{message}</p></main>;
}
