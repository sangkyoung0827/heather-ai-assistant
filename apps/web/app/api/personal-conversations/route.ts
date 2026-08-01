import { NextResponse } from "next/server";
import type { Conversation } from "@heather/core";
import { requireContextUser } from "../../../lib/context-control/server";
import { archivePersonalConversation, listPersonalConversations, savePersonalConversation, updatePersonalConversationExecutionMode } from "../../../lib/personal-conversation-server";
import { parseChatExecutionMode } from "../../../lib/chat/execution-mode";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const context = await requireContextUser(request);
    return NextResponse.json({ conversations: await listPersonalConversations(context.user.id) });
  } catch {
    return NextResponse.json({ error: "개인 채팅 기록을 불러오지 못했습니다." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireContextUser(request);
    const body = await request.json() as { conversation?: Conversation };
    if (!body.conversation) return NextResponse.json({ error: "대화 내용이 필요합니다." }, { status: 400 });
    return NextResponse.json({ conversation: await savePersonalConversation(context.user.id, body.conversation) });
  } catch {
    return NextResponse.json({ error: "개인 채팅 기록을 저장하지 못했습니다." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await requireContextUser(request);
    const body = await request.json() as { id?: string; executionMode?: unknown };
    if (!body.id) return NextResponse.json({ error: "대화 ID가 필요합니다." }, { status: 400 });
    if (body.executionMode !== undefined) {
      const executionMode = parseChatExecutionMode(body.executionMode);
      if (!executionMode) return NextResponse.json({ error: "허용되지 않은 실행 모드입니다." }, { status: 400 });
      await updatePersonalConversationExecutionMode(context.user.id, body.id, executionMode);
      return NextResponse.json({ ok: true, executionMode });
    }
    await archivePersonalConversation(context.user.id, body.id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "개인 채팅 기록을 삭제하지 못했습니다." }, { status: 503 });
  }
}
