import type { Conversation, ConversationMessage } from "@heather/core";

export type ConversationType = "general" | "research";
export type StoredMessageStatus = "pending" | "completed" | "failed";

export type ConversationListItem = Omit<Conversation, "messages"> & {
  messages: ConversationMessage[];
  preview: string;
  lastMessageAt: string;
  conversationType: ConversationType;
};

export type ConversationPage = {
  conversations: ConversationListItem[];
  nextCursor: string | null;
};

export type ConversationMessagePage = {
  messages: ConversationMessage[];
  nextCursor: string | null;
};
