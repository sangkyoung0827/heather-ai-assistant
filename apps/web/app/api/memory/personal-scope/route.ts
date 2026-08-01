import { NextResponse } from "next/server";
import { ContextControlError, requireContextUser } from "../../../../lib/context-control/server";
import { getPersonalMemoryScopeData, type PersonalMemoryScope } from "../../../../lib/personal-memory-scope/server";

export const runtime = "nodejs";

const VALID_SCOPES = new Set<PersonalMemoryScope>(["all", "journal", "direct", "project"]);

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const requestedScope = url.searchParams.get("scope") || "all";
    const scope: PersonalMemoryScope = VALID_SCOPES.has(requestedScope as PersonalMemoryScope) ? requestedScope as PersonalMemoryScope : "all";
    const query = (url.searchParams.get("q") || "").slice(0, 240);
    const context = await requireContextUser(request);
    return NextResponse.json(await getPersonalMemoryScopeData(context, scope, query));
  } catch (error) {
    const status = error instanceof ContextControlError ? error.status : 500;
    const message = error instanceof ContextControlError ? error.message : "Could not load personal memory scope.";
    return NextResponse.json({ error: message }, { status });
  }
}
