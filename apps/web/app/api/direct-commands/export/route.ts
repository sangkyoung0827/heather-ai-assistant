import { NextResponse } from "next/server";
import { DirectCommandRepository } from "../../../../lib/intent/direct-command-repository";
import { errorResponse } from "../../../../lib/intent/direct-command-api";

export const runtime = "nodejs";

export async function GET() {
  try { return NextResponse.json({ commands: await new DirectCommandRepository().export() }); }
  catch (error) { return errorResponse(error); }
}
