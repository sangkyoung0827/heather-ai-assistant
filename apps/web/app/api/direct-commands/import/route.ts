import { NextResponse } from "next/server";
import { DirectCommandRepository } from "../../../../lib/intent/direct-command-repository";
import { errorResponse } from "../../../../lib/intent/direct-command-api";
import { requireHeatherOwner } from "../../../../lib/security/heather-owner";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const owner = await requireHeatherOwner(request);
    const body = await request.json() as { commands?: unknown };
    const summary = await new DirectCommandRepository(owner.id).import(body.commands);
    return NextResponse.json({ summary }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
