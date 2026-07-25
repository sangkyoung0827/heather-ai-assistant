import type { DirectCommandRecord } from "./direct-command-repository";

export function toPublicCommand(command: DirectCommandRecord) {
  return { id: command.id, title: command.title, canonicalTrigger: command.canonicalTrigger, triggers: command.triggers, response: command.response, enabled: command.enabled, tags: command.tags, createdBy: command.createdBy, createdAt: command.createdAt, updatedAt: command.updatedAt };
}

export function errorResponse(error: unknown) {
  return Response.json({ error: error instanceof Error ? error.message : "Direct command request failed." }, { status: 400 });
}
