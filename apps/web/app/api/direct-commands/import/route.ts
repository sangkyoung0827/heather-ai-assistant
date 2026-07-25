import { NextResponse } from "next/server";
import { DirectCommandRepository } from "../../../../lib/intent/direct-command-repository";
import { errorResponse, toPublicCommand } from "../../../../lib/intent/direct-command-api";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { commands?: unknown };
    const commands = await new DirectCommandRepository().import(body.commands);
    return NextResponse.json({ commands: commands.map(toPublicCommand) });
  } catch (error) { return errorResponse(error); }
}
