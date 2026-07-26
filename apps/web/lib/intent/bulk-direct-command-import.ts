import { normalizeIntentText } from "./direct-command-engine";
import type { DirectCommandInput, DirectCommandRecord } from "./direct-command-repository";

export const BULK_IMPORT_LIMITS = { fileBytes: 5 * 1024 * 1024, commands: 1000, triggers: 20, title: 200, trigger: 500, response: 10000, tags: 20 } as const;
const HEADER = "HEATHER_DIRECT_COMMAND_FILE_VERSION: 1";
const START = "=== HEATHER_DIRECT_COMMAND ===";
const END = "=== END ===";

export type BulkImportError = { index: number; message: string };
export type BulkPreviewSummary = { total: number; create: number; merge: number; duplicate: number; error: number };
export type BulkOperation = "create" | "merge" | "duplicate" | "error";
export type BulkPreviewItem = { input?: DirectCommandInput; status: BulkOperation; existingId?: string; error?: string };

export function parseHeatherDirectCommandFile(source: string): { inputs: Array<DirectCommandInput | null>; errors: BulkImportError[] } {
  const text = source.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  if (!text.startsWith(HEADER)) throw new Error("지원하지 않는 Heather Direct Command 파일 버전입니다.");
  const remainder = text.slice(HEADER.length).trim();
  if (!remainder) return { inputs: [], errors: [] };
  const blocks = remainder.split(START);
  if (blocks.shift()?.trim()) throw new Error("명령 시작 구분자가 올바르지 않습니다.");
  if (blocks.length > BULK_IMPORT_LIMITS.commands) throw new Error(`명령은 최대 ${BULK_IMPORT_LIMITS.commands}개까지 등록할 수 있습니다.`);
  const inputs: Array<DirectCommandInput | null> = [];
  const errors: BulkImportError[] = [];
  blocks.forEach((raw, index) => {
    const number = index + 1;
    try {
      const closing = raw.lastIndexOf(END);
      if (closing < 0 || raw.slice(closing + END.length).trim()) throw new Error("시작/종료 구분자가 맞지 않습니다.");
      const body = raw.slice(0, closing).trim();
      inputs.push(parseBlock(body));
    } catch (error) {
      inputs.push(null);
      errors.push({ index: number, message: error instanceof Error ? error.message : "형식이 올바르지 않습니다." });
    }
  });
  return { inputs, errors };
}

export function previewBulkImport(inputs: Array<DirectCommandInput | null>, existing: DirectCommandRecord[]): { items: BulkPreviewItem[]; summary: BulkPreviewSummary } {
  const byTrigger = new Map<string, DirectCommandRecord>();
  const byResponse = new Map<string, DirectCommandRecord>();
  existing.forEach((command) => {
    [command.canonicalTrigger, ...command.triggers].forEach((trigger) => byTrigger.set(normalizeIntentText(trigger), command));
    byResponse.set(normalizeResponse(command.response), command);
  });
  const items: BulkPreviewItem[] = [];
  const seenFileTriggers = new Map<string, { response: string; index: number }>();
  inputs.forEach((input, index) => {
    if (!input) { items.push({ status: "error", error: "형식이 잘못된 항목입니다." }); return; }
    const responseKey = normalizeResponse(input.response);
    const triggers = [input.canonicalTrigger, ...(input.triggers || [])];
    const internalConflict = triggers.find((trigger) => {
      const previous = seenFileTriggers.get(normalizeIntentText(trigger));
      return previous && previous.response !== responseKey;
    });
    if (internalConflict) { items.push({ status: "error", error: `파일 내부에서 같은 트리거가 다른 응답으로 중복되었습니다: ${internalConflict}` }); return; }
    const sameFile = triggers.every((trigger) => seenFileTriggers.has(normalizeIntentText(trigger)));
    triggers.forEach((trigger) => seenFileTriggers.set(normalizeIntentText(trigger), { response: responseKey, index }));
    if (sameFile) { items.push({ input, status: "duplicate" }); return; }
    const matched = triggers.map((trigger) => byTrigger.get(normalizeIntentText(trigger))).find(Boolean);
    if (matched && normalizeResponse(matched.response) !== responseKey) { items.push({ input, status: "error", existingId: matched.id, error: "기존 트리거가 다른 응답에 연결되어 있습니다." }); return; }
    const target = matched || byResponse.get(responseKey);
    if (!target) { items.push({ input, status: "create" }); return; }
    const known = new Set([target.canonicalTrigger, ...target.triggers].map(normalizeIntentText));
    const adds = triggers.some((trigger) => !known.has(normalizeIntentText(trigger)));
    items.push({ input, status: adds ? "merge" : "duplicate", existingId: target.id });
  });
  return { items, summary: summarize(items) };
}

export function summarize(items: BulkPreviewItem[]): BulkPreviewSummary { return items.reduce<BulkPreviewSummary>((summary, item) => { summary.total += 1; summary[item.status] += 1; return summary; }, { total: 0, create: 0, merge: 0, duplicate: 0, error: 0 }); }

function parseBlock(body: string): DirectCommandInput {
  const lines = body.split("\n");
  const fields = new Map<string, string[]>();
  let current: string | null = null;
  for (const rawLine of lines) {
    const field = rawLine.match(/^(TITLE|TRIGGER|TRIGGERS|RESPONSE|TAGS|ENABLED):\s*(.*)$/);
    if (field) { current = field[1]; fields.set(current, field[2] ? [field[2]] : []); continue; }
    if (!current) { if (rawLine.trim()) throw new Error("필드 밖의 텍스트가 포함되어 있습니다."); continue; }
    if (/^[A-Z_]+:/.test(rawLine)) throw new Error("지원하지 않는 필드가 포함되어 있습니다.");
    fields.get(current)!.push(rawLine);
  }
  const title = oneLine(fields.get("TITLE"), "TITLE", BULK_IMPORT_LIMITS.title);
  const canonicalTrigger = oneLine(fields.get("TRIGGER"), "TRIGGER", BULK_IMPORT_LIMITS.trigger);
  const response = (fields.get("RESPONSE") || []).join("\n").trim();
  if (!response) throw new Error("RESPONSE가 비어 있습니다.");
  if (response.length > BULK_IMPORT_LIMITS.response) throw new Error("RESPONSE가 너무 깁니다.");
  const triggers = list(fields.get("TRIGGERS"), "TRIGGERS", BULK_IMPORT_LIMITS.triggers, BULK_IMPORT_LIMITS.trigger);
  const tags = list(fields.get("TAGS"), "TAGS", BULK_IMPORT_LIMITS.tags, BULK_IMPORT_LIMITS.title);
  const enabledRaw = (fields.get("ENABLED") || []).join("\n").trim();
  if (enabledRaw && enabledRaw !== "true" && enabledRaw !== "false") throw new Error("ENABLED는 true 또는 false여야 합니다.");
  return validateBulkInput({ title, canonicalTrigger, triggers, response, tags, enabled: enabledRaw !== "false" });
}
export function validateBulkInput(input: DirectCommandInput): DirectCommandInput {
  const title = input.title?.trim();
  const canonicalTrigger = input.canonicalTrigger?.trim();
  const response = input.response?.trim();
  if (!title || !canonicalTrigger || !response) throw new Error("제목, 대표 트리거, 응답은 모두 필요합니다.");
  if (title.length > BULK_IMPORT_LIMITS.title) throw new Error("제목이 너무 깁니다.");
  if (canonicalTrigger.length > BULK_IMPORT_LIMITS.trigger) throw new Error("대표 트리거가 너무 깁니다.");
  if (response.length > BULK_IMPORT_LIMITS.response) throw new Error("응답이 너무 깁니다.");
  const triggers = unique(canonicalTrigger, (input.triggers || []).map((value) => value.trim()).filter(Boolean));
  if (triggers.length > BULK_IMPORT_LIMITS.triggers) throw new Error(`추가 트리거는 최대 ${BULK_IMPORT_LIMITS.triggers}개까지 가능합니다.`);
  const tags = uniqueTags((input.tags || []).map((value) => value.trim()).filter(Boolean));
  if (tags.length > BULK_IMPORT_LIMITS.tags) throw new Error(`태그는 최대 ${BULK_IMPORT_LIMITS.tags}개까지 가능합니다.`);
  return { title, canonicalTrigger, triggers, response, tags, enabled: input.enabled !== false };
}

export function isSafeBulkDirectCommand(input: DirectCommandInput): string | null {
  const text = `${input.title}\n${input.canonicalTrigger}\n${(input.triggers || []).join("\n")}\n${input.response}`.normalize("NFKC").toLocaleLowerCase();
  if (/(현재\s*(시간|날짜|날씨|주가|환율|뉴스|일정|시스템)|오늘\s*(시간|날짜|날씨|일정)|today'?s?\s*(weather|date|schedule)|current\s*(time|weather|price|status)|latest\s*news)/i.test(text)) return "실시간 또는 동적 정보는 고정 직접명령으로 등록할 수 없습니다.";
  if (/(삭제|덮어쓰기|이동|결제|구매|주문|송금|이메일.*발송|비밀번호|토큰|쿠키|delete|overwrite|payment|purchase|password|token|cookie|send\s*email)/i.test(text)) return "위험하거나 민감한 작업은 직접명령으로 등록할 수 없습니다.";
  if (/(의료|법률|투자\s*판단|medical\s*advice|legal\s*advice|investment\s*advice)/i.test(text)) return "의료, 법률, 투자 판단은 고정 직접명령으로 등록할 수 없습니다.";
  return null;
}
function oneLine(lines: string[] | undefined, name: string, limit: number) { const value = (lines || []).join("\n").trim(); if (!value) throw new Error(`${name}이(가) 비어 있습니다.`); if (value.includes("\n")) throw new Error(`${name}은(는) 한 줄이어야 합니다.`); if (value.length > limit) throw new Error(`${name}이(가) 너무 깁니다.`); return value; }
function list(lines: string[] | undefined, name: string, count: number, length: number) { const values = (lines || []).map((line) => line.trim()).filter(Boolean).map((line) => { if (!line.startsWith("- ")) throw new Error(`${name} 항목은 '- '로 시작해야 합니다.`); const value = line.slice(2).trim(); if (!value || value.length > length) throw new Error(`${name} 항목이 올바르지 않습니다.`); return value; }); if (values.length > count) throw new Error(`${name}은(는) 최대 ${count}개까지 가능합니다.`); return values; }
function unique(canonical: string, values: string[]) { const seen = new Set<string>(canonical ? [normalizeIntentText(canonical)] : []); return values.filter((value) => { const normalized = normalizeIntentText(value); if (!normalized || seen.has(normalized)) return false; seen.add(normalized); return true; }); }
function uniqueTags(values: string[]) { const seen = new Set<string>(); return values.filter((value) => { const normalized = value.normalize("NFKC").trim().toLocaleLowerCase(); if (!normalized || seen.has(normalized)) return false; seen.add(normalized); return true; }); }
function normalizeResponse(value: string) { return value.normalize("NFKC").trim().replace(/\s+/g, " "); }
