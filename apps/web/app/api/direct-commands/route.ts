import { NextResponse } from "next/server";
import { DirectCommandRepository } from "../../../lib/intent/direct-command-repository";
import { errorResponse, toPublicCommand } from "../../../lib/intent/direct-command-api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const search = new URL(request.url).searchParams.get("search") || "";
    const commands = await new DirectCommandRepository().list(search);
    return NextResponse.json({ commands: commands.map(toPublicCommand) });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const command = await new DirectCommandRepository().create(await request.json());
    return NextResponse.json({ command: toPublicCommand(command) }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
