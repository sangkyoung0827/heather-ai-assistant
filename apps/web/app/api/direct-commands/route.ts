import { NextResponse } from "next/server";
import { DirectCommandRepository } from "../../../lib/intent/direct-command-repository";
import { errorResponse, toPublicCommand } from "../../../lib/intent/direct-command-api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const q = params.get("q") || params.get("search") || "";
    const limit = Number.parseInt(params.get("limit") || "30", 10);
    const page = await new DirectCommandRepository().listPage({ search: q, cursor: params.get("cursor"), limit: Number.isFinite(limit) ? limit : 30 });
    return NextResponse.json({ commands: page.commands.map(toPublicCommand), nextCursor: page.nextCursor });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const command = await new DirectCommandRepository().create(await request.json());
    return NextResponse.json({ command: toPublicCommand(command) }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
