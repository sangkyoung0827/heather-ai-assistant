import type { ChatExecutionMode, Conversation } from "@heather/core";
import { getSupabaseBrowserClient } from "./supabase-client";

export class PersonalConversationRepository {
  async list(): Promise<Conversation[]> {
    const response = await fetch("/api/personal-conversations", { headers: await this.headers(), cache: "no-store" });
    const data = await response.json() as { conversations?: Conversation[]; error?: string };
    if (!response.ok) throw new Error(data.error || "Could not load personal conversations.");
    return data.conversations || [];
  }

  async save(conversation: Conversation): Promise<Conversation> {
    const response = await fetch("/api/personal-conversations", { method: "POST", headers: { ...(await this.headers()), "Content-Type": "application/json" }, body: JSON.stringify({ conversation }) });
    const data = await response.json() as { conversation?: Conversation; error?: string };
    if (!response.ok || !data.conversation) throw new Error(data.error || "Could not save personal conversation.");
    return data.conversation;
  }

  async archive(id: string) {
    if (!isUuid(id)) return;
    const response = await fetch("/api/personal-conversations", { method: "PATCH", headers: { ...(await this.headers()), "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    if (!response.ok) throw new Error("Could not archive personal conversation.");
  }

  async setExecutionMode(id: string, executionMode: ChatExecutionMode) {
    if (!isUuid(id)) return;
    const response = await fetch("/api/personal-conversations", { method: "PATCH", headers: { ...(await this.headers()), "Content-Type": "application/json" }, body: JSON.stringify({ id, executionMode }) });
    if (!response.ok) throw new Error("Could not update the conversation execution mode.");
  }

  private async headers() {
    const session = await getSupabaseBrowserClient()?.auth.getSession();
    if (!session?.data.session?.access_token) throw new Error("Sign in is required.");
    return { Authorization: `Bearer ${session.data.session.access_token}` };
  }
}

function isUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
