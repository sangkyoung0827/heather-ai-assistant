import { NextResponse } from "next/server";
import { generateConversationTitle } from "@heather/core";
import type { ChatRequestPayload } from "@heather/core";
import { resolveModelProfile } from "../../../../lib/llm/config";
import { LlmProviderError } from "../../../../lib/llm/errors";
import { isValidChatPayload } from "../../../../lib/llm/messages";
import { generateForModelRole } from "../../../../lib/llm/service";
import { buildResearchContext } from "../../../../lib/research/context";
import { ConversationRepository, createConversationTitle } from "../../../../lib/conversations/repository";
import { runMatchedSkill } from "../../../../lib/skills/agent-runtime";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let turn: Awaited<ReturnType<ConversationRepository["beginMessage"]>> | null = null;
  let payload: ChatRequestPayload | null = null;
  try {
    payload = await request.json() as ChatRequestPayload;
    const validationError = isValidChatPayload(payload);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
    const clientMessageId = payload.clientMessageId || payload.messageId;
    if (!clientMessageId) return NextResponse.json({ error: "clientMessageId is required." }, { status: 400 });
    const conversations = new ConversationRepository();
    turn = payload.messageAlreadyPersisted && payload.conversationId
      ? await conversations.getStoredTurn({ conversationId: payload.conversationId, type: "research", clientMessageId })
      : await conversations.beginMessage({ conversationId: payload.conversationId, type: "research", title: createConversationTitle(payload.message, "research"), content: payload.message, clientMessageId });
    if (turn.duplicate) {
      const previous = await conversations.findCompletedAssistant(turn.conversation.id, clientMessageId);
      if (previous) return NextResponse.json({ message: previous.content, title: turn.conversation.title, conversationId: turn.conversation.id, userMessageId: turn.userMessage.id, assistantMessageId: previous.id, duplicate: true });
      return NextResponse.json({ error: "이 메시지는 이미 처리 중입니다. 잠시 후 대화를 다시 열어주세요.", conversationId: turn.conversation.id }, { status: 409 });
    }

    const skill = await runMatchedSkill(payload.message, payload.settings.defaultLanguage, request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || null, "research");
    if (skill) {
      const assistant = await conversations.appendAssistant({ conversationId: turn.conversation.id, content: skill.message, source: "skill", replyTo: clientMessageId, metadata: { provider: "agent-runtime", model: skill.skillId } });
      return NextResponse.json({ message: skill.message, title: generateConversationTitle(payload.message), risk: { level: "low", requiresConfirmation: false, reason: "Read-only source discovery." }, mode: "research", provider: "agent-runtime", model: skill.skillId, conversationId: turn.conversation.id, userMessageId: turn.userMessage.id, assistantMessageId: assistant.id });
    }

    const profile = resolveModelProfile("research");
    const { evidence, messages } = buildResearchContext(payload);
    const response = await generateForModelRole("research", {
      messages,
      temperature: profile.temperature,
      maxTokens: profile.maxTokens
    });

    const assistant = await conversations.appendAssistant({ conversationId: turn.conversation.id, content: response.content, source: "nemotron", replyTo: clientMessageId, metadata: { provider: response.provider, model: response.model } });
    return NextResponse.json({
      message: response.content,
      title: generateConversationTitle(payload.message),
      risk: { level: "low", requiresConfirmation: false, reason: "연구 분석 텍스트 응답입니다." },
      mode: "research",
      evidence,
      conversationId: turn.conversation.id,
      userMessageId: turn.userMessage.id,
      assistantMessageId: assistant.id
    });
  } catch (error) {
    const message = error instanceof LlmProviderError && error.code === "configuration"
      ? "연구 AI 응답 서비스를 아직 사용할 수 없습니다. 잠시 후 다시 시도하세요."
      : error instanceof LlmProviderError && error.code === "timeout"
        ? "연구 AI 응답 시간이 초과되었습니다. 잠시 후 다시 시도하세요."
        : "연구 AI 응답을 준비하지 못했습니다. 잠시 후 다시 시도하세요.";
    if (turn && payload) await new ConversationRepository().appendAssistant({ conversationId: turn.conversation.id, content: message, source: "nemotron", status: "failed", replyTo: payload.clientMessageId || payload.messageId || "unknown" }).catch(() => undefined);
    return NextResponse.json({ error: message, conversationId: turn?.conversation.id }, { status: error instanceof LlmProviderError && error.code === "configuration" ? 503 : 502 });
  }
}
