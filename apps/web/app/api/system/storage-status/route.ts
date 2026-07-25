import { NextResponse } from "next/server";
import { DirectCommandRepository } from "../../../../lib/intent/direct-command-repository";

export const runtime = "nodejs";

export async function GET() {
  try { return NextResponse.json(await new DirectCommandRepository().storageStatus()); }
  catch { return NextResponse.json({ provider: "unavailable", connected: false, readable: false, writable: false }); }
}
