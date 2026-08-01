import type { ContextClient } from "../context-control/server";
import { ContextControlError } from "../context-control/server";

export type PersonalMemoAction = "create" | "append" | "update" | "replace" | "delete" | "restore" | "get" | "search" | "list_recent" | "history";
export type PersonalMemoProgress = "personal_memo_request" | "personal_memo_target" | "personal_memo_read" | "personal_memo_write" | "personal_memo_summary" | "personal_memo_verify";

export type PersonalMemoEntry = {
  id: string;
  memo_id: string;
  entry_type: string;
  content: string;
  source_type: string;
  source_message_id: string | null;
  effective_date: string | null;
  supersedes_entry_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type PersonalMemo = {
  id: string;
  title: string;
  normalized_title: string;
  current_summary: string;
  project_id: string | null;
  sensitivity: "normal" | "high" | "sensitive";
  status: "active" | "archived" | "deleted";
  version: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  entries?: PersonalMemoEntry[];
  versions?: PersonalMemoVersion[];
};

export type PersonalMemoVersion = {
  id: string;
  version: number;
  snapshot: Record<string, unknown>;
  change_type: string;
  change_summary: string;
  source_message_id: string | null;
  created_at: string;
};

export type PersonalMemoSkillResult = {
  handled: true;
  action: PersonalMemoAction;
  message: string;
  memo?: PersonalMemo;
  candidates?: PersonalMemo[];
  requiresConfirmation?: boolean;
};

type ParsedIntent = { action: PersonalMemoAction; title?: string; content?: string; query?: string };
type SkillInput = { message: string; conversationId?: string; activeMemoId?: string; sourceMessageId?: string; onProgress?: (stage: PersonalMemoProgress, status: "active" | "completed" | "skipped" | "warning", detail?: string) => void };

const MAX_TITLE_LENGTH = 200;
const MAX_CONTENT_LENGTH = 12_000;
const ACTIVE_CONTEXT_MAX_AGE_MS = 1000 * 60 * 60 * 12;

/** Returns null for normal conversation so callers can continue to the LLM path. */
export async function runPersonalMemoSkill(context: ContextClient, input: SkillInput): Promise<PersonalMemoSkillResult | null> {
  const intent = parsePersonalMemoIntent(input.message);
  if (!intent) return null;

  input.onProgress?.("personal_memo_request", "active");
  input.onProgress?.("personal_memo_request", "completed");

  if (intent.action === "create") return createMemo(context, intent, input);
  if (intent.action === "search") return searchMemos(context, intent, input);
  if (intent.action === "list_recent") return listRecentMemos(context, input);

  const resolved = await resolveTarget(context, intent.title, input.activeMemoId, input.conversationId, input.onProgress);
  if (resolved.candidates?.length) {
    return {
      handled: true,
      action: intent.action,
      candidates: resolved.candidates,
      message: `비슷한 메모가 ${resolved.candidates.length}개 있습니다.\n${resolved.candidates.map((memo, index) => `${index + 1}. ${memo.title}`).join("\n")}\n어느 메모를 사용할까요?`
    };
  }
  if (!resolved.memo) {
    return { handled: true, action: intent.action, message: "대상 메모를 찾지 못했습니다. 메모 제목을 함께 알려주세요." };
  }
  const memo = resolved.memo;

  if (intent.action === "get") return getMemoResponse(context, memo, input);
  if (intent.action === "history") return historyResponse(context, memo, input);
  if (intent.action === "append") return appendMemo(context, memo, intent, input);
  if (intent.action === "update") return updateMemo(context, memo, intent, input);
  if (intent.action === "replace") return replaceMemo(context, memo, intent, input);
  if (intent.action === "delete") return deleteMemo(context, memo, input);
  return restoreMemo(context, memo, input);
}

export async function listPersistentMemos(context: ContextClient, query = "", limit = 100) {
  const rows = await selectMemos(context, ["active", "archived"]);
  const normalized = normalize(query);
  return rows
    .filter((memo) => !normalized || `${memo.title} ${memo.current_summary}`.toLocaleLowerCase().includes(normalized))
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
    .slice(0, Math.max(1, Math.min(limit, 100)));
}

export async function getPersistentMemo(context: ContextClient, id: string) {
  return readMemo(context, id, true);
}

export async function setActivePersonalMemo(context: ContextClient, conversationId: string, memoId: string, action: PersonalMemoAction) {
  if (!conversationId || conversationId.length > 160) return;
  const { error } = await context.client
    .from("conversation_memo_contexts")
    .upsert({ user_id: context.user.id, conversation_id: conversationId, active_memo_id: memoId, last_action: action }, { onConflict: "user_id,conversation_id" });
  if (error) throw storageError(error);
}

export function parsePersonalMemoIntent(message: string): ParsedIntent | null {
  const compact = message.trim();
  const normalized = compact.toLocaleLowerCase();
  const title = extractTitle(compact);
  const query = extractQuery(compact);

  if (/최근\s*(수정한|메모)|recent\s+memo/i.test(compact)) return { action: "list_recent" };
  if (/(수정\s*이력|변경\s*이력|history)/i.test(compact) && /메모|memo/i.test(compact)) return { action: "history", title };
  if (/(?:메모|memo).*(?:삭제|지워|제거)|(?:삭제|지워|제거).*?(?:메모|memo)/i.test(compact)) return { action: "delete", title };
  if (/(?:메모|memo).*(?:복원|되돌)|(?:복원|되돌).*?(?:메모|memo)/i.test(compact)) return { action: "restore", title };
  if (/(전체.*(?:대체|바꿔)|기존\s*내용.*(?:대체|바꿔)|replace.*memo)/i.test(compact)) return { action: "replace", title, content: extractMutationContent(compact) };
  if (/(?:수정|정정|고쳐|바꿔|변경).*(?:메모|memo)|(?:메모|memo).*?(?:수정|정정|고쳐|바꿔|변경)/i.test(compact)) return { action: "update", title, content: extractMutationContent(compact) };
  if (/(?:추가|덧붙|보태|같이\s*넣|기록해).*(?:메모|memo)|(?:메모|memo).*?(?:추가|덧붙|보태|같이\s*넣|기록해)|(?:같은|그|방금|앞의)\s*메모.*?(?:추가|기록|넣)/i.test(compact)) return { action: "append", title, content: extractMutationContent(compact) };
  if (/(?:메모|memo)(?:를|을)?\s*(?:만들|생성|작성|등록)|(?:만들|생성|작성).*?(?:메모|memo)/i.test(compact)) return { action: "create", title, content: extractCreateContent(compact) };
  if (/(?:메모|memo).*?(?:보여|조회|열어)|(?:보여|조회|열어).*?(?:메모|memo)/i.test(compact)) return { action: "get", title };
  if (/(?:메모|memo).*?(?:찾아|검색)|(?:찾아|검색).*?(?:메모|memo)/i.test(compact)) return { action: "search", query: query || title };

  // Avoid treating ordinary references to personal memory or uploaded diaries as memo-write commands.
  void normalized;
  return null;
}

function extractTitle(message: string) {
  if (/(?:같은|그|방금|앞의)\s*메모/i.test(message)) return undefined;
  const matched = message.match(/(?:^|[,.\n]\s*|헤더[,\s]+)(.{2,100}?)(?:이라는|라는)?\s*메모(?:에|를|을|의)?(?=\s|[,.!?]|$)/i);
  if (!matched) return undefined;
  const title = matched[1]
    .replace(/^(?:이것도|같은|그|방금|앞의)\s*/i, "")
    .replace(/^(?:개인\s*)?메모리\s*(?:에|의)?\s*/i, "")
    .trim();
  return title && !/^(같은|그|방금|앞의)$/i.test(title) ? title.slice(0, MAX_TITLE_LENGTH) : undefined;
}

function extractCreateContent(message: string) {
  const lines = message.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (lines.length > 1) return lines.slice(1).join("\n").slice(0, MAX_CONTENT_LENGTH);
  const after = message.replace(/^.*?(?:메모(?:를|을)?\s*(?:만들어|생성|작성|등록)\s*(?:줘|해)?[.!?\s]*)/i, "").trim();
  return after.slice(0, MAX_CONTENT_LENGTH) || undefined;
}

function extractMutationContent(message: string) {
  const lines = message.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (lines.length > 1) return lines.filter((line) => !/(?:메모|memo).*?(?:추가|덧붙|보태|수정|정정|대체|바꿔|삭제|복원)/i.test(line)).join("\n").slice(0, MAX_CONTENT_LENGTH) || undefined;
  const trimmed = message
    .replace(/^(?:헤더[,\s]+)?/i, "")
    .replace(/\s*(?:이것도|이 내용도|다음 내용도)?\s*(?:같은|그|방금|앞의)\s*메모(?:에|를|을)?\s*(?:추가해|덧붙여|보태줘|같이 넣어줘|기록해줘|수정해|정정해|고쳐|바꿔줘|변경해|대체해|전체를.*?바꿔줘).*$/i, "")
    .trim();
  return trimmed.slice(0, MAX_CONTENT_LENGTH) || undefined;
}

function extractQuery(message: string) {
  return message
    .replace(/(?:개인\s*)?메모(?:리)?\s*(?:에서|을|를|에)?\s*/gi, "")
    .replace(/(?:찾아|검색해|보여줘|조회해).*/gi, "")
    .trim()
    .slice(0, 200) || undefined;
}

async function createMemo(context: ContextClient, intent: ParsedIntent, input: SkillInput): Promise<PersonalMemoSkillResult> {
  const title = cleanText(intent.title, MAX_TITLE_LENGTH);
  const content = cleanText(intent.content, MAX_CONTENT_LENGTH);
  if (!title || !content) return { handled: true, action: "create", message: "메모 제목과 첫 내용을 함께 알려주세요. 예: “DHA 핵심 아이디어라는 메모를 만들어줘. 새만금의 핵심 자산은 데이터다.”" };

  input.onProgress?.("personal_memo_target", "active");
  const existing = await findExactMemo(context, title);
  input.onProgress?.("personal_memo_target", existing ? "warning" : "completed");
  if (existing) return { handled: true, action: "create", memo: existing, message: `“${existing.title}” 메모가 이미 있습니다. 새 내용을 추가하려면 “${existing.title} 메모에 추가해줘”라고 말해 주세요.` };

  input.onProgress?.("personal_memo_write", "active");
  const { data: inserted, error } = await context.client
    .from("personal_memos")
    .insert({ user_id: context.user.id, title, normalized_title: normalize(title), current_summary: "", sensitivity: "normal", status: "active", version: 0 })
    .select("*")
    .single();
  if (error || !inserted) throw storageError(error);
  const memo = mapMemo(inserted);
  const entry = await insertEntry(context, memo.id, "initial", content, input.sourceMessageId);
  input.onProgress?.("personal_memo_write", "completed");
  const refreshed = await refreshAndVerify(context, memo.id, "create", "초기 메모를 생성했습니다.", input.sourceMessageId, entry.id, input);
  await rememberContext(context, input, refreshed.id, "create");
  return { handled: true, action: "create", memo: refreshed, message: `“${refreshed.title}” 메모를 생성했습니다.` };
}

async function appendMemo(context: ContextClient, memo: PersonalMemo, intent: ParsedIntent, input: SkillInput): Promise<PersonalMemoSkillResult> {
  const content = cleanText(intent.content, MAX_CONTENT_LENGTH);
  if (!content) return { handled: true, action: "append", memo, message: `“${memo.title}” 메모에 추가할 내용을 함께 알려주세요.` };
  input.onProgress?.("personal_memo_read", "active");
  await readMemo(context, memo.id, false);
  input.onProgress?.("personal_memo_read", "completed");
  input.onProgress?.("personal_memo_write", "active");
  const entry = await insertEntry(context, memo.id, "append", content, input.sourceMessageId);
  input.onProgress?.("personal_memo_write", "completed");
  const refreshed = await refreshAndVerify(context, memo.id, "append", "새 항목을 추가했습니다.", input.sourceMessageId, entry.id, input);
  await rememberContext(context, input, refreshed.id, "append");
  return { handled: true, action: "append", memo: refreshed, message: `“${refreshed.title}” 메모에 새 내용을 추가했습니다.` };
}

async function updateMemo(context: ContextClient, memo: PersonalMemo, intent: ParsedIntent, input: SkillInput): Promise<PersonalMemoSkillResult> {
  const content = cleanText(intent.content, MAX_CONTENT_LENGTH);
  if (!content) return { handled: true, action: "update", memo, message: `“${memo.title}” 메모에서 수정할 내용과 새 문장을 함께 알려주세요.` };
  input.onProgress?.("personal_memo_read", "active");
  const detailed = await readMemo(context, memo.id, true);
  const target = selectEntryForCorrection(detailed.entries || [], content);
  input.onProgress?.("personal_memo_read", target ? "completed" : "warning");
  if (!target) return { handled: true, action: "update", memo: detailed, message: `“${memo.title}” 메모에서 어떤 기존 항목을 수정할지 분명하지 않습니다. 기존 문장과 바꿀 문장을 함께 알려주세요.` };
  input.onProgress?.("personal_memo_write", "active");
  const { error } = await context.client.from("personal_memo_entries").update({ status: "superseded" }).eq("id", target.id).eq("memo_id", memo.id);
  if (error) throw storageError(error);
  const entry = await insertEntry(context, memo.id, "correction", content, input.sourceMessageId, target.id);
  input.onProgress?.("personal_memo_write", "completed");
  const refreshed = await refreshAndVerify(context, memo.id, "update", "기존 항목을 정정했습니다.", input.sourceMessageId, entry.id, input);
  await rememberContext(context, input, refreshed.id, "update");
  return { handled: true, action: "update", memo: refreshed, message: `“${refreshed.title}” 메모의 내용을 수정했습니다. 이전 내용은 수정 이력에 보존했습니다.` };
}

async function replaceMemo(context: ContextClient, memo: PersonalMemo, intent: ParsedIntent, input: SkillInput): Promise<PersonalMemoSkillResult> {
  const content = cleanText(intent.content, MAX_CONTENT_LENGTH);
  if (!hasDestructiveConfirmation(input.message)) return { handled: true, action: "replace", memo, requiresConfirmation: true, message: `“${memo.title}” 메모 전체를 바꾸려면 이전 항목을 보존한 채 새 정리본으로 대체합니다. 실행하려면 “${memo.title} 메모 전체 대체 확정”과 새 내용을 함께 보내주세요.` };
  if (!content) return { handled: true, action: "replace", memo, message: "전체 대체할 새 내용을 함께 알려주세요." };
  input.onProgress?.("personal_memo_read", "active");
  const detailed = await readMemo(context, memo.id, true);
  input.onProgress?.("personal_memo_read", "completed");
  input.onProgress?.("personal_memo_write", "active");
  const activeIds = (detailed.entries || []).filter((entry) => entry.status === "active").map((entry) => entry.id);
  if (activeIds.length) {
    const { error } = await context.client.from("personal_memo_entries").update({ status: "superseded" }).in("id", activeIds);
    if (error) throw storageError(error);
  }
  const entry = await insertEntry(context, memo.id, "replacement", content, input.sourceMessageId);
  input.onProgress?.("personal_memo_write", "completed");
  const refreshed = await refreshAndVerify(context, memo.id, "replace", "전체 정리본을 대체했습니다.", input.sourceMessageId, entry.id, input);
  await rememberContext(context, input, refreshed.id, "replace");
  return { handled: true, action: "replace", memo: refreshed, message: `“${refreshed.title}” 메모를 새 내용으로 정리했습니다. 이전 항목은 수정 이력에 보존했습니다.` };
}

async function deleteMemo(context: ContextClient, memo: PersonalMemo, input: SkillInput): Promise<PersonalMemoSkillResult> {
  if (!hasDestructiveConfirmation(input.message)) return { handled: true, action: "delete", memo, requiresConfirmation: true, message: `“${memo.title}” 메모를 삭제하면 일반 목록에서는 숨겨지고 복원할 수 있습니다. 실행하려면 “${memo.title} 메모 삭제 확정”이라고 말해 주세요.` };
  input.onProgress?.("personal_memo_write", "active");
  const now = new Date().toISOString();
  const { error } = await context.client.from("personal_memos").update({ status: "deleted", deleted_at: now }).eq("id", memo.id).eq("user_id", context.user.id);
  if (error) throw storageError(error);
  input.onProgress?.("personal_memo_write", "completed");
  const refreshed = await createVersionAndVerify(context, memo.id, "delete", "메모를 삭제 상태로 변경했습니다.", input.sourceMessageId, input);
  return { handled: true, action: "delete", memo: refreshed, message: `“${refreshed.title}” 메모를 삭제했습니다. 수정 이력은 보존되며 복원할 수 있습니다.` };
}

async function restoreMemo(context: ContextClient, memo: PersonalMemo, input: SkillInput): Promise<PersonalMemoSkillResult> {
  input.onProgress?.("personal_memo_write", "active");
  const { error } = await context.client.from("personal_memos").update({ status: "active", deleted_at: null }).eq("id", memo.id).eq("user_id", context.user.id);
  if (error) throw storageError(error);
  input.onProgress?.("personal_memo_write", "completed");
  const refreshed = await createVersionAndVerify(context, memo.id, "restore", "메모를 복원했습니다.", input.sourceMessageId, input);
  await rememberContext(context, input, refreshed.id, "restore");
  return { handled: true, action: "restore", memo: refreshed, message: `“${refreshed.title}” 메모를 복원했습니다.` };
}

async function getMemoResponse(context: ContextClient, memo: PersonalMemo, input: SkillInput): Promise<PersonalMemoSkillResult> {
  input.onProgress?.("personal_memo_read", "active");
  const detailed = await readMemo(context, memo.id, true);
  input.onProgress?.("personal_memo_read", "completed");
  await rememberContext(context, input, detailed.id, "get");
  return { handled: true, action: "get", memo: detailed, message: formatMemo(detailed) };
}

async function historyResponse(context: ContextClient, memo: PersonalMemo, input: SkillInput): Promise<PersonalMemoSkillResult> {
  input.onProgress?.("personal_memo_read", "active");
  const detailed = await readMemo(context, memo.id, true);
  input.onProgress?.("personal_memo_read", "completed");
  await rememberContext(context, input, detailed.id, "history");
  const history = detailed.versions || [];
  return { handled: true, action: "history", memo: detailed, message: history.length ? `“${detailed.title}” 메모 수정 이력\n${history.map((version) => `• v${version.version} · ${version.change_summary} · ${formatDate(version.created_at)}`).join("\n")}` : `“${detailed.title}” 메모에는 아직 수정 이력이 없습니다.` };
}

async function searchMemos(context: ContextClient, intent: ParsedIntent, input: SkillInput): Promise<PersonalMemoSkillResult> {
  input.onProgress?.("personal_memo_target", "active");
  const memos = await listPersistentMemos(context, intent.query || "", 8);
  input.onProgress?.("personal_memo_target", "completed");
  return { handled: true, action: "search", candidates: memos, message: memos.length ? `메모 검색 결과\n${memos.map((memo) => `• ${memo.title}\n${memo.current_summary.slice(0, 180)}`).join("\n\n")}` : "일치하는 개인 메모를 찾지 못했습니다." };
}

async function listRecentMemos(context: ContextClient, input: SkillInput): Promise<PersonalMemoSkillResult> {
  input.onProgress?.("personal_memo_target", "active");
  const memos = await listPersistentMemos(context, "", 5);
  input.onProgress?.("personal_memo_target", "completed");
  return { handled: true, action: "list_recent", candidates: memos, message: memos.length ? `최근 수정한 메모\n${memos.map((memo) => `• ${memo.title} · ${formatDate(memo.updated_at)}`).join("\n")}` : "최근 수정한 누적형 개인 메모가 없습니다." };
}

async function resolveTarget(context: ContextClient, title: string | undefined, activeMemoId: string | undefined, conversationId: string | undefined, report: SkillInput["onProgress"]) {
  report?.("personal_memo_target", "active");
  const memos = await selectMemos(context, ["active", "archived", "deleted"]);
  const normalizedTitle = title ? normalize(title) : "";
  const exact = normalizedTitle ? memos.find((memo) => memo.normalized_title === normalizedTitle) : undefined;
  if (exact) { report?.("personal_memo_target", "completed", exact.title); return { memo: exact }; }
  const active = await readActiveMemoContext(context, activeMemoId, conversationId);
  if (active) { report?.("personal_memo_target", "completed", active.title); return { memo: active }; }
  if (!normalizedTitle) { report?.("personal_memo_target", "warning"); return {}; }
  const candidates = scoreCandidates(memos.filter((memo) => memo.status !== "deleted"), normalizedTitle);
  if (candidates.length === 1 || candidates.length > 1 && candidateConfidence(candidates[0], normalizedTitle) >= .72 && candidateConfidence(candidates[0], normalizedTitle) - candidateConfidence(candidates[1], normalizedTitle) >= .18) {
    report?.("personal_memo_target", "completed", candidates[0].title);
    return { memo: candidates[0] };
  }
  report?.("personal_memo_target", candidates.length ? "warning" : "completed");
  return candidates.length ? { candidates: candidates.slice(0, 3) } : {};
}

async function readActiveMemoContext(context: ContextClient, activeMemoId?: string, conversationId?: string) {
  if (activeMemoId && isUuid(activeMemoId)) {
    const memo = await readMemo(context, activeMemoId, false).catch(() => null);
    if (memo?.status === "active") return memo;
  }
  if (!conversationId) return null;
  const { data, error } = await context.client.from("conversation_memo_contexts").select("active_memo_id,updated_at").eq("user_id", context.user.id).eq("conversation_id", conversationId).maybeSingle();
  if (error || !data || Date.now() - new Date(String(data.updated_at)).getTime() > ACTIVE_CONTEXT_MAX_AGE_MS) return null;
  const memo = await readMemo(context, String(data.active_memo_id), false).catch(() => null);
  return memo?.status === "active" ? memo : null;
}

async function findExactMemo(context: ContextClient, title: string) {
  const { data, error } = await context.client.from("personal_memos").select("*").eq("user_id", context.user.id).eq("normalized_title", normalize(title)).neq("status", "deleted").maybeSingle();
  if (error) throw storageError(error);
  return data ? mapMemo(data) : null;
}

async function selectMemos(context: ContextClient, statuses: Array<PersonalMemo["status"]>) {
  const { data, error } = await context.client.from("personal_memos").select("*").eq("user_id", context.user.id).in("status", statuses).order("updated_at", { ascending: false }).limit(100);
  if (error) throw storageError(error);
  return (data || []).map(mapMemo);
}

async function readMemo(context: ContextClient, id: string, includeDetails: boolean): Promise<PersonalMemo> {
  const { data: memoRow, error: memoError } = await context.client.from("personal_memos").select("*").eq("id", id).eq("user_id", context.user.id).maybeSingle();
  if (memoError) throw storageError(memoError);
  if (!memoRow) throw new ContextControlError("Personal memo not found.", 404);
  const memo = mapMemo(memoRow);
  if (!includeDetails) return memo;
  const [entries, versions] = await Promise.all([
    context.client.from("personal_memo_entries").select("*").eq("memo_id", id).eq("user_id", context.user.id).order("created_at", { ascending: true }),
    context.client.from("personal_memo_versions").select("*").eq("memo_id", id).eq("user_id", context.user.id).order("version", { ascending: false }).limit(30)
  ]);
  if (entries.error) throw storageError(entries.error);
  if (versions.error) throw storageError(versions.error);
  return { ...memo, entries: (entries.data || []).map(mapEntry), versions: (versions.data || []).map(mapVersion) };
}

async function insertEntry(context: ContextClient, memoId: string, entryType: PersonalMemoEntry["entry_type"], content: string, sourceMessageId?: string, supersedesEntryId?: string) {
  const { data, error } = await context.client.from("personal_memo_entries").insert({
    memo_id: memoId,
    user_id: context.user.id,
    entry_type: entryType,
    content,
    normalized_content: normalize(content),
    source_type: "chat_command",
    source_message_id: sourceMessageId || null,
    supersedes_entry_id: supersedesEntryId || null,
    status: "active"
  }).select("*").single();
  if (error || !data) throw storageError(error);
  return mapEntry(data);
}

async function refreshAndVerify(context: ContextClient, memoId: string, changeType: string, changeSummary: string, sourceMessageId: string | undefined, expectedEntryId: string, input: SkillInput) {
  input.onProgress?.("personal_memo_summary", "active");
  const current = await readMemo(context, memoId, true);
  const summary = summarizeEntries(current.entries || []);
  const { error } = await context.client.from("personal_memos").update({ current_summary: summary }).eq("id", memoId).eq("user_id", context.user.id);
  if (error) {
    input.onProgress?.("personal_memo_summary", "warning");
    const persisted = await readMemo(context, memoId, true);
    if (!(persisted.entries || []).some((entry) => entry.id === expectedEntryId)) throw storageError(error);
    // A summary refresh is best-effort; the immutable entry has already been
    // written. Still create and verify a version so the write remains auditable.
    return createVersionAndVerify(context, memoId, changeType, changeSummary, sourceMessageId, input, expectedEntryId);
  }
  input.onProgress?.("personal_memo_summary", "completed");
  return createVersionAndVerify(context, memoId, changeType, changeSummary, sourceMessageId, input, expectedEntryId);
}

async function createVersionAndVerify(context: ContextClient, memoId: string, changeType: string, changeSummary: string, sourceMessageId: string | undefined, input: SkillInput, expectedEntryId?: string) {
  const before = await readMemo(context, memoId, true);
  const nextVersion = before.version + 1;
  const snapshot = createSnapshot(before, nextVersion);
  const { error: updateError } = await context.client.from("personal_memos").update({ version: nextVersion }).eq("id", memoId).eq("user_id", context.user.id);
  if (updateError) throw storageError(updateError);
  const { error: versionError } = await context.client.from("personal_memo_versions").insert({ memo_id: memoId, user_id: context.user.id, version: nextVersion, snapshot, change_type: changeType, change_summary: changeSummary, source_message_id: sourceMessageId || null });
  if (versionError) throw storageError(versionError);
  input.onProgress?.("personal_memo_verify", "active");
  const verified = await readMemo(context, memoId, true);
  if (verified.version !== nextVersion || expectedEntryId && !(verified.entries || []).some((entry) => entry.id === expectedEntryId)) throw new ContextControlError("Personal memo write could not be verified.", 503);
  input.onProgress?.("personal_memo_verify", "completed");
  return verified;
}

function createSnapshot(memo: PersonalMemo, version: number) {
  return {
    title: memo.title,
    current_summary: memo.current_summary,
    status: memo.status,
    sensitivity: memo.sensitivity,
    version,
    active_entries: (memo.entries || []).filter((entry) => entry.status === "active").map((entry) => ({ id: entry.id, entry_type: entry.entry_type, content: entry.content, effective_date: entry.effective_date }))
  };
}

function summarizeEntries(entries: PersonalMemoEntry[]) {
  const seen = new Set<string>();
  const active = entries.filter((entry) => entry.status === "active" && entry.entry_type !== "deletion");
  const unique = active.filter((entry) => {
    const key = normalize(entry.content);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return unique.slice(-12).map((entry) => `• ${entry.content}`).join("\n").slice(0, 8_000);
}

function selectEntryForCorrection(entries: PersonalMemoEntry[], nextContent: string) {
  const active = entries.filter((entry) => entry.status === "active");
  if (active.length === 1) return active[0];
  const terms = keywords(nextContent);
  const ranked = active.map((entry) => ({ entry, score: keywords(entry.content).filter((term) => terms.includes(term)).length })).sort((left, right) => right.score - left.score);
  return ranked[0]?.score && (!ranked[1] || ranked[0].score > ranked[1].score) ? ranked[0].entry : null;
}

function scoreCandidates(memos: PersonalMemo[], target: string) {
  return [...memos].sort((left, right) => candidateConfidence(right, target) - candidateConfidence(left, target)).filter((memo) => candidateConfidence(memo, target) >= .25);
}

function candidateConfidence(memo: PersonalMemo, target: string) {
  if (memo.normalized_title === target) return 1;
  const targetWords = keywords(target);
  const haystack = `${memo.normalized_title} ${normalize(memo.current_summary)}`;
  const hits = targetWords.filter((word) => haystack.includes(word)).length;
  return targetWords.length ? hits / targetWords.length : 0;
}

async function rememberContext(context: ContextClient, input: SkillInput, memoId: string, action: PersonalMemoAction) {
  if (!input.conversationId) return;
  await setActivePersonalMemo(context, input.conversationId, memoId, action);
}

function formatMemo(memo: PersonalMemo) {
  const entries = (memo.entries || []).filter((entry) => entry.status === "active");
  const summary = memo.current_summary || summarizeEntries(entries) || "아직 정리된 내용이 없습니다.";
  return `“${memo.title}” 메모\n\n현재 정리본\n${summary}\n\n최초 생성: ${formatDate(memo.created_at)}\n최근 수정: ${formatDate(memo.updated_at)}\n활성 항목: ${entries.length}개\n버전: v${memo.version}${memo.project_id ? "\n연결 프로젝트: 있음" : ""}`;
}

function mapMemo(row: Record<string, unknown>): PersonalMemo {
  return { id: String(row.id), title: String(row.title), normalized_title: String(row.normalized_title), current_summary: String(row.current_summary || ""), project_id: row.project_id ? String(row.project_id) : null, sensitivity: (row.sensitivity || "normal") as PersonalMemo["sensitivity"], status: (row.status || "active") as PersonalMemo["status"], version: Number(row.version || 0), created_at: String(row.created_at), updated_at: String(row.updated_at), deleted_at: row.deleted_at ? String(row.deleted_at) : null };
}

function mapEntry(row: Record<string, unknown>): PersonalMemoEntry {
  return { id: String(row.id), memo_id: String(row.memo_id), entry_type: String(row.entry_type), content: String(row.content), source_type: String(row.source_type), source_message_id: row.source_message_id ? String(row.source_message_id) : null, effective_date: row.effective_date ? String(row.effective_date) : null, supersedes_entry_id: row.supersedes_entry_id ? String(row.supersedes_entry_id) : null, status: String(row.status), created_at: String(row.created_at), updated_at: String(row.updated_at) };
}

function mapVersion(row: Record<string, unknown>): PersonalMemoVersion {
  return { id: String(row.id), version: Number(row.version), snapshot: row.snapshot && typeof row.snapshot === "object" ? row.snapshot as Record<string, unknown> : {}, change_type: String(row.change_type), change_summary: String(row.change_summary), source_message_id: row.source_message_id ? String(row.source_message_id) : null, created_at: String(row.created_at) };
}

function storageError(error: { message?: string; code?: string } | null | undefined) {
  if (error?.code === "42P01" || /personal_memo/i.test(error?.message || "")) return new ContextControlError("누적형 개인 메모리를 사용하려면 최신 Heather 데이터베이스 migration이 필요합니다.", 503);
  return new ContextControlError("개인 메모리를 저장하거나 읽지 못했습니다. 잠시 후 다시 시도해 주세요.", 503);
}

function cleanText(value: string | undefined, limit: number) { const text = value?.trim(); return text && text.length <= limit ? text : undefined; }
function normalize(value: string) { return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " "); }
function keywords(value: string) { return normalize(value).split(" ").filter((word) => word.length >= 2); }
function hasDestructiveConfirmation(value: string) { return /(?:삭제|대체).*(?:확정|확인)|(?:확정|확인).*(?:삭제|대체)/i.test(value); }
function formatDate(value: string) { return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "numeric", day: "numeric" }).format(new Date(value)); }
function isUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
