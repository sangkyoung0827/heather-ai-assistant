import { NextResponse } from "next/server";
import { ContextControlError, requireContextUser } from "../../../../lib/context-control/server";
import { deleteDocument } from "../../../../lib/documents/server";

export const runtime = "nodejs";

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try { await deleteDocument(await requireContextUser(request), params.id); return NextResponse.json({ ok: true }); }
  catch (error) { const status = error instanceof ContextControlError ? error.status : 500; return NextResponse.json({ error: error instanceof Error ? error.message : "Could not delete the document." }, { status }); }
}
