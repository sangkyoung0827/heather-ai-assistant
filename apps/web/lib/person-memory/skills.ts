import type { ContextClient } from "../context-control/server";
import { ContextControlError, requireContextUser } from "../context-control/server";
import { retrieveDocumentMemoryContext } from "../documents/server";

export type PersonMemorySkillId =
  | "person_memory.get_full_profile"
  | "person_memory.timeline_search";

export type PersonMemorySkillExecution = {
  message: string;
  model: string;
  usedTools: string[];
};

type PersonSkillInput = {
  request: Request;
  skillId: PersonMemorySkillId;
  parameters: Record<string, unknown>;
  message: string;
};

type PersonSkillParameters = {
  personAlias: string;
  aliases: string[];
  memoTitle?: string;
  limit: number;
  includeArchived: boolean;
  locale: "ko" | "en";
};

type MemoRow = {
  id: string;
  title: string;
  current_summary: string;
  status: string;
  updated_at: string;
};

type EntryRow = {
  id: string;
  memo_id: string;
  entry_type: string;
  content: string;
  effective_date: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

type PersonRecord = {
  memoTitle: string;
  content: string;
  date: string;
  source: "personal_memo" | "personal_document";
};

const MAX_ALIAS_LENGTH = 120;
const MAX_MEMO_TITLE_LENGTH = 200;
const MAX_PROFILE_ITEMS = 30;
const MAX_TIMELINE_ITEMS = 50;
const MAX_OUTPUT_LENGTH = 24_000;

export async function executePersonMemorySkill(input: PersonSkillInput): Promise<PersonMemorySkillExecution> {
  const context = await requireContextUser(input.request);
  return runPersonMemorySkill(context, input.skillId, input.parameters, input.message);
}

export async function runPersonMemorySkill(
  context: ContextClient,
  skillId: PersonMemorySkillId,
  rawParameters: Record<string, unknown>,
  message: string
): Promise<PersonMemorySkillExecution> {
  const parameters = parseParameters(rawParameters, message, skillId);
  const records = await loadPersonRecords(context, parameters);
  const output = skillId === "person_memory.timeline_search"
    ? formatTimeline(parameters, records)
    : formatFullProfile(parameters, records);

  return {
    message: output,
    model: `person-memory:${skillId}`,
    usedTools: ["direct_command", "person_memory", skillId]
  };
}

function parseParameters(raw: Record<string, unknown>, message: string, skillId: PersonMemorySkillId): PersonSkillParameters {
  const personAlias = cleanText(raw.person_alias ?? raw.personAlias, MAX_ALIAS_LENGTH);
  if (!personAlias) throw new ContextControlError("인물 Skill에는 person_alias가 필요합니다.", 400);

  const memoTitle = cleanText(raw.memo_title ?? raw.memoTitle, MAX_MEMO_TITLE_LENGTH) || undefined;
  const aliases = unique([personAlias, ...arrayOfStrings(raw.aliases, MAX_ALIAS_LENGTH)]);
  if (aliases.every((alias) => normalize(alias).length < 2) && !memoTitle) {
    throw new ContextControlError("한 글자 별칭은 정확한 memo_title을 함께 지정해야 합니다.", 400);
  }

  const requestedLimit = Number(raw.limit);
  const maximum = skillId === "person_memory.timeline_search" ? MAX_TIMELINE_ITEMS : MAX_PROFILE_ITEMS;
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(Math.trunc(requestedLimit), maximum))
    : skillId === "person_memory.timeline_search" ? 20 : 12;
  const locale = raw.locale === "en" ? "en" : raw.locale === "ko" ? "ko" : /[\u3131-\uD79D]/.test(message) ? "ko" : "en";

  return {
    personAlias,
    aliases,
    memoTitle,
    limit,
    includeArchived: raw.include_archived === true || raw.includeArchived === true,
    locale
  };
}

async function loadPersonRecords(context: ContextClient, parameters: PersonSkillParameters): Promise<PersonRecord[]> {
  const records: PersonRecord[] = [];
  const statuses = parameters.includeArchived ? ["active", "archived"] : ["active"];
  const { data: memos, error: memoError } = await context.client
    .from("personal_memos")
    .select("id,title,current_summary,status,updated_at")
    .eq("user_id", context.user.id)
    .in("status", statuses)
    .order("updated_at", { ascending: false })
    .limit(200);

  const memoRows = memoError
    ? []
    : ((memos || []) as MemoRow[]).filter((memo) => matchesMemoFilter(memo, parameters));
  const memoIds = memoRows.map((memo) => memo.id);
  const memoById = new Map(memoRows.map((memo) => [memo.id, memo]));

  if (memoIds.length) {
    const { data: entries, error: entryError } = await context.client
      .from("personal_memo_entries")
      .select("id,memo_id,entry_type,content,effective_date,status,created_at,updated_at")
      .eq("user_id", context.user.id)
      .in("memo_id", memoIds)
      .neq("status", "deleted")
      .order("created_at", { ascending: false })
      .limit(1000);

    if (!entryError) {
      for (const entry of (entries || []) as EntryRow[]) {
        const memo = memoById.get(entry.memo_id);
        if (!memo) continue;
        const sections = extractPersonSections(entry.content, parameters.aliases);
        for (const section of sections) {
          records.push({
            memoTitle: memo.title,
            content: section,
            date: entry.effective_date || entry.created_at,
            source: "personal_memo"
          });
        }
      }

      for (const memo of memoRows) {
        if (!memo.current_summary || !containsAlias(`${memo.title}\n${memo.current_summary}`, parameters.aliases)) continue;
        records.push({
          memoTitle: memo.title,
          content: memo.current_summary,
          date: memo.updated_at,
          source: "personal_memo"
        });
      }
    }
  }

  const documentQuery = ["개인 메모리", parameters.personAlias, ...parameters.aliases].join(" ");
  const documentMemories = await retrieveDocumentMemoryContext(context, "personal", documentQuery).catch(() => []);
  for (const memory of documentMemories) {
    const sections = extractPersonSections(memory.content, parameters.aliases);
    for (const section of sections) {
      records.push({
        memoTitle: memory.source.replace(/^document:\s*/i, ""),
        content: section,
        date: memory.updated_at || memory.created_at,
        source: "personal_document"
      });
    }
  }

  return deduplicateRecords(records)
    .sort((left, right) => right.date.localeCompare(left.date));
}

function matchesMemoFilter(memo: MemoRow, parameters: PersonSkillParameters) {
  if (!parameters.memoTitle) return true;
  const expected = normalize(parameters.memoTitle);
  const actual = normalize(memo.title);
  return actual === expected || actual.includes(expected);
}

export function extractPersonSections(content: string, aliases: string[]): string[] {
  const normalizedContent = content.replace(/\r\n/g, "\n").trim();
  if (!normalizedContent || !containsAlias(normalizedContent, aliases)) return [];

  const lines = normalizedContent.split("\n");
  const sections: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const heading = lines[index].match(/^(#{1,6})\s+(.+?)\s*$/);
    if (!heading || !containsAlias(heading[2], aliases)) continue;
    const level = heading[1].length;
    let end = index + 1;
    while (end < lines.length) {
      const nextHeading = lines[end].match(/^(#{1,6})\s+(.+?)\s*$/);
      if (nextHeading && nextHeading[1].length <= level) break;
      end += 1;
    }
    const section = lines.slice(index, end).join("\n").trim();
    if (section) sections.push(section.slice(0, 8_000));
  }
  if (sections.length) return unique(sections);

  const paragraphs = normalizedContent
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph && containsAlias(paragraph, aliases))
    .map((paragraph) => paragraph.slice(0, 3_000));
  if (paragraphs.length) return unique(paragraphs);

  return [normalizedContent.slice(0, 3_000)];
}

function formatFullProfile(parameters: PersonSkillParameters, records: PersonRecord[]) {
  if (!records.length) {
    return parameters.locale === "ko"
      ? `“${parameters.personAlias}”와 연결된 개인 메모리를 찾지 못했습니다. 먼저 인물 보고서를 개인 메모리에 저장하거나 별칭을 확인해주세요.`
      : `I could not find personal-memory records linked to “${parameters.personAlias}”. Save the profile report first or check the alias.`;
  }

  const selected = records.slice(0, parameters.limit);
  const header = parameters.locale === "ko"
    ? `# ${parameters.personAlias} 인물 프로필\n\n개인 메모리에서 관련 기록 ${selected.length}건을 확인했습니다.`
    : `# ${parameters.personAlias} profile\n\nFound ${selected.length} relevant personal-memory records.`;
  const body = selected.map((record, index) => {
    const sourceLabel = record.source === "personal_document"
      ? parameters.locale === "ko" ? "업로드 문서" : "uploaded document"
      : parameters.locale === "ko" ? "개인 메모" : "personal memo";
    return `## ${index + 1}. ${record.memoTitle}\n${sourceLabel} · ${formatDate(record.date)}\n\n${record.content}`;
  }).join("\n\n");
  return truncateOutput(`${header}\n\n${body}`);
}

function formatTimeline(parameters: PersonSkillParameters, records: PersonRecord[]) {
  if (!records.length) {
    return parameters.locale === "ko"
      ? `“${parameters.personAlias}”의 최근 사건 기록을 찾지 못했습니다.`
      : `I could not find recent event records for “${parameters.personAlias}”.`;
  }

  const selected = records.slice(0, parameters.limit);
  const header = parameters.locale === "ko"
    ? `# ${parameters.personAlias} 최근 기록\n\n최신순 ${selected.length}건입니다.`
    : `# Recent records for ${parameters.personAlias}\n\n${selected.length} records, newest first.`;
  const body = selected.map((record) => {
    const concise = record.content.length > 1_500 ? `${record.content.slice(0, 1_499)}…` : record.content;
    return `## ${formatDate(record.date)} · ${record.memoTitle}\n\n${concise}`;
  }).join("\n\n");
  return truncateOutput(`${header}\n\n${body}`);
}

function containsAlias(value: string, aliases: string[]) {
  const normalizedValue = normalize(value);
  return aliases.some((alias) => {
    const normalizedAlias = normalize(alias);
    if (!normalizedAlias) return false;
    if (/^[a-z0-9]$/i.test(normalizedAlias)) {
      return new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalizedAlias)}([^a-z0-9]|$)`, "i").test(value.normalize("NFKC"));
    }
    return normalizedValue.includes(normalizedAlias);
  });
}

function deduplicateRecords(records: PersonRecord[]) {
  const seen = new Set<string>();
  return records.filter((record) => {
    const key = `${normalize(record.memoTitle)}:${normalize(record.content)}`;
    if (!record.content.trim() || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function cleanText(value: unknown, limit: number) {
  return typeof value === "string" ? value.normalize("NFKC").trim().slice(0, limit) : "";
}

function arrayOfStrings(value: unknown, limit: number) {
  return Array.isArray(value)
    ? value.flatMap((item) => typeof item === "string" ? [item.normalize("NFKC").trim().slice(0, limit)] : []).filter(Boolean).slice(0, 20)
    : [];
}

function unique(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = normalize(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalize(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

function formatDate(value: string) {
  const matched = value.match(/^\d{4}-\d{2}-\d{2}/);
  return matched?.[0] || "날짜 미상";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function truncateOutput(value: string) {
  return value.length > MAX_OUTPUT_LENGTH ? `${value.slice(0, MAX_OUTPUT_LENGTH - 1)}…` : value;
}
