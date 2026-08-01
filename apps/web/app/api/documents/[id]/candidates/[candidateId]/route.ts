import { NextResponse } from "next/server";
import { ContextControlError, requireContextUser } from "../../../../../../lib/context-control/server";
import { updateCandidate } from "../../../../../../lib/documents/server";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: { id: string; candidateId: string } }) {
  try {
    const body = await request.json() as { action?: "approve" | "reject" | "commit"; content?: string };
    if (body.action !== "approve" && body.action !== "reject" && body.action !== "commit") return NextResponse.json({ error: "Invalid candidate action." }, { status: 400 });
    return NextResponse.json(await updateCandidate(await requireContextUser(request), params.id, params.candidateId, body.action, body.content));
  } catch (error) { const status = error instanceof ContextControlError ? error.status : 500; return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update the candidate." }, { status }); }
}
