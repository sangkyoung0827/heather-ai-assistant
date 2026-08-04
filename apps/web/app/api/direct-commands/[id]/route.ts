import { NextResponse } from "next/server";
import { DirectCommandRepository } from "../../../../lib/intent/direct-command-repository";
import { errorResponse, toPublicCommand } from "../../../../lib/intent/direct-command-api";
import { requireHeatherOwner } from "../../../../lib/security/heather-owner";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const owner = await requireHeatherOwner(request);
    return NextResponse.json({ command: toPublicCommand(await new DirectCommandRepository(owner.id).update(params.id, await request.json())) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const owner = await requireHeatherOwner(request);
    await new DirectCommandRepository(owner.id).remove(params.id);
    return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
