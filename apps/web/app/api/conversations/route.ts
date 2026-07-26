import { NextResponse } from "next/server";
import { ConversationRepository } from "../../../lib/conversations/repository";
import type { ConversationType } from "../../../lib/conversations/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const type = parseType(url.searchParams.get("type"));
    if (!type) return NextResponse.json({ error: "Invalid conversation type." }, { status: 400 });
    const page = await new ConversationRepository().list(type, {
      limit: Number(url.searchParams.get("limit") || 25),
      cursor: url.searchParams.get("cursor") || undefined,
      search: url.searchParams.get("search") || undefined
    });
    return NextResponse.json(page);
  } catch (error) {
    return NextResponse.json({ error: publicError(error) }, { status: 503 });
  }
}

function parseType(value: string | null): ConversationType | null { return value === "general" || value === "research" ? value : null; }
function publicError(error: unknown) { return error instanceof Error && error.message.includes("not configured") ? "대화 저장소가 아직 연결되지 않았습니다." : "대화 목록을 불러오지 못했습니다."; }
