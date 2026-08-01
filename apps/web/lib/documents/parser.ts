import { parse as parseCsv } from "csv-parse/sync";
import mammoth from "mammoth";
import JSZip from "jszip";
import * as XLSX from "xlsx";

export type DocumentScope = "personal" | "research" | "project" | "sensitive";
export type DocumentParseStatus = "completed" | "needs_review" | "unsupported" | "failed";
export type DocumentParseResult = {
  parser: string;
  parserVersion: string;
  status: DocumentParseStatus;
  extractedText: string;
  structuredContent: Record<string, unknown>;
  pageCount?: number;
  warnings: string[];
  language?: "ko" | "en";
  sourceDate?: string;
};

export const DOCUMENT_LIMITS = { maxFiles: 10, maxFileBytes: 25 * 1024 * 1024, maxTotalBytes: 50 * 1024 * 1024, maxTextChars: 500_000, maxArchiveEntries: 3_000, maxArchiveBytes: 75 * 1024 * 1024 };

const EXTENSIONS = new Set(["txt", "md", "pdf", "docx", "hwpx", "hwp", "rtf", "odt", "csv", "xlsx", "pptx", "jpg", "jpeg", "png", "webp", "heic", "m4a", "mp3", "wav"]);
const BLOCKED_EXTENSIONS = new Set(["exe", "dmg", "app", "sh", "command", "bat", "cmd", "js", "jar", "docm", "xlsm", "pptm"]);

export function getExtension(filename: string) {
  const value = filename.trim().toLowerCase();
  return value.includes(".") ? value.split(".").at(-1) || "" : "";
}

export async function validateDocumentFile(file: File) {
  const extension = getExtension(file.name);
  if (!extension || BLOCKED_EXTENSIONS.has(extension) || !EXTENSIONS.has(extension)) throw new Error("This file format is not supported.");
  if (!file.size || file.size > DOCUMENT_LIMITS.maxFileBytes) throw new Error("Each file must be smaller than 25 MB.");
  const signature = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  if (!hasExpectedSignature(extension, signature)) throw new Error("The file signature does not match its extension.");
  return { extension, signature };
}

export async function extractDocument(file: File, extension: string): Promise<DocumentParseResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (extension === "txt" || extension === "md") return textResult("text", decodeText(bytes), { sourceDate: inferDate(file.name) });
  if (extension === "csv") return csvResult(bytes, file.name);
  if (extension === "pdf") return pdfResult(bytes);
  if (extension === "docx") return docxResult(bytes);
  if (extension === "hwpx") return hwpxResult(bytes);
  if (extension === "rtf") return textResult("rtf", stripRtf(decodeText(bytes)), { sourceDate: inferDate(file.name) });
  if (extension === "odt") return odtResult(bytes);
  if (extension === "xlsx") return xlsxResult(bytes);
  if (extension === "pptx") return pptxResult(bytes);
  if (["jpg", "jpeg", "png", "webp", "heic"].includes(extension)) return metadataOnly("image-metadata", "Image is safely stored. OCR is not enabled, so no text was extracted.");
  if (["m4a", "mp3", "wav"].includes(extension)) return unsupported("audio-preservation", "Audio is safely stored. Speech transcription is not configured yet.");
  if (extension === "hwp") return unsupported("hwp-preservation", "Legacy HWP is safely stored but cannot be parsed reliably on this server. Convert it to PDF, DOCX, or HWPX to extract text.");
  return unsupported("unknown", "This format is stored but does not have a safe parser.");
}

function textResult(parser: string, text: string, extra: Partial<DocumentParseResult> = {}): DocumentParseResult {
  const extractedText = cleanText(text);
  return { parser, parserVersion: "1", status: extractedText ? "completed" : "needs_review", extractedText, structuredContent: { paragraphs: extractedText ? extractedText.split(/\n{2,}/).slice(0, 500) : [] }, warnings: extractedText ? [] : ["No readable text was found."], language: detectLanguage(extractedText), ...extra };
}

async function pdfResult(bytes: Uint8Array): Promise<DocumentParseResult> {
  const pdfParseModule = await import("pdf-parse");
  const parse = (pdfParseModule.default || pdfParseModule) as unknown as (buffer: Buffer) => Promise<{ text?: string; numpages?: number }>;
  try {
    const result = await parse(Buffer.from(bytes));
    const text = cleanText(result.text || "");
    const pages = Number(result.numpages || 0);
    if (pages > 200) throw new Error("PDF exceeds the 200 page limit.");
    return { parser: "pdf-parse", parserVersion: "1.1", status: text ? "completed" : "needs_review", extractedText: text, structuredContent: { kind: "pdf" }, pageCount: pages || undefined, warnings: text ? [] : ["No selectable PDF text was found. This may be a scanned PDF; OCR is not enabled."], language: detectLanguage(text) };
  } catch (error) {
    return { parser: "pdf-parse", parserVersion: "1.1", status: "failed", extractedText: "", structuredContent: {}, warnings: [error instanceof Error ? error.message : "PDF extraction failed."] };
  }
}

async function docxResult(bytes: Uint8Array): Promise<DocumentParseResult> {
  try {
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    const text = cleanText(result.value || "");
    return { parser: "mammoth", parserVersion: "1", status: text ? "completed" : "needs_review", extractedText: text, structuredContent: { kind: "docx" }, warnings: [...result.messages.map((message) => message.message), ...(text ? [] : ["No readable DOCX text was found."])], language: detectLanguage(text) };
  } catch (error) { return failed("mammoth", error); }
}

async function hwpxResult(bytes: Uint8Array): Promise<DocumentParseResult> {
  const zip = await safeZip(bytes);
  const sections = Object.keys(zip.files).filter((name) => /^Contents\/section\d+\.xml$/i.test(name)).sort();
  const text = cleanText((await Promise.all(sections.map(async (name) => xmlText(await zip.file(name)!.async("string"))))).join("\n\n"));
  return { parser: "hwpx-xml", parserVersion: "1", status: text ? "completed" : "needs_review", extractedText: text, structuredContent: { kind: "hwpx", sections: sections.length }, pageCount: sections.length || undefined, warnings: text ? [] : ["No readable HWPX text was found."], language: detectLanguage(text) };
}

async function odtResult(bytes: Uint8Array): Promise<DocumentParseResult> {
  const zip = await safeZip(bytes);
  const content = zip.file("content.xml");
  const text = cleanText(content ? xmlText(await content.async("string")) : "");
  return { parser: "odt-xml", parserVersion: "1", status: text ? "completed" : "needs_review", extractedText: text, structuredContent: { kind: "odt" }, warnings: text ? [] : ["No readable ODT text was found."], language: detectLanguage(text) };
}

async function pptxResult(bytes: Uint8Array): Promise<DocumentParseResult> {
  const zip = await safeZip(bytes);
  const slides = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name)).sort(naturalSort);
  const slideText = await Promise.all(slides.map(async (name, index) => ({ slide: index + 1, text: cleanText(xmlText(await zip.file(name)!.async("string"))) })));
  const text = cleanText(slideText.map((slide) => `Slide ${slide.slide}\n${slide.text}`).join("\n\n"));
  return { parser: "pptx-xml", parserVersion: "1", status: text ? "completed" : "needs_review", extractedText: text, structuredContent: { kind: "pptx", slides: slideText }, pageCount: slides.length || undefined, warnings: text ? [] : ["No readable slide text was found."], language: detectLanguage(text) };
}

function csvResult(bytes: Uint8Array, filename: string): DocumentParseResult {
  try {
    const rows = parseCsv(decodeText(bytes), { columns: true, skip_empty_lines: true, relax_column_count: true, to: 500 }) as Array<Record<string, string>>;
    const columns = rows[0] ? Object.keys(rows[0]) : [];
    const text = cleanText([columns.join(" | "), ...rows.slice(0, 300).map((row) => columns.map((column) => row[column] || "").join(" | "))].join("\n"));
    return { parser: "csv-parse", parserVersion: "1", status: text ? "completed" : "needs_review", extractedText: text, structuredContent: { kind: "csv", filename, columns, rowCount: rows.length, missingValues: countMissing(rows, columns) }, warnings: rows.length >= 500 ? ["Only the first 500 rows were extracted."] : [], language: detectLanguage(text) };
  } catch (error) { return failed("csv-parse", error); }
}

function xlsxResult(bytes: Uint8Array): DocumentParseResult {
  try {
    const workbook = XLSX.read(Buffer.from(bytes), { type: "buffer", cellFormula: false, cellHTML: false });
    if (workbook.SheetNames.length > 50) throw new Error("Spreadsheet exceeds the 50 sheet limit.");
    const sheets = workbook.SheetNames.map((name) => {
      const sheet = workbook.Sheets[name];
      const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "", blankrows: false }).slice(0, 500);
      const columns = (rows[0] || []).map((value) => String(value));
      return { name, columns, rowCount: rows.length, missingValues: rows.reduce((count, row) => count + row.filter((value) => value === "").length, 0), preview: rows.slice(0, 100) };
    });
    const text = cleanText(sheets.map((sheet) => [`Sheet: ${sheet.name}`, sheet.columns.join(" | "), ...sheet.preview.map((row) => row.join(" | "))].join("\n")).join("\n\n"));
    return { parser: "xlsx", parserVersion: "1", status: text ? "completed" : "needs_review", extractedText: text, structuredContent: { kind: "xlsx", sheets }, warnings: sheets.some((sheet) => sheet.rowCount >= 500) ? ["Only the first 500 rows of each sheet were extracted."] : [], language: detectLanguage(text) };
  } catch (error) { return failed("xlsx", error); }
}

async function safeZip(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes, { createFolders: false, checkCRC32: false });
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  if (entries.length > DOCUMENT_LIMITS.maxArchiveEntries) throw new Error("Archive contains too many entries.");
  // JSZip does not expose archive sizes in its public types. Read them defensively
  // only to enforce a pre-extraction limit; missing metadata remains safe.
  const sizes = entries.map((entry) => (entry as unknown as { _data?: { compressedSize?: number; uncompressedSize?: number } })._data);
  const compressed = sizes.reduce((total, size) => total + Number(size?.compressedSize || 0), 0);
  const uncompressed = sizes.reduce((total, size) => total + Number(size?.uncompressedSize || 0), 0);
  if (uncompressed > DOCUMENT_LIMITS.maxArchiveBytes || (compressed > 0 && uncompressed / compressed > 100)) throw new Error("Archive exceeds safe extraction limits.");
  return zip;
}

function metadataOnly(parser: string, warning: string): DocumentParseResult { return { parser, parserVersion: "1", status: "completed", extractedText: "", structuredContent: { metadata_only: true }, warnings: [warning] }; }
function unsupported(parser: string, warning: string): DocumentParseResult { return { parser, parserVersion: "1", status: "unsupported", extractedText: "", structuredContent: { preserved: true }, warnings: [warning] }; }
function failed(parser: string, error: unknown): DocumentParseResult { return { parser, parserVersion: "1", status: "failed", extractedText: "", structuredContent: {}, warnings: [error instanceof Error ? error.message : "Document extraction failed."] }; }
function decodeText(bytes: Uint8Array) { try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, ""); } catch { throw new Error("Only UTF-8 text is supported."); } }
function cleanText(value: string) { return value.replace(/\u0000/g, "").replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, DOCUMENT_LIMITS.maxTextChars); }
function stripRtf(value: string) { return value.replace(/\\par[d]?/g, "\n").replace(/\\'[0-9a-f]{2}/gi, "").replace(/\\[a-z]+-?\d* ?/gi, "").replace(/[{}]/g, ""); }
function xmlText(value: string) { return value.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"); }
function detectLanguage(text: string): "ko" | "en" | undefined { if (!text) return undefined; return /[가-힣]/.test(text) ? "ko" : /[A-Za-z]/.test(text) ? "en" : undefined; }
function inferDate(filename: string) { const match = filename.match(/(20\d{2})[-_.]?(0[1-9]|1[0-2])[-_.]?([0-3]\d)/); return match ? `${match[1]}-${match[2]}-${match[3]}` : undefined; }
function countMissing(rows: Array<Record<string, string>>, columns: string[]) { return rows.reduce((total, row) => total + columns.filter((column) => !row[column]).length, 0); }
function naturalSort(left: string, right: string) { return left.localeCompare(right, undefined, { numeric: true }); }

function hasExpectedSignature(extension: string, bytes: Uint8Array) {
  const text = new TextDecoder().decode(bytes);
  const zip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (["docx", "hwpx", "odt", "xlsx", "pptx"].includes(extension)) return zip;
  if (extension === "pdf") return text.startsWith("%PDF-");
  if (extension === "rtf") return text.startsWith("{\\rtf");
  if (extension === "hwp") return bytes.slice(0, 8).every((value, index) => value === [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1][index]);
  if (["txt", "md", "csv"].includes(extension)) return !bytes.slice(0, 32).includes(0);
  if (["jpg", "jpeg"].includes(extension)) return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (extension === "png") return bytes[0] === 0x89 && text.slice(1, 4) === "PNG";
  if (extension === "webp") return text.slice(0, 4) === "RIFF" && text.slice(8, 12) === "WEBP";
  if (extension === "heic" || extension === "m4a") return text.slice(4, 8) === "ftyp";
  if (extension === "wav") return text.slice(0, 4) === "RIFF" && text.slice(8, 12) === "WAVE";
  if (extension === "mp3") return text.startsWith("ID3") || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
  return false;
}
