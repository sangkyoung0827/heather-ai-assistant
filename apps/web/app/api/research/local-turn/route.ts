import { NextResponse } from "next/server";
import type { ChatExecutionMetadata, ChatRequestPayload } from "@heather/core";
import { requireContextUser } from "../../../../lib/context-control/server";
import { ConversationRepository, createConversationTitle } from "../../../../lib/conversations/repository";

export const runtime = "nodejs";

type EmbeddedResponse = {
  message?: string;
  title?: string;
  provider?: string;
  model?: string;
  execution?: ChatExecutionMetadata;
};

export async function POST(request: Request) {
  try {
    const context = await requireContextUser(request);
    const body = await request.json() as { payload?: ChatRequestPayload; response?: EmbeddedResponse };
    const payload = body.payload;
    const response = body.response;
    const clientMessageId = payload?.clientMessageId || payload?.messageId;

    if (!payload?.message?.trim() || !clientMessageId || !response?.message?.trim()) {
      return NextResponse.json({ error: "Invalid local research turn." }, { status: 400 });
    }
    if (
      payload.executionMode !== "HEATHER_BASIC"
      || response.provider !== "embedded-ollama"
      || response.execution?.actualExecutionMode !== "HEATHER_BASIC"
      || !response.execution.localEngineUsed
      || response.execution.externalLlmUsed
    ) {
      return NextResponse.json({ error: "Only verified Heather embedded-engine turns can use this endpoint." }, { status: 400 });
    }

    const conversations = new ConversationRepository();
    const turn = payload.messageAlreadyPersisted && payload.conversationId
      ? await conversations.getStoredTurn({
          conversationId: payload.conversationId,
          type: "research",
          clientMessageId
        })
      : await conversations.beginMessage({
          conversationId: payload.conversationId,
          type: "research",
          title: createConversationTitle(payload.message, "research"),
          content: payload.message,
          clientMessageId,
          executionMode: "HEATHER_BASIC",
          ownerId: payload.conversationId ? undefined : context.user.id
        });

    if (turn.duplicate) {
      const previous = await conversations.findCompletedAssistant(turn.conversation.id, clientMessageId);
      if (previous) {
        return NextResponse.json({
          conversationId: turn.conversation.id,
          userMessageId: turn.userMessage.id,
          assistantMessageId: previous.id,
          title: turn.conversation.title,
          duplicate: true
        });
      }
      return NextResponse.json({ error: "This message is already being processed." }, { status: 409 });
    }

    const assistant = await conversations.appendAssistant({
      conversationId: turn.conversation.id,
      content: response.message,
      source: "heather-basic",
      replyTo: clientMessageId,
      metadata: {
        provider: "embedded-ollama",
        model: response.model,
        requested_execution_mode: "HEATHER_BASIC",
        actual_execution_mode: "HEATHER_BASIC",
        local_engine_used: true,
        external_llm_used: false,
        duration_ms: response.execution.durationMs
      }
    });

    return NextResponse.json({
      conversationId: turn.conversation.id,
      userMessageId: turn.userMessage.id,
      assistantMessageId: assistant.id,
      title: response.title || turn.conversation.title,
      duplicate: false
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Local research turn could not be saved." },
      { status: 400 }
    );
  }
}
