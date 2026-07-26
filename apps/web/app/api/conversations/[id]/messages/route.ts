import { NextResponse } from "next/server";
import { ConversationRepository } from "../../../../../lib/conversations/repository";
import type { ConversationType } from "../../../../../lib/conversations/types";

export const runtime = "nodejs";
type Context = { params: { id: string } };

export async function GET(request: Request, { params }: Context) {
  try {
    const url = new URL(request.url);
    const type = parseType(url.searchParams.get("type"));
    if (!type) return NextResponse.json({ error: "Invalid conversation type." }, { status: 400 });
    return NextResponse.json(await new ConversationRepository().listMessages(params.id, type, { limit: Number(url.searchParams.get("limit") || 40), before: url.searchParams.get("before") || undefined }));
  } catch {
    return NextResponse.json({ error: "Messages were not found." }, { status: 404 });
  }
}

function parseType(value: string | null): ConversationType | null { return value === "general" || value === "research" ? value : null; }
