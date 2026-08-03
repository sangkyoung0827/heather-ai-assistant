import type { ChatExecutionMode, Conversation } from "@heather/core";
import { getSupabaseBrowserClient } from "./supabase-client";
import { IndexedDbConversationRepository } from "./indexeddb-conversation-repository";

export class PersonalConversationRepository {
  private readonly anonymous = new IndexedDbConversationRepository();

  async list(): Promise<Conversation[]> {
    const token = await this.accessToken();
    if (!token) return this.anonymous.list("general");

    const response = await fetch("/api/personal-conversations", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store"
    });
    const data = await response.json() as { conversations?: Conversation[]; error?: string };
    if (!response.ok) throw new Error(data.error || "Could not load personal conversations.");
    return data.conversations || [];
  }

  async save(conversation: Conversation): Promise<Conversation> {
    const token = await this.accessToken();
    if (!token) return this.anonymous.save(conversation, "general");

    const response = await fetch("/api/personal-conversations", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ conversation })
    });
    const data = await response.json() as { conversation?: Conversation; error?: string };
    if (!response.ok || !data.conversation) throw new Error(data.error || "Could not save personal conversation.");
    return data.conversation;
  }

  async archive(id: string) {
    const token = await this.accessToken();
    if (!token) return this.anonymous.archive(id, "general");
    if (!isUuid(id)) return;

    const response = await fetch("/api/personal-conversations", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
    if (!response.ok) throw new Error("Could not archive personal conversation.");
  }

  async setExecutionMode(id: string, executionMode: ChatExecutionMode) {
    const token = await this.accessToken();
    if (!token) {
      const conversation = await this.anonymous.get(id, "general");
      if (conversation) await this.anonymous.save({ ...conversation, executionMode, executionModeUpdatedAt: new Date().toISOString() }, "general");
      return;
    }
    if (!isUuid(id)) return;

    const response = await fetch("/api/personal-conversations", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id, executionMode })
    });
    if (!response.ok) throw new Error("Could not update the conversation execution mode.");
  }

  async clearAnonymous() {
    await this.anonymous.clear("general");
  }

  private async accessToken() {
    const session = await getSupabaseBrowserClient()?.auth.getSession();
    return session?.data.session?.access_token || null;
  }
}

function isUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
