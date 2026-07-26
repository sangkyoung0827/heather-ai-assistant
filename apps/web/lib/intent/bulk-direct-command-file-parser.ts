import { parse as parseCsv } from "csv-parse/sync";
import mammoth from "mammoth";
import type { DirectCommandInput } from "./direct-command-repository";
import { BULK_IMPORT_LIMITS, isSafeBulkDirectCommand, parseHeatherDirectCommandFile, validateBulkInput } from "./bulk-direct-command-import";

export type BulkFileType = "txt" | "md" | "json" | "csv" | "pdf" | "docx";
export type ParsedBulkFile = { fileType: BulkFileType; inputs: Array<DirectCommandInput | null>; errors: Array<{ index: number; message: string }>; metadata: { textExtracted?: boolean; pages?: number; candidates?: number } };

export async function parseBulkDirectCommandFile({ fileType, bytes }: { fileType: BulkFileType; bytes: Uint8Array }): Promise<ParsedBulkFile> {
  if (bytes.byteLength > BULK_IMPORT_LIMITS.fileBytes) throw new Error("파일 크기는 5MB 이하여야 합니다.");
  if (fileType === "pdf") {
    const extracted = await extractPdf(bytes);
    const parsed = parseQuestionAnswerText(extracted.text);
    return finalize(fileType, parsed, { textExtracted: true, pages: extracted.pages, candidates: parsed.inputs.filter(Boolean).length });
  }
  if (fileType === "docx") {
    const text = await extractDocx(bytes);
    const parsed = parseQuestionAnswerText(text);
    return finalize(fileType, parsed, { textExtracted: true, candidates: parsed.inputs.filter(Boolean).length });
  }
  const text = decodeText(bytes);
  if (fileType === "txt") return finalize(fileType, parseHeatherDirectCommandFile(text), {});
  if (fileType === "json") return finalize(fileType, parseJson(text), {});
  if (fileType === "csv") return finalize(fileType, parseCsvFile(text), {});
  return finalize(fileType, parseMarkdown(text), {});
}

function finalize(fileType: BulkFileType, parsed: { inputs: Array<DirectCommandInput | null>; errors: Array<{ index: number; message: string }> }, metadata: ParsedBulkFile["metadata"]): ParsedBulkFile {
  const inputs = parsed.inputs.map((input, index) => {
    if (!input) return null;
    try {
      const prepared = validateBulkInput(input);
      const unsafe = isSafeBulkDirectCommand(prepared);
      if (unsafe) { parsed.errors.push({ index: index + 1, message: unsafe }); return null; }
      return prepared;
    } catch (error) { parsed.errors.push({ index: index + 1, message: error instanceof Error ? error.message : "형식이 올바르지 않습니다." }); return null; }
  });
  if (inputs.length > BULK_IMPORT_LIMITS.commands) throw new Error(`명령은 최대 ${BULK_IMPORT_LIMITS.commands}개까지 등록할 수 있습니다.`);
  return { fileType, inputs, errors: dedupeErrors(parsed.errors), metadata };
}

function decodeText(bytes: Uint8Array) { try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, ""); } catch { throw new Error("UTF-8 텍스트 파일만 지원합니다."); } }

function parseJson(source: string) {
  let parsed: unknown;
  try { parsed = JSON.parse(source); } catch { throw new Error("올바른 JSON 파일이 아닙니다."); }
  if (!Array.isArray(parsed)) throw new Error("JSON 최상위 값은 명령 배열이어야 합니다.");
  const inputs: Array<DirectCommandInput | null> = [];
  const errors: Array<{ index: number; message: string }> = [];
  parsed.forEach((item, index) => {
    if (!item || typeof item !== "object") { inputs.push(null); errors.push({ index: index + 1, message: "객체 항목이 필요합니다." }); return; }
    const value = item as Record<string, unknown>;
    inputs.push({ title: text(value.title), canonicalTrigger: text(value.canonicalTrigger ?? value.canonical_trigger), triggers: array(value.triggers ?? value.additional_triggers), response: text(value.response), tags: array(value.tags), enabled: value.enabled !== false });
  });
  return { inputs, errors };
}

function parseCsvFile(source: string) {
  let rows: Array<Record<string, string>>;
  try { rows = parseCsv(source, { columns: true, skip_empty_lines: true, trim: true, relax_column_count: false }) as Array<Record<string, string>>; } catch { throw new Error("CSV 형식 또는 인용된 필드를 읽을 수 없습니다."); }
  return fromItems(rows.map((row) => ({ title: text(row.title), canonicalTrigger: text(row.canonical_trigger ?? row.canonicalTrigger), triggers: splitPipe(row.additional_triggers ?? row.triggers), response: text(row.response), tags: splitPipe(row.tags), enabled: parseBoolean(row.enabled) })));
}

function parseMarkdown(source: string) {
  const sections = source.replace(/\r\n/g, "\n").split(/^##\s+/m).filter(Boolean);
  if (!sections.length) throw new Error("Markdown에는 '## 제목'과 Q:/A: 구조가 필요합니다.");
  return fromSections(sections);
}

function parseQuestionAnswerText(source: string) {
  const normalized = source.replace(/\r\n/g, "\n").trim();
  if (!normalized) throw new Error("문서에서 텍스트를 추출하지 못했습니다.");
  const sections = /^##\s+/m.test(normalized) ? normalized.split(/^##\s+/m).filter(Boolean) : normalized.split(/(?=^(?:제목|TITLE)\s*[:：])/mi).filter(Boolean);
  if (!sections.length) throw new Error("문서에서 명확한 질문/답변 구조를 찾지 못했습니다.");
  return fromSections(sections);
}

function parseQaSection(section: string): DirectCommandInput {
  const lines = section.split("\n");
  const heading = lines[0].trim();
  const questions: string[] = [];
  const tags: string[] = [];
  const answer: string[] = [];
  let mode: "question" | "answer" | "tags" | null = null;
  for (const raw of lines.slice(1)) {
    const line = raw.trim();
    const question = line.match(/^(?:Q|질문)\s*[:：]\s*(.+)$/i);
    const answerStart = line.match(/^(?:A|답변)\s*[:：]\s*(.*)$/i);
    const tagLine = line.match(/^(?:Tags?|태그)\s*[:：]\s*(.+)$/i);
    if (question) { questions.push(question[1].trim()); mode = "question"; continue; }
    if (answerStart) { if (answerStart[1]) answer.push(answerStart[1]); mode = "answer"; continue; }
    if (tagLine) { tags.push(...tagLine[1].split(/[|,]/).map((tag) => tag.trim())); mode = "tags"; continue; }
    if (!line) { if (mode === "answer") answer.push(""); continue; }
    if (mode === "answer") answer.push(raw.trim());
    else if (mode === "question" && /^-\s+/.test(line)) questions.push(line.replace(/^-\s+/, ""));
    else if (mode === "tags" && /^-\s+/.test(line)) tags.push(line.replace(/^-\s+/, ""));
  }
  const canonicalTrigger = questions[0] || "";
  return { title: heading.replace(/^(?:제목|TITLE)\s*[:：]\s*/i, "") || canonicalTrigger, canonicalTrigger, triggers: questions.slice(1), response: answer.join("\n").trim(), tags, enabled: true };
}

function fromItems(builders: Array<DirectCommandInput>) {
  const inputs: Array<DirectCommandInput | null> = [];
  const errors: Array<{ index: number; message: string }> = [];
  builders.forEach((builder, index) => { try { inputs.push(builder); } catch (error) { inputs.push(null); errors.push({ index: index + 1, message: error instanceof Error ? error.message : "형식이 올바르지 않습니다." }); } });
  return { inputs, errors };
}
function fromSections(sections: string[]) {
  const inputs: Array<DirectCommandInput | null> = [];
  const errors: Array<{ index: number; message: string }> = [];
  sections.forEach((section, index) => {
    try { inputs.push(parseQaSection(section)); }
    catch (error) { inputs.push(null); errors.push({ index: index + 1, message: error instanceof Error ? error.message : "Q/A 형식이 올바르지 않습니다." }); }
  });
  return { inputs, errors };
}
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function array(value: unknown) { return Array.isArray(value) ? value.map(text).filter(Boolean) : typeof value === "string" ? splitPipe(value) : []; }
function splitPipe(value: string | undefined) { return (value || "").split("|").map((item) => item.trim()).filter(Boolean); }
function parseBoolean(value: string | undefined) { return !value || !/^(?:false|0|no)$/i.test(value.trim()); }
function dedupeErrors(errors: Array<{ index: number; message: string }>) { return errors.filter((error, index) => errors.findIndex((candidate) => candidate.index === error.index && candidate.message === error.message) === index); }

async function extractPdf(bytes: Uint8Array): Promise<{ text: string; pages: number }> {
  const pdfParserModule = await import("pdf-parse");
  const parse = (pdfParserModule.default || pdfParserModule) as unknown as (buffer: Buffer) => Promise<{ text?: string; numpages?: number }>;
  try {
    const result = await parse(Buffer.from(bytes));
    if (!result.text?.trim()) throw new Error("텍스트를 추출할 수 없는 스캔 PDF입니다.");
    if (Number(result.numpages || 0) > 200) throw new Error("PDF는 최대 200페이지까지 지원합니다.");
    return { text: result.text, pages: Number(result.numpages || 0) };
  } catch (error) { throw new Error(error instanceof Error && /스캔 PDF/.test(error.message) ? error.message : "PDF 텍스트를 추출하지 못했습니다. 암호화되었거나 지원되지 않는 PDF일 수 있습니다."); }
}

async function extractDocx(bytes: Uint8Array) {
  try {
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    if (!result.value.trim()) throw new Error("DOCX 문서에 추출 가능한 텍스트가 없습니다.");
    return result.value;
  } catch (error) { throw new Error(error instanceof Error ? error.message : "DOCX 텍스트를 추출하지 못했습니다."); }
}
