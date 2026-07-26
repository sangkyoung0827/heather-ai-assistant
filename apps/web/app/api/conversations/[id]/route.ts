import { NextResponse } from "next/server";
import { ConversationRepository } from "../../../../lib/conversations/repository";
import type { ConversationType } from "../../../../lib/conversations/types";

export const runtime = "nodejs";

type Context = { params: { id: string } };

export async function GET(request: Request, { params }: Context) {
  try {
    const type = parseType(new URL(request.url).searchParams.get("type"));
    if (!type) return NextResponse.json({ error: "Invalid conversation type." }, { status: 400 });
    const conversation = await new ConversationRepository().get(params.id, type);
    return conversation ? NextResponse.json({ conversation }) : NextResponse.json({ error: "Conversation was not found." }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "Conversation was not found." }, { status: 404 });
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const body = await request.json() as { type?: string; title?: string; archived?: boolean };
    const type = parseType(body.type || null);
    if (!type) return NextResponse.json({ error: "Invalid conversation type." }, { status: 400 });
    const conversation = await new ConversationRepository().update(params.id, type, { title: body.title, archived: body.archived });
    return NextResponse.json({ conversation });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Conversation could not be updated." }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    const type = parseType(new URL(request.url).searchParams.get("type"));
    if (!type) return NextResponse.json({ error: "Invalid conversation type." }, { status: 400 });
    await new ConversationRepository().update(params.id, type, { archived: true });
    return NextResponse.json({ archived: true });
  } catch {
    return NextResponse.json({ error: "Conversation could not be archived." }, { status: 400 });
  }
}

function parseType(value: string | null): ConversationType | null { return value === "general" || value === "research" ? value : null; }
