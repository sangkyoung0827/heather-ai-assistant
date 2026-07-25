import { NextResponse } from "next/server";
import { getLlmStatus } from "../../../../lib/llm/status";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(getLlmStatus(), {
    headers: { "Cache-Control": "no-store" }
  });
}
