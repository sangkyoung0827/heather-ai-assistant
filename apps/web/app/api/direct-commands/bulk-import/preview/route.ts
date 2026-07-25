import { NextResponse } from "next/server";
import { BULK_IMPORT_LIMITS, parseHeatherDirectCommandFile, previewBulkImport } from "../../../../../lib/intent/bulk-direct-command-import";
import { storeBulkImportSession } from "../../../../../lib/intent/bulk-import-session";
import { DirectCommandRepository } from "../../../../../lib/intent/direct-command-repository";
import { errorResponse } from "../../../../../lib/intent/direct-command-api";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("TXT 파일을 선택하세요.");
    if (!file.name.toLowerCase().endsWith(".txt") || (file.type && !file.type.startsWith("text/plain"))) throw new Error("TXT 파일만 업로드할 수 있습니다.");
    if (file.size > BULK_IMPORT_LIMITS.fileBytes) throw new Error("파일 크기는 5MB 이하여야 합니다.");
    let source: string;
    try { source = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()); } catch { throw new Error("UTF-8 TXT 파일만 지원합니다."); }
    const parsed = parseHeatherDirectCommandFile(source);
    const preview = previewBulkImport(parsed.inputs, await new DirectCommandRepository().list());
    const items = preview.items.map((item, index) => item.status === "error" && parsed.errors.find((error) => error.index === index + 1) ? { ...item, error: parsed.errors.find((error) => error.index === index + 1)!.message } : item);
    const summary = { ...preview.summary, error: items.filter((item) => item.status === "error").length };
    const session = storeBulkImportSession({ inputs: parsed.inputs, items, summary });
    return NextResponse.json({ importId: session.id, summary, errors: items.flatMap((item, index) => item.status === "error" ? [{ index: index + 1, message: item.error || "형식이 올바르지 않습니다." }] : []) });
  } catch (error) { return errorResponse(error); }
}
