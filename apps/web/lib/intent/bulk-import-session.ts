import { randomUUID } from "node:crypto";
import type { DirectCommandInput } from "./direct-command-repository";
import type { BulkPreviewItem, BulkPreviewSummary } from "./bulk-direct-command-import";

export type BulkImportSession = {
  id: string;
  ownerUserId: string;
  createdAt: number;
  inputs: Array<DirectCommandInput | null>;
  items: BulkPreviewItem[];
  summary: BulkPreviewSummary;
};

declare global {
  // eslint-disable-next-line no-var
  var heatherBulkImportSessions: Map<string, BulkImportSession> | undefined;
}

const sessions = globalThis.heatherBulkImportSessions ?? new Map<string, BulkImportSession>();
globalThis.heatherBulkImportSessions = sessions;
const TTL_MS = 15 * 60 * 1000;

export function storeBulkImportSession(session: Omit<BulkImportSession, "id" | "createdAt">) {
  clearExpiredSessions();
  const stored: BulkImportSession = { ...session, id: randomUUID(), createdAt: Date.now() };
  sessions.set(stored.id, stored);
  return stored;
}

export function takeBulkImportSession(id: string, ownerUserId: string) {
  clearExpiredSessions();
  const session = sessions.get(id);
  if (!session || session.ownerUserId !== ownerUserId) return null;
  sessions.delete(id);
  return session;
}

function clearExpiredSessions() {
  const now = Date.now();
  sessions.forEach((session, id) => {
    if (now - session.createdAt > TTL_MS) sessions.delete(id);
  });
}
