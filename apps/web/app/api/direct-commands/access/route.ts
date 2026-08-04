import { NextResponse } from "next/server";
import { requireHeatherOwner } from "../../../../lib/security/heather-owner";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireHeatherOwner(request);
    return NextResponse.json({ allowed: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
}
