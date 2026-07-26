import { NextResponse } from "next/server";
import { ConversationRepository, createConversationTitle } from "../../../../lib/conversations/repository";

export const runtime = "nodejs";

type Body = {
  message?: string;
  clientMessageId?: string;
  conversationId?: string;
  response?: { message?: string; provider?: string; model?: string };
};

export async function POST(request: Request) {
  try {
    const body = await request.json() as Body;
    if (!body.message?.trim() || !body.clientMessageId || !body.response?.message?.trim()) return NextResponse.json({ error: "Invalid conversation completion." }, { status: 400 });
    const repository = new ConversationRepository();
    const turn = await repository.beginMessage({ conversationId: body.conversationId, type: "general", title: createConversationTitle(body.message, "general"), content: body.message, clientMessageId: body.clientMessageId });
    const existing = turn.duplicate ? await repository.findCompletedAssistant(turn.conversation.id, body.clientMessageId) : null;
    const assistant = existing || await repository.appendAssistant({ conversationId: turn.conversation.id, content: body.response.message, source: body.response.provider === "desktop" ? "system" : "system", replyTo: body.clientMessageId, metadata: { provider: body.response.provider || "system", model: body.response.model } });
    return NextResponse.json({ conversationId: turn.conversation.id, userMessageId: turn.userMessage.id, assistantMessageId: assistant.id, duplicate: Boolean(existing) });
  } catch {
    return NextResponse.json({ error: "대화 저장을 완료하지 못했습니다." }, { status: 502 });
  }
}
