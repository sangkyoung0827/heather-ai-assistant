import { NextResponse } from "next/server";
import { DirectCommandRepository } from "../../../../lib/intent/direct-command-repository";
import { errorResponse, toPublicCommand } from "../../../../lib/intent/direct-command-api";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try { return NextResponse.json({ command: toPublicCommand(await new DirectCommandRepository().update(params.id, await request.json())) }); }
  catch (error) { return errorResponse(error); }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try { await new DirectCommandRepository().remove(params.id); return new NextResponse(null, { status: 204 }); }
  catch (error) { return errorResponse(error); }
}
