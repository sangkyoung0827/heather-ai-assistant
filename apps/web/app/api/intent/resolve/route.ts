import { NextResponse } from "next/server";
import type { ChatRequestPayload } from "@heather/core";
import { DirectCommandRepository } from "../../../../lib/intent/direct-command-repository";
import { RepeatedQueryLearningService } from "../../../../lib/intent/repeated-query-learning";
import { ConversationRepository, createConversationTitle } from "../../../../lib/conversations/repository";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let turn: Awaited<ReturnType<ConversationRepository["beginMessage"]>> | null = null;
  let payload: ChatRequestPayload | null = null;
  try {
    payload = await request.json() as ChatRequestPayload;
    if (!payload.message?.trim()) return NextResponse.json({ error: "Message is required." }, { status: 400 });
    const clientMessageId = payload.clientMessageId || payload.messageId;
    if (!clientMessageId) return NextResponse.json({ error: "clientMessageId is required." }, { status: 400 });
    const conversations = new ConversationRepository();
    const resolvedTurn = payload.messageAlreadyPersisted && payload.conversationId
      ? await conversations.getStoredTurn({ conversationId: payload.conversationId, type: "general", clientMessageId })
      : await conversations.beginMessage({ conversationId: payload.conversationId, type: "general", title: createConversationTitle(payload.message, "general"), content: payload.message, clientMessageId });
    turn = resolvedTurn;
    if (!payload.messageAlreadyPersisted && resolvedTurn.duplicate) {
      const previous = await conversations.findCompletedAssistant(resolvedTurn.conversation.id, clientMessageId);
      if (previous) return NextResponse.json({ message: previous.content, title: resolvedTurn.conversation.title, provider: previous.provider, model: previous.model, conversationId: resolvedTurn.conversation.id, userMessageId: resolvedTurn.userMessage.id, assistantMessageId: previous.id, duplicate: true });
      return NextResponse.json({ error: "이 메시지는 이미 처리 중입니다. 잠시 후 대화를 다시 열어주세요.", conversationId: resolvedTurn.conversation.id }, { status: 409 });
    }
    const repository = new DirectCommandRepository();
    const match = await repository.find(payload.message);
    if (match) {
      await repository.incrementUsage(match.command.id);
      await repository.logIntent("direct_command", payload.message, match.command.id);
      const assistant = await conversations.appendAssistant({ conversationId: turn.conversation.id, content: match.command.response, source: "direct_command", replyTo: clientMessageId, metadata: { provider: "direct-command" } });
      return NextResponse.json({
        message: match.command.response,
        title: match.command.canonicalTrigger,
        risk: { level: "low", requiresConfirmation: false, reason: "Saved direct command." },
        provider: "direct-command",
        model: "server",
        result: "direct_command",
        conversationId: turn.conversation.id,
        userMessageId: turn.userMessage.id,
        assistantMessageId: assistant.id
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
    const assistant = await conversations.appendAssistant({ conversationId: turn.conversation.id, content: fallback.message, source: "deepseek", replyTo: clientMessageId, metadata: { provider: fallback.provider, model: fallback.model } });
    return NextResponse.json({ ...fallback, result: "fallback", conversationId: turn.conversation.id, userMessageId: turn.userMessage.id, assistantMessageId: assistant.id });
  } catch (error) {
    if (turn && payload) {
      await new ConversationRepository().appendAssistant({ conversationId: turn.conversation.id, content: "지금 응답을 완성하지 못했어요. 잠시 후 다시 시도해주세요.", source: "system", status: "failed", replyTo: payload.clientMessageId || payload.messageId || "unknown" }).catch(() => undefined);
    }
    return NextResponse.json({ error: "Heather 응답을 준비하지 못했습니다. 잠시 후 다시 시도하세요.", conversationId: turn?.conversation.id }, { status: 502 });
  }
}
