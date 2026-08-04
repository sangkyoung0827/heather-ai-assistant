import { NextResponse } from "next/server";
import { DirectCommandRepository } from "../../../../lib/intent/direct-command-repository";
import { errorResponse } from "../../../../lib/intent/direct-command-api";
import { requireHeatherOwner } from "../../../../lib/security/heather-owner";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const owner = await requireHeatherOwner(request);
    return NextResponse.json({ commands: await new DirectCommandRepository(owner.id).export() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
