import { NextResponse } from "next/server";
import { DirectCommandRepository } from "../../../../lib/intent/direct-command-repository";
import { errorResponse } from "../../../../lib/intent/direct-command-api";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { commands?: unknown };
    const summary = await new DirectCommandRepository().import(body.commands);
    return NextResponse.json({ summary });
  } catch (error) { return errorResponse(error); }
}
