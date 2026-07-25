import { NextResponse } from "next/server";
import { generateConversationTitle } from "@heather/core";
import type { ChatRequestPayload } from "@heather/core";
import { resolveModelProfile } from "../../../../lib/llm/config";
import { LlmProviderError } from "../../../../lib/llm/errors";
import { isValidChatPayload } from "../../../../lib/llm/messages";
import { generateForModelRole } from "../../../../lib/llm/service";
import { buildResearchContext } from "../../../../lib/research/context";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as ChatRequestPayload;
    const validationError = isValidChatPayload(payload);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

    const profile = resolveModelProfile("research");
    const { evidence, messages } = buildResearchContext(payload);
    const response = await generateForModelRole("research", {
      messages,
      temperature: profile.temperature,
      maxTokens: profile.maxTokens
    });

    return NextResponse.json({
      message: response.content,
      title: generateConversationTitle(payload.message),
      risk: { level: "low", requiresConfirmation: false, reason: "연구 분석 텍스트 응답입니다." },
      mode: "research",
      evidence
    });
  } catch (error) {
    const message = error instanceof LlmProviderError && error.code === "configuration"
      ? "연구 AI 응답 서비스를 아직 사용할 수 없습니다. 잠시 후 다시 시도하세요."
      : error instanceof LlmProviderError && error.code === "timeout"
        ? "연구 AI 응답 시간이 초과되었습니다. 잠시 후 다시 시도하세요."
        : "연구 AI 응답을 준비하지 못했습니다. 잠시 후 다시 시도하세요.";
    return NextResponse.json({ error: message }, { status: error instanceof LlmProviderError && error.code === "configuration" ? 503 : 502 });
  }
}
