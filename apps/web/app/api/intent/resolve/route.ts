import { NextResponse } from "next/server";
import type { ChatRequestPayload } from "@heather/core";
import { DirectCommandRepository } from "../../../../lib/intent/direct-command-repository";
import { RepeatedQueryLearningService } from "../../../../lib/intent/repeated-query-learning";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as ChatRequestPayload;
    if (!payload.message?.trim()) return NextResponse.json({ error: "Message is required." }, { status: 400 });
    const repository = new DirectCommandRepository();
    const match = await repository.find(payload.message);
    if (match) {
      await repository.incrementUsage(match.command.id);
      await repository.logIntent("direct_command", payload.message, match.command.id);
      return NextResponse.json({
        message: match.command.response,
        title: match.command.canonicalTrigger,
        risk: { level: "low", requiresConfirmation: false, reason: "Saved direct command." },
        provider: "direct-command",
        model: "server",
        result: "direct_command"
      });
    }

    const fallbackResponse = await fetch(new URL("/api/chat", request.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store"
    });
    const fallback = await fallbackResponse.json() as { message?: string; error?: string; [key: string]: unknown };
    if (!fallbackResponse.ok || !fallback.message) return NextResponse.json(fallback, { status: fallbackResponse.status || 502 });

    // Learning is best-effort post-processing; it must never delay or fail the user's answer.
    await new RepeatedQueryLearningService(repository).recordSuccessfulFallback({ message: payload.message, response: fallback.message, messageId: payload.messageId }).catch(() => undefined);
    await repository.logIntent("fallback", payload.message);
    return NextResponse.json({ ...fallback, result: "fallback" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Intent request failed." }, { status: 500 });
  }
}
