import { NextResponse } from "next/server";
import { BULK_IMPORT_LIMITS, previewBulkImport } from "../../../../../lib/intent/bulk-direct-command-import";
import { parseBulkDirectCommandFile, type BulkFileType } from "../../../../../lib/intent/bulk-direct-command-file-parser";
import { storeBulkImportSession } from "../../../../../lib/intent/bulk-import-session";
import { DirectCommandRepository } from "../../../../../lib/intent/direct-command-repository";
import { errorResponse } from "../../../../../lib/intent/direct-command-api";
import { requireHeatherOwner } from "../../../../../lib/security/heather-owner";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const owner = await requireHeatherOwner(request);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("지원 파일을 선택하세요.");
    if (file.size > BULK_IMPORT_LIMITS.fileBytes) throw new Error("파일 크기는 5MB 이하여야 합니다.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const fileType = detectFileType(file.name, file.type, bytes);
    const parsed = await parseBulkDirectCommandFile({ fileType, bytes });
    const preview = previewBulkImport(parsed.inputs, await new DirectCommandRepository(owner.id).list());
    const items = preview.items.map((item, index) => item.status === "error" && parsed.errors.find((error) => error.index === index + 1) ? { ...item, error: parsed.errors.find((error) => error.index === index + 1)!.message } : item);
    const summary = { ...preview.summary, error: items.filter((item) => item.status === "error").length };
    const session = storeBulkImportSession({ ownerUserId: owner.id, inputs: parsed.inputs, items, summary });
    return NextResponse.json({ importId: session.id, file: { name: file.name, type: fileType, size: file.size, ...parsed.metadata }, summary, items, errors: [...parsed.errors, ...items.flatMap((item, index) => item.status === "error" ? [{ index: index + 1, message: item.error || "형식이 올바르지 않습니다." }] : [])] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

function detectFileType(name: string, mime: string, bytes: Uint8Array): BulkFileType {
  const extension = name.toLowerCase().split(".").pop();
  const textTypes: Record<string, BulkFileType> = { txt: "txt", md: "md", markdown: "md", json: "json", csv: "csv" };
  if (extension && textTypes[extension]) {
    if (mime && !/^(text\/|application\/(json|csv|octet-stream))/i.test(mime)) throw new Error("파일 확장자와 MIME type이 일치하지 않습니다.");
    return textTypes[extension];
  }
  if (extension === "pdf") {
    if (mime && mime !== "application/pdf") throw new Error("파일 확장자와 MIME type이 일치하지 않습니다.");
    if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new Error("유효한 PDF 파일이 아닙니다.");
    return "pdf";
  }
  if (extension === "docx") {
    if (mime && !/application\/(vnd\.openxmlformats-officedocument\.wordprocessingml\.document|octet-stream)/i.test(mime)) throw new Error("파일 확장자와 MIME type이 일치하지 않습니다.");
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b || !Buffer.from(bytes).includes(Buffer.from("[Content_Types].xml"))) throw new Error("유효한 DOCX 파일이 아닙니다.");
    return "docx";
  }
  throw new Error("지원하지 않는 파일 형식입니다. TXT, Markdown, JSON, CSV, PDF, DOCX만 지원합니다.");
}
