import { NextResponse } from "next/server";
import { ContextControlError, requireContextUser } from "../../../lib/context-control/server";
import { createQuickLink, deleteQuickLink, getQuickLink, listQuickLinks, moveQuickLink, updateQuickLink, type QuickLinkCategory } from "../../../lib/quick-links/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try { return NextResponse.json({ links: await listQuickLinks(await requireContextUser(request)) }); }
  catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { name?: string; url?: string; category?: QuickLinkCategory; displayOrder?: number; pinned?: boolean; openMode?: "external" | "same_tab"; projectId?: string | null };
    if (!body.name || !body.url || !body.category) throw new ContextControlError("Name, URL, and category are required.", 400);
    const created = await createQuickLink(await requireContextUser(request), { name: body.name, url: body.url, category: body.category, displayOrder: body.displayOrder, pinned: body.pinned, openMode: body.openMode, projectId: body.projectId, createdBy: "manual_ui" });
    if (created.kind !== "created") return NextResponse.json({ conflict: created.kind, link: created.link }, { status: 409 });
    return NextResponse.json({ link: created.link, links: created.links }, { status: 201 });
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json() as { id?: string; action?: "update" | "move"; name?: string; url?: string; category?: QuickLinkCategory; displayOrder?: number; pinned?: boolean; openMode?: "external" | "same_tab"; projectId?: string | null };
    if (!body.id) throw new ContextControlError("Quick link ID is required.", 400);
    const context = await requireContextUser(request);
    const target = await getQuickLink(context, body.id);
    const result = body.action === "move" && body.category ? await moveQuickLink(context, target, body.category, body.displayOrder) : await updateQuickLink(context, target, { name: body.name, url: body.url, category: body.category, displayOrder: body.displayOrder, pinned: body.pinned, openMode: body.openMode, projectId: body.projectId });
    return NextResponse.json(result);
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) throw new ContextControlError("Quick link ID is required.", 400);
    const context = await requireContextUser(request);
    await getQuickLink(context, id);
    await deleteQuickLink(context, id);
    const links = await listQuickLinks(context);
    if (links.some((link) => link.id === id)) throw new ContextControlError("Could not verify quick link deletion.", 503);
    return NextResponse.json({ links });
  } catch (error) { return apiError(error); }
}

function apiError(error: unknown) { const status = error instanceof ContextControlError ? error.status : 500; return NextResponse.json({ error: error instanceof ContextControlError ? error.message : "Could not manage Quick Access links." }, { status }); }
