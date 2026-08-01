import type { SupabaseClient } from "@supabase/supabase-js";
import { ContextControlError, type ContextClient } from "../context-control/server";

export const QUICK_LINK_CATEGORIES = ["work", "project", "content"] as const;
export type QuickLinkCategory = typeof QUICK_LINK_CATEGORIES[number];
export type QuickLinkAction = "create" | "update" | "delete" | "move" | "list";

export type QuickLink = {
  id: string;
  project_id: string | null;
  name: string;
  normalized_name: string;
  url: string;
  canonical_url: string;
  hostname: string;
  provider: string | null;
  icon_key: string | null;
  favicon_url: string | null;
  category: string;
  display_order: number;
  pinned: boolean;
  open_mode: "external" | "same_tab";
  status_mode: "active" | "hidden";
  created_by: "manual_ui" | "chat_command" | "project_import" | "seed";
  created_at: string;
  updated_at: string;
};

export type QuickLinkIntent = {
  action: QuickLinkAction;
  name?: string;
  url?: string;
  category?: QuickLinkCategory;
  sourceCategory?: QuickLinkCategory;
  displayOrder?: number;
  pinned: boolean;
  openMode?: "external" | "same_tab";
};

export type QuickLinkCommandResult = {
  handled: true;
  message: string;
  action: QuickLinkAction;
  link?: QuickLink;
  links?: QuickLink[];
  changed: boolean;
  usedTools: string[];
};

type CreateInput = { name: string; url: string; category: QuickLinkCategory; projectId?: string | null; displayOrder?: number | null; pinned?: boolean; openMode?: "external" | "same_tab"; createdBy: QuickLink["created_by"] };
type UpdateInput = Partial<Pick<CreateInput, "name" | "url" | "category" | "projectId" | "displayOrder" | "pinned" | "openMode">>;

export function parseQuickLinkIntent(message: string): QuickLinkIntent | null {
  const action = detectAction(message);
  if (!action) return null;
  const url = extractUrl(message);
  const category = detectCategory(message);
  const moveCategories = action === "move" ? extractMoveCategories(message) : null;
  const name = action === "list" ? undefined : extractLinkName(message, url);
  return { action, name, url, category: moveCategories?.to || category || undefined, sourceCategory: moveCategories?.from, displayOrder: /첫\s*번째|첫번째|first\b/i.test(message) ? 0 : undefined, pinned: true, openMode: "external" };
}

export async function executeQuickLinkIntent(context: ContextClient, message: string): Promise<QuickLinkCommandResult | null> {
  const intent = parseQuickLinkIntent(message);
  if (!intent) return null;
  const locale = containsHangul(message) ? "ko" : "en";
  const links = await listQuickLinks(context);

  if (intent.action === "list") return { handled: true, changed: false, action: "list", links, usedTools: ["quick_link_list"], message: listMessage(links, locale) };
  if (!intent.name) return { handled: true, changed: false, action: intent.action, usedTools: ["quick_link_intent"], message: locale === "ko" ? "대상 링크 이름을 알려주세요." : "Please tell me which link to update." };

  if (intent.action === "create") {
    if (!intent.url) return { handled: true, changed: false, action: "create", usedTools: ["quick_link_create"], message: missingUrlMessage(intent.name, intent.category, locale) };
    if (!intent.category) return { handled: true, changed: false, action: "create", usedTools: ["quick_link_create"], message: locale === "ko" ? "업무, 프로젝트, 콘텐츠 중 등록할 영역을 알려주세요." : "Please choose work, project, or content for this link." };
    const name = preferredName(intent.name, intent.url);
    const result = await createQuickLink(context, { name, url: intent.url, category: intent.category, displayOrder: intent.displayOrder, pinned: intent.pinned, openMode: intent.openMode, createdBy: "chat_command" });
    if (result.kind === "created") return { handled: true, changed: true, action: "create", link: result.link, links: result.links, usedTools: ["quick_link_create", "quick_link_duplicate_check", "quick_link_list"], message: successMessage(result.link, locale) };
    return { handled: true, changed: false, action: "create", link: result.link, usedTools: ["quick_link_duplicate_check"], message: duplicateMessage(result.kind, result.link, intent.category, locale) };
  }

  const candidates = findByName(links, intent.name, intent.sourceCategory);
  if (!candidates.length) return { handled: true, changed: false, action: intent.action, usedTools: ["quick_link_list"], message: notFoundMessage(intent.name, locale) };
  if (candidates.length > 1) return { handled: true, changed: false, action: intent.action, links: candidates, usedTools: ["quick_link_list"], message: locale === "ko" ? `“${intent.name}” 이름의 링크가 여러 개 있습니다. 카테고리나 주소를 함께 알려주세요.` : `There are multiple links named “${intent.name}”. Please include the category or URL.` };
  const target = candidates[0];

  if (intent.action === "delete") {
    await deleteQuickLink(context, target.id);
    const after = await listQuickLinks(context);
    if (after.some((link) => link.id === target.id)) throw new ContextControlError("Could not verify quick link deletion.", 503);
    return { handled: true, changed: true, action: "delete", links: after, usedTools: ["quick_link_delete", "quick_link_list"], message: locale === "ko" ? `${target.name}을(를) 삭제했습니다.` : `Deleted ${target.name}.` };
  }

  if (intent.action === "move") {
    if (!intent.category) return { handled: true, changed: false, action: "move", usedTools: ["quick_link_move"], message: locale === "ko" ? "옮길 영역(업무, 프로젝트, 콘텐츠)을 알려주세요." : "Please tell me where to move the link." };
    const moved = await moveQuickLink(context, target, intent.category, intent.displayOrder);
    return { handled: true, changed: true, action: "move", link: moved.link, links: moved.links, usedTools: ["quick_link_move", "quick_link_list"], message: locale === "ko" ? `${moved.link.name}을(를) ${categoryLabel(moved.link.category, locale)} 영역으로 옮겼습니다.` : `Moved ${moved.link.name} to ${categoryLabel(moved.link.category, locale)}.` };
  }

  if (!intent.url) return { handled: true, changed: false, action: "update", usedTools: ["quick_link_update"], message: locale === "ko" ? `${target.name}의 새 주소를 알려주세요. 확인 후 변경하겠습니다.` : `Please provide the new URL for ${target.name}.` };
  const updated = await updateQuickLink(context, target, { url: intent.url });
  return { handled: true, changed: true, action: "update", link: updated.link, links: updated.links, usedTools: ["quick_link_update", "quick_link_duplicate_check", "quick_link_list"], message: locale === "ko" ? `${updated.link.name}의 주소를 변경했습니다.` : `Updated the URL for ${updated.link.name}.` };
}

export async function listQuickLinks(context: ContextClient) {
  const { data, error } = await context.client.from("quick_links").select("*").eq("user_id", context.user.id).eq("status_mode", "active").order("category").order("pinned", { ascending: false }).order("display_order").order("created_at");
  if (error) throw new ContextControlError("Could not load Quick Access links. Apply migration 011 and try again.", 503);
  return (data || []) as QuickLink[];
}

export async function createQuickLink(context: ContextClient, input: CreateInput): Promise<{ kind: "created" | "same_url_same_name" | "same_url_different_name" | "same_name_different_url"; link: QuickLink; links: QuickLink[] }> {
  const url = normalizeQuickLinkUrl(input.url);
  const name = cleanName(input.name);
  if (!name) throw new ContextControlError("A quick link needs a name.", 400);
  const category = ensureCategory(input.category);
  const links = await listQuickLinks(context);
  const duplicate = checkQuickLinkDuplicates(links, { name, canonicalUrl: url.canonicalUrl, category });
  if (duplicate) return { kind: duplicate.kind, link: duplicate.link, links };
  const displayOrder = await resolveDisplayOrder(context.client, context.user.id, category, input.displayOrder);
  if (displayOrder === 0 && input.displayOrder === 0) await shiftCategoryOrders(context.client, context.user.id, category);
  const { data, error } = await context.client.from("quick_links").insert({ user_id: context.user.id, project_id: input.projectId || null, name, normalized_name: normalizeName(name), url: url.url, canonical_url: url.canonicalUrl, hostname: url.hostname, provider: providerForHostname(url.hostname), icon_key: iconKeyForHostname(url.hostname), favicon_url: null, category, display_order: displayOrder, pinned: input.pinned ?? true, open_mode: input.openMode || "external", status_mode: "active", created_by: input.createdBy }).select("*").single();
  if (error || !data) throw new ContextControlError(error?.code === "23505" ? "This URL is already registered." : "Could not save this Quick Access link.", 503);
  const link = await getQuickLink(context, String(data.id));
  const after = await listQuickLinks(context);
  if (!after.some((item) => item.id === link.id)) throw new ContextControlError("Could not verify Quick Access registration.", 503);
  return { kind: "created", link, links: after };
}

export async function updateQuickLink(context: ContextClient, target: QuickLink, input: UpdateInput) {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) { const name = cleanName(input.name); if (!name) throw new ContextControlError("A quick link needs a name.", 400); patch.name = name; patch.normalized_name = normalizeName(name); }
  if (input.url !== undefined) { const normalized = normalizeQuickLinkUrl(input.url); const links = await listQuickLinks(context); const duplicate = links.find((link) => link.id !== target.id && link.canonical_url === normalized.canonicalUrl); if (duplicate) throw new ContextControlError(`This URL is already registered as ${duplicate.name}.`, 409); Object.assign(patch, { url: normalized.url, canonical_url: normalized.canonicalUrl, hostname: normalized.hostname, provider: providerForHostname(normalized.hostname), icon_key: iconKeyForHostname(normalized.hostname), favicon_url: null }); }
  if (input.category) patch.category = ensureCategory(input.category);
  if (input.projectId !== undefined) patch.project_id = input.projectId;
  if (input.pinned !== undefined) patch.pinned = input.pinned;
  if (input.openMode) patch.open_mode = input.openMode;
  if (input.displayOrder !== undefined && input.displayOrder !== null) patch.display_order = Math.max(0, Math.floor(input.displayOrder));
  if (!Object.keys(patch).length) throw new ContextControlError("No Quick Access changes were provided.", 400);
  const { error } = await context.client.from("quick_links").update(patch).eq("id", target.id).eq("user_id", context.user.id);
  if (error) throw new ContextControlError("Could not update this Quick Access link.", 503);
  const link = await getQuickLink(context, target.id);
  const links = await listQuickLinks(context);
  return { link, links };
}

export async function moveQuickLink(context: ContextClient, target: QuickLink, category: QuickLinkCategory, displayOrder?: number) {
  const nextOrder = await resolveDisplayOrder(context.client, context.user.id, category, displayOrder);
  if (nextOrder === 0 && displayOrder === 0) await shiftCategoryOrders(context.client, context.user.id, category, target.id);
  return updateQuickLink(context, target, { category, displayOrder: nextOrder });
}

export async function deleteQuickLink(context: ContextClient, id: string) {
  const { error } = await context.client.from("quick_links").delete().eq("id", id).eq("user_id", context.user.id);
  if (error) throw new ContextControlError("Could not delete this Quick Access link.", 503);
}

export async function getQuickLink(context: ContextClient, id: string) {
  const { data, error } = await context.client.from("quick_links").select("*").eq("id", id).eq("user_id", context.user.id).maybeSingle();
  if (error || !data) throw new ContextControlError("Could not verify this Quick Access link.", 503);
  return data as QuickLink;
}

export function checkQuickLinkDuplicates(links: QuickLink[], input: { name: string; canonicalUrl: string; category: QuickLinkCategory }) {
  const sameUrl = links.find((link) => link.canonical_url === input.canonicalUrl);
  if (sameUrl) return { kind: sameUrl.normalized_name === normalizeName(input.name) && sameUrl.category === input.category ? "same_url_same_name" as const : "same_url_different_name" as const, link: sameUrl };
  const sameName = links.find((link) => link.category === input.category && link.normalized_name === normalizeName(input.name));
  return sameName ? { kind: "same_name_different_url" as const, link: sameName } : null;
}

export function normalizeQuickLinkUrl(input: string) {
  let parsed: URL;
  try { parsed = new URL(input.trim()); } catch { throw new ContextControlError("Please provide a valid http or https URL.", 400); }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new ContextControlError("Please provide a valid http or https URL.", 400);
  if (!parsed.hostname || isPrivateHostname(parsed.hostname)) throw new ContextControlError("This address cannot be used for Quick Access.", 400);
  parsed.username = ""; parsed.password = ""; parsed.hash = ""; parsed.hostname = parsed.hostname.toLowerCase();
  for (const key of [...parsed.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/i.test(key)) parsed.searchParams.delete(key);
  if (parsed.pathname === "/") parsed.pathname = "/";
  const canonicalUrl = parsed.toString();
  return { url: canonicalUrl, canonicalUrl, hostname: parsed.hostname };
}

function detectAction(message: string): QuickLinkAction | null {
  if (/\b(list|show)\b|목록|리스트|등록된.*(?:사이트|링크)|(?:사이트|링크).*보여/.test(message)) return "list";
  if (/삭제|지워|제거|\b(delete|remove)\b/i.test(message)) return "delete";
  if (/옮겨|이동|\bmove\b/i.test(message)) return "move";
  if (/주소.*(?:바꿔|변경|수정)|링크.*(?:바꿔|변경|수정)|\b(update|rename|change)\b/i.test(message)) return "update";
  if (/등록|추가|\b(add|register|save)\b/i.test(message)) return "create";
  return null;
}

function extractUrl(message: string) { return message.match(/https?:\/\/[^\s)\]}>]+/i)?.[0]; }
function detectCategory(value: string): QuickLinkCategory | null { const lower = value.toLocaleLowerCase(); if (/콘텐츠|영상|미디어|유튜브|음악|\bcontent\b/.test(lower)) return "content"; if (/프로젝트|사업|개발 프로젝트|\bproject\b/.test(lower)) return "project"; if (/업무|작업|개발|관리|일할 때|\bwork\b/.test(lower)) return "work"; return null; }
function extractMoveCategories(message: string) { const match = message.match(/(업무|작업|개발|관리|일할 때|프로젝트|사업|개발 프로젝트|콘텐츠|영상|미디어|유튜브|음악|work|project|content)\s*(?:에서|from)\s*(업무|작업|개발|관리|일할 때|프로젝트|사업|개발 프로젝트|콘텐츠|영상|미디어|유튜브|음악|work|project|content)\s*(?:으로|로|to)/i); return match ? { from: detectCategory(match[1]) || undefined, to: detectCategory(match[2]) || undefined } : null; }
function extractLinkName(message: string, url?: string) {
  const withoutUrl = url ? message.replace(url, " ") : message;
  const explicit = withoutUrl.match(/(?:이\s*링크\s*)?이름(?:을|은|:)?\s*["“']?(.+?)["”']?\s*(?:으로|로\s*하고|하고)/i)?.[1];
  if (explicit) return cleanName(explicit);
  const patterns = [/(?:헤더\s*[,，]?\s*)?(.+?)(?:의\s*)?주소(?:를|을)?\s*(?:이\s*링크로\s*)?(?:바꿔|변경|수정)/i, /(?:헤더\s*[,，]?\s*)?(.+?)(?:을|를)\s*(?:자주\s*사용하는\s*사이트\s*)?(?:업무|프로젝트|콘텐츠|work|project|content).*?(?:등록|추가|삭제|옮겨|이동|바꿔|변경|수정)/i, /(?:헤더\s*[,，]?\s*)?(.+?)(?:을|를|의)\s*(?:주소|링크|사이트)?\s*(?:을|를)?\s*(?:등록|추가|삭제|옮겨|이동|바꿔|변경|수정)/i];
  for (const pattern of patterns) { const match = withoutUrl.match(pattern); if (match?.[1]) return cleanName(match[1]); }
  return url ? nameForHostname(new URL(url).hostname) : "";
}
function findByName(links: QuickLink[], name: string, category?: QuickLinkCategory) { const normalized = normalizeName(name); return links.filter((link) => link.normalized_name === normalized && (!category || link.category === category)); }
function cleanName(value: string) { return value.replace(/^헤더\s*[,，]?\s*/i, "").replace(/\s+/g, " ").trim().slice(0, 160); }
function normalizeName(value: string) { return cleanName(value).toLocaleLowerCase().replace(/[\s\-_]+/g, " "); }
function preferredName(name: string, url: string) { const cleaned = cleanName(name); const aliases: Record<string, string> = { "유튜브 뮤직": "YouTube Music", "유튜브 스튜디오": "YouTube Studio", "구글 드라이브": "Google Drive", "구글 포토": "Google Photos" }; if (aliases[normalizeName(cleaned)]) return aliases[normalizeName(cleaned)]; if (cleaned) return cleaned; try { return nameForHostname(new URL(url).hostname); } catch { return ""; } }
function nameForHostname(hostname: string) { const host = hostname.toLocaleLowerCase(); if (host === "music.youtube.com") return "YouTube Music"; if (host === "studio.youtube.com") return "YouTube Studio"; if (host === "drive.google.com") return "Google Drive"; if (host === "photos.google.com") return "Google Photos"; if (host === "github.com" || host.endsWith(".github.com")) return "GitHub"; if (host === "vercel.com" || host.endsWith(".vercel.app")) return "Vercel"; if (host === "supabase.com") return "Supabase"; return ""; }
function providerForHostname(hostname: string) { return nameForHostname(hostname) || null; }
function iconKeyForHostname(hostname: string) { const provider = providerForHostname(hostname); return provider ? provider.toLocaleLowerCase().replace(/\s+/g, "-") : hostname.split(".")[0] || null; }
function ensureCategory(value: string): QuickLinkCategory { if ((QUICK_LINK_CATEGORIES as readonly string[]).includes(value)) return value as QuickLinkCategory; throw new ContextControlError("Choose work, project, or content for this Quick Access link.", 400); }
function isPrivateHostname(hostname: string) { const host = hostname.toLocaleLowerCase().replace(/^\[|\]$/g, ""); if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host === "::1" || /^fc|^fd|^fe80/.test(host)) return true; const parts = host.split(".").map(Number); if (parts.length !== 4 || parts.some(Number.isNaN)) return false; return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 || (parts[0] === 169 && parts[1] === 254) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168); }
async function resolveDisplayOrder(client: SupabaseClient, userId: string, category: QuickLinkCategory, requested?: number | null) { if (requested !== undefined && requested !== null) return Math.max(0, Math.floor(requested)); const { data, error } = await client.from("quick_links").select("display_order").eq("user_id", userId).eq("category", category).order("display_order", { ascending: false }).limit(1); if (error) throw new ContextControlError("Could not determine Quick Access order.", 503); return (data?.[0]?.display_order ?? -1) + 1; }
async function shiftCategoryOrders(client: SupabaseClient, userId: string, category: QuickLinkCategory, excludeId?: string) { const { data, error } = await client.from("quick_links").select("id,display_order").eq("user_id", userId).eq("category", category).order("display_order"); if (error) throw new ContextControlError("Could not update Quick Access order.", 503); for (const link of data || []) if (String(link.id) !== excludeId) { const { error: updateError } = await client.from("quick_links").update({ display_order: Number(link.display_order) + 1 }).eq("id", link.id).eq("user_id", userId); if (updateError) throw new ContextControlError("Could not update Quick Access order.", 503); } }
function categoryLabel(category: string, locale: "ko" | "en") { const labels: Record<string, [string, string]> = { work: ["업무", "Work"], project: ["프로젝트", "Projects"], content: ["콘텐츠", "Content"] }; return labels[category]?.[locale === "ko" ? 0 : 1] || category; }
function containsHangul(value: string) { return /[\u3131-\uD79D]/.test(value); }
function missingUrlMessage(name: string, category: QuickLinkCategory | undefined, locale: "ko" | "en") { return locale === "ko" ? `${name} 주소를 알려주세요. 확인 후 ${categoryLabel(category || "content", locale)} 영역에 등록하겠습니다.` : `Please provide the URL for ${name}. I will register it after checking it.`; }
function successMessage(link: QuickLink, locale: "ko" | "en") { return locale === "ko" ? `${link.name}을(를) ${categoryLabel(link.category, locale)} 영역에 등록했습니다.` : `Added ${link.name} to ${categoryLabel(link.category, locale)}.`; }
function duplicateMessage(kind: "same_url_same_name" | "same_url_different_name" | "same_name_different_url", link: QuickLink, category: QuickLinkCategory, locale: "ko" | "en") { if (locale !== "ko") return kind === "same_url_same_name" ? `${link.name} is already in ${categoryLabel(category, locale)}.` : kind === "same_url_different_name" ? `This URL is already registered as ${link.name}. Would you like to rename it?` : `A link named ${link.name} already exists. Please confirm whether to update it or add another link.`; return kind === "same_url_same_name" ? `${link.name}은(는) 이미 ${categoryLabel(category, locale)} 영역에 등록되어 있습니다.` : kind === "same_url_different_name" ? `같은 주소가 “${link.name}”으로 등록되어 있습니다. 이름을 변경할까요?` : `같은 이름의 링크가 있습니다. 기존 주소를 바꿀지 새 링크로 추가할지 확인이 필요합니다.`; }
function notFoundMessage(name: string, locale: "ko" | "en") { return locale === "ko" ? `“${name}” 링크를 찾지 못했습니다.` : `I could not find a link named “${name}”.`; }
function listMessage(links: QuickLink[], locale: "ko" | "en") { if (!links.length) return locale === "ko" ? "등록된 자주 쓰는 사이트가 없습니다." : "There are no Quick Access links yet."; const grouped = QUICK_LINK_CATEGORIES.map((category) => { const names = links.filter((link) => link.category === category).map((link) => link.name); return names.length ? `${categoryLabel(category, locale)}: ${names.join(", ")}` : ""; }).filter(Boolean); return locale === "ko" ? `등록된 자주 쓰는 사이트입니다.\n${grouped.join("\n")}` : `Your Quick Access links:\n${grouped.join("\n")}`; }
