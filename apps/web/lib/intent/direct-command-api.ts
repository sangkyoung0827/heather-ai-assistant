import type { DirectCommandRecord } from "./direct-command-repository";
import { HeatherOwnerAccessError } from "../security/heather-owner";

export function toPublicCommand(command: DirectCommandRecord) {
  return { id: command.id, title: command.title, canonicalTrigger: command.canonicalTrigger, triggers: command.triggers, response: command.response, enabled: command.enabled, tags: command.tags, createdBy: command.createdBy, createdAt: command.createdAt, updatedAt: command.updatedAt };
}

export function errorResponse(error: unknown) {
  const status = error instanceof HeatherOwnerAccessError ? error.status : 400;
  const message = error instanceof HeatherOwnerAccessError ? "Not found." : error instanceof Error ? error.message : "Direct command request failed.";
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}
