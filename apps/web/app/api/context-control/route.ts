import { NextResponse } from "next/server";
import {
  ContextControlError,
  commitSeedPreview,
  createProject,
  createProjectResource,
  createSeedPreview,
  getContextOverview,
  getGithubPublicRead,
  getProjectDetail,
  getSeedPreview,
  requireContextUser,
  updateApproval
} from "../../../lib/context-control/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const context = await requireContextUser(request);
    const params = new URL(request.url).searchParams;
    const view = params.get("view") || "overview";
    if (view === "overview") return NextResponse.json(await getContextOverview(context));
    if (view === "project") return NextResponse.json(await getProjectDetail(context, requireParam(params.get("id"), "project id")));
    if (view === "import-preview") return NextResponse.json(await getSeedPreview(context, requireParam(params.get("batch"), "import batch")));
    return NextResponse.json({ error: "Unsupported context view." }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireContextUser(request);
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action || "");
    if (action === "project-create") return NextResponse.json({ project: await createProject(context, object(body.input)) }, { status: 201 });
    if (action === "resource-create") return NextResponse.json({ resource: await createProjectResource(context, requiredString(body.projectId, "project id"), object(body.input)) }, { status: 201 });
    if (action === "seed-preview") return NextResponse.json(await createSeedPreview(context), { status: 201 });
    if (action === "seed-commit") return NextResponse.json(await commitSeedPreview(context, requiredString(body.batchId, "import batch"), stringArray(body.selectedItemIds)));
    if (action === "approval-update") {
      const status = body.status === "approved" || body.status === "rejected" ? body.status : null;
      if (!status) throw new ContextControlError("Approval status must be approved or rejected.");
      return NextResponse.json({ approval: await updateApproval(context, requiredString(body.approvalId, "approval id"), status) });
    }
    if (action === "github-public-read") return NextResponse.json(await getGithubPublicRead(requiredString(body.url, "GitHub URL")));
    return NextResponse.json({ error: "Unsupported context action." }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}

function errorResponse(error: unknown) {
  const status = error instanceof ContextControlError ? error.status : 500;
  const message = error instanceof ContextControlError ? error.message : "Heather could not complete this context request.";
  return NextResponse.json({ error: message }, { status });
}
function requireParam(value: string | null, label: string) { if (!value) throw new ContextControlError(`Missing ${label}.`); return value; }
function requiredString(value: unknown, label: string) { if (typeof value !== "string" || !value.trim()) throw new ContextControlError(`Missing ${label}.`); return value.trim(); }
function object(value: unknown) { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function stringArray(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
