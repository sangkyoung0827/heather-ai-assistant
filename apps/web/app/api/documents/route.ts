import { NextResponse } from "next/server";
import { ContextControlError, requireContextUser } from "../../../lib/context-control/server";
import { listDocuments, uploadDocuments } from "../../../lib/documents/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const scope = new URL(request.url).searchParams.get("scope") === "research" ? "research" : "personal";
    return NextResponse.json(await listDocuments(await requireContextUser(request), scope));
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try { return NextResponse.json(await uploadDocuments(await requireContextUser(request), await request.formData())); }
  catch (error) { return errorResponse(error); }
}

function errorResponse(error: unknown) { const status = error instanceof ContextControlError ? error.status : 500; const message = error instanceof Error ? error.message : "Could not process this document."; return NextResponse.json({ error: message }, { status }); }
