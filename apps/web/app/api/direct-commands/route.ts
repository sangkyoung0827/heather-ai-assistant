import { NextResponse } from "next/server";
import { DirectCommandRepository } from "../../../lib/intent/direct-command-repository";
import { errorResponse, toPublicCommand } from "../../../lib/intent/direct-command-api";
import { requireHeatherOwner } from "../../../lib/security/heather-owner";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const owner = await requireHeatherOwner(request);
    const params = new URL(request.url).searchParams;
    const q = params.get("q") || params.get("search") || "";
    const limit = Number.parseInt(params.get("limit") || "30", 10);
    const page = await new DirectCommandRepository(owner.id).listPage({ search: q, cursor: params.get("cursor"), limit: Number.isFinite(limit) ? limit : 30 });
    return NextResponse.json({ commands: page.commands.map(toPublicCommand), nextCursor: page.nextCursor }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const owner = await requireHeatherOwner(request);
    const command = await new DirectCommandRepository(owner.id).create(await request.json());
    return NextResponse.json({ command: toPublicCommand(command) }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
