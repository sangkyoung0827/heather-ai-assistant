import { NextResponse } from "next/server";
import type { ChatRequestPayload } from "@heather/core";
import { requireContextUser } from "../../../../../lib/context-control/server";
import { retrieveDocumentMemoryContext } from "../../../../../lib/documents/server";
import { DirectCommandRepository } from "../../../../../lib/intent/direct-command-repository";
import { executeDirectCommandAction } from "../../../../../lib/intent/direct-command-skill-executor";
import { formatResearchResponse } from "../../../../../lib/research/response";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as ChatRequestPayload;
    if (!payload.message?.trim()) {
      return NextResponse.json({ error: "Message is required." }, { status: 400 });
    }
    if (payload.executionMode !== "HEATHER_BASIC") {
      return NextResponse.json({ error: "Browser context is only available for Heather Basic." }, { status: 400 });
    }

    const context = await requireContextUser(request);
    const directCommands = new DirectCommandRepository();
    const directMatch = await directCommands.find(payload.message).catch(() => null);
    if (directMatch) {
      const action = await executeDirectCommandAction({
        request,
        command: directMatch.command,
        message: payload.message,
        chatType: "research",
        signal: request.signal
      });
      await directCommands.incrementUsage(directMatch.command.id).catch(() => undefined);
      await directCommands.logIntent("direct_command", payload.message, directMatch.command.id).catch(() => undefined);
      return NextResponse.json({
        kind: "direct",
        response: {
          message: formatResearchResponse(action.message),
          title: directMatch.command.canonicalTrigger,
          risk: {
            level: "low",
            requiresConfirmation: false,
            reason: action.skillId ? "Allowlisted direct command skill." : "Saved direct command."
          },
          provider: action.provider,
          model: action.model || "server"
        }
      });
    }

    let memories = payload.memories;
    try {
      const documents = await retrieveDocumentMemoryContext(context, "research", payload.message);
      if (documents.length) memories = [...documents, ...memories].slice(0, 16);
    } catch {
      // Browser-local research remains available with the context already supplied by the client.
    }

    return NextResponse.json({ kind: "context", memories });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Research context could not be prepared." },
      { status: 400 }
    );
  }
}
