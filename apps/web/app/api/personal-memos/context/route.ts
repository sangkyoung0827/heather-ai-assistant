import { NextResponse } from "next/server";
import { ContextControlError, requireContextUser } from "../../../../lib/context-control/server";
import { setActivePersonalMemo, type PersonalMemoAction } from "../../../../lib/personal-memos/server";

const ACTIONS: PersonalMemoAction[] = ["create", "append", "update", "replace", "delete", "restore", "get", "search", "list_recent", "history"];

export async function POST(request: Request) {
  try {
    const body = await request.json() as { conversationId?: unknown; memoId?: unknown; action?: unknown };
    const conversationId = typeof body.conversationId === "string" ? body.conversationId : "";
    const memoId = typeof body.memoId === "string" ? body.memoId : "";
    const action = typeof body.action === "string" && ACTIONS.includes(body.action as PersonalMemoAction) ? body.action as PersonalMemoAction : null;
    if (!conversationId || !memoId || !action) return NextResponse.json({ error: "Invalid memo context." }, { status: 400 });
    await setActivePersonalMemo(await requireContextUser(request), conversationId, memoId, action);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = error instanceof ContextControlError ? error.status : 503;
    return NextResponse.json({ error: status === 401 ? "Sign in is required." : "Personal memo context could not be saved." }, { status });
  }
}
