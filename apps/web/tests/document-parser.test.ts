import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { extractDocument, validateDocumentFile } from "../lib/documents/parser";

test("extracts UTF-8 text and preserves inferred source date", async () => {
  const file = new File(["2025-04-03 personal reflection"], "journal-2025-04-03.txt", { type: "text/plain" });
  const validated = await validateDocumentFile(file);
  const result = await extractDocument(file, validated.extension);
  assert.equal(result.status, "completed");
  assert.equal(result.sourceDate, "2025-04-03");
  assert.match(result.extractedText, /personal reflection/);
});

test("rejects files whose signature does not match the extension", async () => {
  const file = new File(["not a PDF"], "misleading.pdf", { type: "application/pdf" });
  await assert.rejects(() => validateDocumentFile(file), /signature/);
});

test("extracts readable HWPX sections without accepting an arbitrary archive", async () => {
  const archive = new JSZip();
  archive.file("Contents/section0.xml", "<hp:p>HWPX research note</hp:p>");
  const file = new File([await archive.generateAsync({ type: "uint8array" })], "note.hwpx", { type: "application/zip" });
  const validated = await validateDocumentFile(file);
  const result = await extractDocument(file, validated.extension);
  assert.equal(result.parser, "hwpx-xml");
  assert.match(result.extractedText, /research note/);
});

test("extracts CSV, spreadsheet, and presentation structure", async () => {
  const csv = new File(["date,temperature\n2025-04-03,25.2\n"], "experiment.csv", { type: "text/csv" });
  const csvResult = await extractDocument(csv, (await validateDocumentFile(csv)).extension);
  assert.equal(csvResult.parser, "csv-parse");
  assert.deepEqual(csvResult.structuredContent.columns, ["date", "temperature"]);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["DO", "Temperature"], [6.8, 25.2]]), "Run 1");
  const spreadsheet = new File([XLSX.write(workbook, { type: "array", bookType: "xlsx" })], "run.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const xlsxResult = await extractDocument(spreadsheet, (await validateDocumentFile(spreadsheet)).extension);
  assert.equal(xlsxResult.parser, "xlsx");
  assert.match(xlsxResult.extractedText, /Temperature/);

  const archive = new JSZip();
  archive.file("ppt/slides/slide1.xml", "<a:t>DHA production review</a:t>");
  const presentation = new File([await archive.generateAsync({ type: "uint8array" })], "review.pptx", { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
  const pptxResult = await extractDocument(presentation, (await validateDocumentFile(presentation)).extension);
  assert.equal(pptxResult.parser, "pptx-xml");
  assert.match(pptxResult.extractedText, /DHA production review/);
});

test("extracts readable legacy HWP text and preserves audio with explicit warnings", async () => {
  const cfb = XLSX.CFB.utils.cfb_new();
  const header = Buffer.alloc(40);
  Buffer.from("HWP Document File").copy(header);
  const text = Buffer.from("성찰 기록", "utf16le");
  const record = Buffer.alloc(4);
  record.writeUInt32LE(0x43 | (text.length << 20), 0);
  XLSX.CFB.utils.cfb_add(cfb, "FileHeader", header);
  XLSX.CFB.utils.cfb_add(cfb, "BodyText/Section0", Buffer.concat([record, text]));
  const hwp = new File([XLSX.CFB.write(cfb, { type: "buffer" })], "legacy.hwp", { type: "application/x-hwp" });
  const hwpValidation = await validateDocumentFile(hwp);
  const hwpResult = await extractDocument(hwp, hwpValidation.extension);
  assert.equal(hwpResult.status, "completed");
  assert.equal(hwpResult.parser, "hwp-cfb");
  assert.match(hwpResult.extractedText, /성찰 기록/);

  const wav = new File([new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45])], "recording.wav", { type: "audio/wav" });
  const wavValidation = await validateDocumentFile(wav);
  const wavResult = await extractDocument(wav, wavValidation.extension);
  assert.equal(wavResult.status, "unsupported");
  assert.match(wavResult.warnings[0], /transcription/);
});
