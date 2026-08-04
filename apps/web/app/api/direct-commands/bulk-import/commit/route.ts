import { NextResponse } from "next/server";
import { takeBulkImportSession } from "../../../../../lib/intent/bulk-import-session";
import { DirectCommandRepository } from "../../../../../lib/intent/direct-command-repository";
import { errorResponse } from "../../../../../lib/intent/direct-command-api";
import { requireHeatherOwner } from "../../../../../lib/security/heather-owner";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const owner = await requireHeatherOwner(request);
    const { importId, selectedIndexes } = await request.json() as { importId?: string; selectedIndexes?: number[] };
    if (!importId) throw new Error("유효한 대량 등록 Preview가 필요합니다.");
    const session = takeBulkImportSession(importId, owner.id);
    if (!session) throw new Error("Preview가 만료되었거나 현재 계정의 Preview가 아닙니다. 파일을 다시 선택하세요.");
    const selected = Array.isArray(selectedIndexes) ? session.inputs.map((input, index) => selectedIndexes.includes(index) ? input : null) : session.inputs;
    const summary = await new DirectCommandRepository(owner.id).commitBulkImport(selected);
    return NextResponse.json({ summary }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
