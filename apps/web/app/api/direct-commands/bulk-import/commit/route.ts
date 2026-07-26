import { NextResponse } from "next/server";
import { takeBulkImportSession } from "../../../../../lib/intent/bulk-import-session";
import { DirectCommandRepository } from "../../../../../lib/intent/direct-command-repository";
import { errorResponse } from "../../../../../lib/intent/direct-command-api";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { importId, selectedIndexes } = await request.json() as { importId?: string; selectedIndexes?: number[] };
    if (!importId) throw new Error("유효한 대량 등록 Preview가 필요합니다.");
    const session = takeBulkImportSession(importId);
    if (!session) throw new Error("Preview가 만료되었습니다. 파일을 다시 선택하세요.");
    const selected = Array.isArray(selectedIndexes) ? session.inputs.map((input, index) => selectedIndexes.includes(index) ? input : null) : session.inputs;
    const summary = await new DirectCommandRepository().commitBulkImport(selected);
    return NextResponse.json({ summary });
  } catch (error) { return errorResponse(error); }
}
