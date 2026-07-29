import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import {
  identifyProjectByAlias,
  normalizeProjectAlias,
  type ChatRequestPayload,
  type MemoryRecord,
  type ProjectRecord
} from "@heather/core";

type JsonRecord = Record<string, unknown>;
type ContextClient = { client: SupabaseClient; user: User };

const SEED_FILES: Array<{ file: string; itemType: "identity" | "preference" | "project" | "operational" | "sensitive" | "project_registry" }> = [
  { file: "user-profile.ko.json", itemType: "identity" },
  { file: "user-preferences.ko.json", itemType: "preference" },
  { file: "project-registry.ko.json", itemType: "project_registry" },
  { file: "project-memories.ko.json", itemType: "project" },
  { file: "operational-context.ko.json", itemType: "operational" },
  { file: "sensitive-memory-review.ko.json", itemType: "sensitive" }
];

export type ContextOverview = {
  projects: Array<JsonRecord>;
  connectors: Array<JsonRecord>;
  approvals: Array<JsonRecord>;
  auditLogs: Array<JsonRecord>;
  memoryCounts: Record<string, number>;
};

export class ContextControlError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export async function requireContextUser(request: Request): Promise<ContextClient> {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new ContextControlError("Heather storage is not configured.", 503);
  if (!token) throw new ContextControlError("Sign in is required.", 401);

  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new ContextControlError("Your session is no longer valid. Please sign in again.", 401);
  return { client, user: data.user };
}

export async function getContextOverview(context: ContextClient): Promise<ContextOverview> {
  const [projects, connectors, approvals, auditLogs, identity, preferences, projectMemories, operational, sensitive] = await Promise.all([
    context.client.from("context_projects").select("id, slug, name, description, status, priority, project_type, visibility, updated_at, context_project_aliases(alias), project_resources(id, label, resource_type, url, health_status, last_checked_at)").order("updated_at", { ascending: false }),
    context.client.from("context_connectors").select("id, connector_type, display_name, status, scopes, last_checked_at").order("connector_type"),
    context.client.from("approval_requests").select("id, capability, action_summary, permission_level, status, created_at, project_id").order("created_at", { ascending: false }).limit(20),
    context.client.from("action_audit_logs").select("id, capability, action_summary, status, created_at, project_id").order("created_at", { ascending: false }).limit(30),
    context.client.from("identity_memories").select("id", { count: "exact", head: true }),
    context.client.from("preference_memories").select("id", { count: "exact", head: true }),
    context.client.from("project_context_memories").select("id", { count: "exact", head: true }),
    context.client.from("operational_contexts").select("id", { count: "exact", head: true }),
    context.client.from("sensitive_memories").select("id", { count: "exact", head: true })
  ]);

  const failure = [projects, connectors, approvals, auditLogs, identity, preferences, projectMemories, operational, sensitive].find((result) => result.error)?.error;
  if (failure) throw new ContextControlError("Context storage needs the latest Heather database migration.", 503);

  return {
    projects: (projects.data || []) as JsonRecord[],
    connectors: (connectors.data || []) as JsonRecord[],
    approvals: (approvals.data || []) as JsonRecord[],
    auditLogs: (auditLogs.data || []) as JsonRecord[],
    memoryCounts: {
      identity: identity.count || 0,
      preference: preferences.count || 0,
      project: projectMemories.count || 0,
      operational: operational.count || 0,
      sensitive: sensitive.count || 0
    }
  };
}

export async function getProjectDetail(context: ContextClient, projectId: string) {
  const { data: project, error } = await context.client
    .from("context_projects")
    .select("id, slug, name, description, status, priority, project_type, visibility, operational_state, created_at, updated_at, context_project_aliases(id, alias, normalized_alias), project_resources(id, label, resource_type, url, canonical_url, metadata, health_status, last_checked_at, updated_at), project_context_memories(id, title, content, source, last_reviewed_at, valid_until, updated_at), operational_contexts(id, title, content, source, last_reviewed_at, valid_until, updated_at)")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw new ContextControlError("Could not load this project.", 503);
  if (!project) throw new ContextControlError("Project not found.", 404);
  return project as JsonRecord;
}

export async function createProject(context: ContextClient, input: JsonRecord) {
  const name = requireText(input.name, "Project name", 160);
  const slug = slugify(requireText(input.slug || name, "Project slug", 80));
  const aliases = arrayOfStrings(input.aliases).slice(0, 20);
  const { data, error } = await context.client
    .from("context_projects")
    .insert({
      owner_user_id: context.user.id,
      slug,
      name,
      description: optionalText(input.description, 2000),
      status: allowed(input.status, ["idea", "planning", "active", "paused", "blocked", "completed", "archived"], "planning"),
      priority: allowed(input.priority, ["highest", "high", "medium", "low"], "medium"),
      project_type: optionalText(input.project_type || input.category, 80) || "personal",
      visibility: "private",
      operational_state: {
        ...asObject(input.operational_state),
        current_phase: optionalText(input.current_phase, 240),
        objectives: arrayOfStrings(input.objectives).slice(0, 20),
        next_actions: arrayOfStrings(input.next_actions).slice(0, 20)
      }
    })
    .select("id, slug, name, description, status, priority, project_type, visibility, updated_at")
    .single();
  if (error) throw new ContextControlError(error.code === "23505" ? "A project with this slug already exists." : "Could not create the project.", 400);
  await insertAliases(context, String(data.id), [name, ...aliases]);
  await createAudit(context, { capability: "project.create", actionSummary: `Created project ${name}`, status: "executed", projectId: String(data.id) });
  return data as JsonRecord;
}

export async function createProjectResource(context: ContextClient, projectId: string, input: JsonRecord) {
  const label = requireText(input.label, "Resource label", 200);
  const url = normalizePublicUrl(requireText(input.url, "Resource URL", 2048));
  const type = allowed(input.resource_type, ["github_repository", "vercel_project", "supabase_project", "google_drive", "google_doc", "youtube_channel", "web_url", "other"], "web_url");
  const { data, error } = await context.client
    .from("project_resources")
    .insert({ project_id: projectId, user_id: context.user.id, resource_type: type, label, url, canonical_url: url, metadata: {} })
    .select("id, label, resource_type, url, canonical_url, health_status, last_checked_at")
    .single();
  if (error) throw new ContextControlError(error.code === "23505" ? "This resource is already registered." : "Could not add the resource.", 400);
  await createAudit(context, { capability: "project.resource.create", actionSummary: `Registered resource ${label}`, status: "executed", projectId });
  return data as JsonRecord;
}

export async function createSeedPreview(context: ContextClient) {
  const seedItems = await readSeedItems();
  const summary = seedItems.reduce<Record<string, number>>((result, item) => {
    result[item.item_type] = (result[item.item_type] || 0) + 1;
    return result;
  }, {});
  const { data: batch, error } = await context.client
    .from("context_import_batches")
    .insert({ user_id: context.user.id, source: "personal-context-seed", status: "preview", summary })
    .select("id, source, status, summary, created_at")
    .single();
  if (error || !batch) throw new ContextControlError("Could not create the import preview.", 503);
  const { data: items, error: itemError } = await context.client
    .from("context_import_items")
    .insert(seedItems.map((item) => ({
      batch_id: batch.id,
      item_type: item.item_type,
      payload: item.payload,
      recommended_action: item.recommended_action,
      selected: item.recommended_action === "import"
    })))
    .select("id, item_type, payload, recommended_action, selected, status");
  if (itemError) throw new ContextControlError("Could not save the import preview.", 503);
  return { batch, items: items || [] };
}

export async function getSeedPreview(context: ContextClient, batchId: string) {
  const { data: batch, error } = await context.client.from("context_import_batches").select("id, source, status, summary, created_at, committed_at").eq("id", batchId).maybeSingle();
  if (error || !batch) throw new ContextControlError("Import preview not found.", 404);
  const { data: items, error: itemError } = await context.client.from("context_import_items").select("id, item_type, payload, recommended_action, selected, status, error_message").eq("batch_id", batchId).order("created_at");
  if (itemError) throw new ContextControlError("Could not load the import preview.", 503);
  return { batch, items: items || [] };
}

export async function commitSeedPreview(context: ContextClient, batchId: string, selectedItemIds: string[]) {
  const preview = await getSeedPreview(context, batchId);
  if (preview.batch.status !== "preview") throw new ContextControlError("This import preview has already been finalized.", 409);
  const selected = new Set(selectedItemIds);
  const results = { imported: 0, skipped: 0, failed: 0 };
  for (const rawItem of preview.items as Array<JsonRecord>) {
    const itemId = String(rawItem.id);
    const choose = selected.has(itemId);
    if (!choose) {
      await context.client.from("context_import_items").update({ selected: false, status: "skipped" }).eq("id", itemId);
      results.skipped += 1;
      continue;
    }
    try {
      await importSeedItem(context, String(rawItem.item_type), asObject(rawItem.payload));
      await context.client.from("context_import_items").update({ selected: true, status: "imported", error_message: null }).eq("id", itemId);
      results.imported += 1;
    } catch (error) {
      await context.client.from("context_import_items").update({ selected: true, status: "failed", error_message: safeError(error) }).eq("id", itemId);
      results.failed += 1;
    }
  }
  await context.client.from("context_import_batches").update({ status: "committed", committed_at: new Date().toISOString(), summary: results }).eq("id", batchId);
  await createAudit(context, { capability: "context.import.commit", actionSummary: "Imported selected personal context seed items", status: "executed" });
  return results;
}

export async function updateApproval(context: ContextClient, approvalId: string, status: "approved" | "rejected") {
  const { data, error } = await context.client
    .from("approval_requests")
    .update({ status, decided_at: new Date().toISOString() })
    .eq("id", approvalId)
    .eq("status", "pending")
    .select("id, capability, action_summary, status, project_id")
    .maybeSingle();
  if (error || !data) throw new ContextControlError("Approval request not found or already decided.", 404);
  await createAudit(context, { capability: String(data.capability), actionSummary: String(data.action_summary), status, projectId: data.project_id ? String(data.project_id) : undefined });
  return data;
}

export async function getGithubPublicRead(resourceUrl: string) {
  const url = normalizePublicUrl(resourceUrl);
  const parsed = new URL(url);
  if (parsed.hostname !== "github.com") throw new ContextControlError("Only a public GitHub repository URL can be read here.");
  const [owner, repo] = parsed.pathname.split("/").filter(Boolean);
  if (!owner || !repo) throw new ContextControlError("A GitHub repository URL must include owner and repository.");
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "Heather-AI-Assistant" };
  const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, { headers, signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new ContextControlError(response.status === 404 ? "The public GitHub repository was not found." : "GitHub could not be reached right now.", 502);
  const repository = await response.json() as JsonRecord;
  const commitResponse = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?per_page=5`, { headers, signal: AbortSignal.timeout(8000) });
  const commits = commitResponse.ok ? await commitResponse.json() : [];
  return {
    repository: {
      fullName: repository.full_name,
      description: repository.description,
      defaultBranch: repository.default_branch,
      pushedAt: repository.pushed_at,
      openIssues: repository.open_issues_count,
      htmlUrl: repository.html_url
    },
    commits: Array.isArray(commits) ? commits.map((commit) => ({
      sha: String(commit?.sha || "").slice(0, 10),
      message: String(commit?.commit?.message || "").split("\n")[0],
      date: commit?.commit?.author?.date || null,
      url: commit?.html_url || null
    })) : []
  };
}

export async function resolveChatContext(context: ContextClient, message: string) {
  const { data: projectRows, error: projectError } = await context.client
    .from("context_projects")
    .select("id, name, description, status, priority, context_project_aliases(alias)")
    .order("updated_at", { ascending: false })
    .limit(30);
  if (projectError || !projectRows?.length) return null;
  const match = identifyProjectByAlias(message, projectRows.map((project) => ({ id: String(project.id), name: String(project.name), aliases: ((project.context_project_aliases || []) as Array<{ alias: string }>).map((alias) => alias.alias) })));
  if (!match) return null;
  const project = projectRows.find((row) => String(row.id) === match.projectId);
  if (!project) return null;
  const [memories, operations] = await Promise.all([
    context.client.from("project_context_memories").select("title, content, source, valid_until").eq("project_id", match.projectId).or(`valid_until.is.null,valid_until.gt.${new Date().toISOString()}`).order("updated_at", { ascending: false }).limit(5),
    context.client.from("operational_contexts").select("title, content, source, valid_until").eq("project_id", match.projectId).or(`valid_until.is.null,valid_until.gt.${new Date().toISOString()}`).order("updated_at", { ascending: false }).limit(3)
  ]);
  return {
    project: {
      id: String(project.id),
      name: String(project.name),
      description: String(project.description || ""),
      status: String(project.status),
      priority: String(project.priority)
    },
    memories: [...(memories.data || []), ...(operations.data || [])].map((item) => ({ title: String(item.title), content: String(item.content), source: String(item.source || "manual") }))
  };
}

/** Adds only alias-matched, non-sensitive context to an existing chat payload. */
export async function enrichChatPayloadFromContext(request: Request, payload: ChatRequestPayload): Promise<ChatRequestPayload> {
  try {
    const context = await requireContextUser(request);
    const resolved = await resolveChatContext(context, payload.message);
    if (!resolved) return payload;
    const now = new Date().toISOString();
    const project: ProjectRecord = {
      id: `context_${resolved.project.id}`,
      title: resolved.project.name,
      description: resolved.project.description,
      status: toLegacyStatus(resolved.project.status),
      priority: toLegacyPriority(resolved.project.priority),
      related_people: [],
      key_links: [],
      notes: resolved.memories.map((memory) => memory.content).slice(0, 5),
      decisions: [],
      next_actions: [],
      created_at: now,
      updated_at: now
    };
    const memories: MemoryRecord[] = resolved.memories.map((memory, index) => ({
      id: `context_memory_${resolved.project.id}_${index}`,
      type: "project_context",
      content: `${memory.title}: ${memory.content}`,
      source: memory.source,
      confidence: 1,
      tags: ["context-project", resolved.project.name],
      created_at: now,
      updated_at: now,
      archived: false
    }));
    return { ...payload, projects: [project, ...payload.projects].slice(0, 8), memories: [...memories, ...payload.memories].slice(0, 18) };
  } catch {
    // Context control is additive; an unavailable migration or expired session never blocks chat.
    return payload;
  }
}

async function readSeedItems(): Promise<Array<{ item_type: "identity" | "preference" | "project" | "operational" | "sensitive" | "project_registry"; payload: JsonRecord; recommended_action: "import" | "review" | "exclude" }>> {
  const directory = path.join(process.cwd(), "data", "seed", "personal-context");
  const output: Array<{ item_type: "identity" | "preference" | "project" | "operational" | "sensitive" | "project_registry"; payload: JsonRecord; recommended_action: "import" | "review" | "exclude" }> = [];
  for (const file of SEED_FILES) {
    const parsed = JSON.parse(await readFile(path.join(directory, file.file), "utf8")) as unknown;
    const values = Array.isArray(parsed) ? parsed : Array.isArray((parsed as JsonRecord).items) ? (parsed as JsonRecord).items as unknown[] : [];
    for (const value of values) {
      const payload = asObject(value);
      const recommended = allowed(payload.recommended_action, ["import", "review", "exclude"], file.itemType === "sensitive" ? "exclude" : "import") as "import" | "review" | "exclude";
      output.push({ item_type: file.itemType, payload, recommended_action: recommended });
    }
  }
  return output;
}

async function importSeedItem(context: ContextClient, itemType: string, payload: JsonRecord) {
  if (itemType === "project_registry") {
    const project = await createProject(context, payload);
    const resources = Array.isArray(payload.resources) ? payload.resources : [];
    for (const rawResource of resources) {
      const resource = asObject(rawResource);
      await createProjectResource(context, String(project.id), {
        label: resource.label || resource.name,
        url: resource.url,
        resource_type: seedResourceType(resource.resource_type || resource.type)
      });
    }
    return;
  }
  const memory = toMemoryInsert(context.user.id, payload);
  if (itemType === "identity") return insertRow(context.client, "identity_memories", memory);
  if (itemType === "preference") return insertRow(context.client, "preference_memories", memory);
  if (itemType === "sensitive") return insertRow(context.client, "sensitive_memories", { user_id: context.user.id, title: memory.title, content: memory.content, category: optionalText(payload.category, 80) || "private_note", source: memory.source });
  if (itemType === "operational") {
    const { temporal_stability: _temporalStability, ...operationalMemory } = memory;
    return insertRow(context.client, "operational_contexts", { ...operationalMemory, project_id: await resolveSeedProjectId(context, payload) });
  }
  if (itemType === "project") return insertRow(context.client, "project_context_memories", { ...memory, project_id: await resolveSeedProjectId(context, payload) });
  throw new ContextControlError("Unsupported import item.");
}

async function resolveSeedProjectId(context: ContextClient, payload: JsonRecord) {
  const slug = optionalText(payload.project_slug, 80) || optionalText(asObject(payload.structured_content).project_slug, 80);
  if (!slug) throw new ContextControlError("Project memory is missing project_slug.");
  const { data, error } = await context.client.from("context_projects").select("id").eq("slug", slugify(slug)).maybeSingle();
  if (error || !data) throw new ContextControlError(`Project ${slug} must be imported before its memory.`);
  return data.id;
}

async function insertAliases(context: ContextClient, projectId: string, aliases: string[]) {
  const rows = [...new Set(aliases.map((alias) => alias.trim()).filter(Boolean))].map((alias) => ({ project_id: projectId, alias, normalized_alias: normalizeProjectAlias(alias) }));
  if (!rows.length) return;
  const { error } = await context.client.from("context_project_aliases").upsert(rows, { onConflict: "project_id,normalized_alias", ignoreDuplicates: true });
  if (error) throw new ContextControlError("Could not save project aliases.", 503);
}

async function insertRow(client: SupabaseClient, table: string, value: JsonRecord) {
  const { error } = await client.from(table).insert(value);
  if (error) throw new ContextControlError("Could not save this context item.", 503);
}

async function createAudit(context: ContextClient, input: { capability: string; actionSummary: string; status: "proposed" | "approved" | "rejected" | "executed" | "failed"; projectId?: string }) {
  await context.client.from("action_audit_logs").insert({ user_id: context.user.id, project_id: input.projectId || null, capability: input.capability, action_summary: input.actionSummary, status: input.status, safe_metadata: {} });
}

function toMemoryInsert(userId: string, payload: JsonRecord) {
  return {
    user_id: userId,
    title: requireText(payload.title, "Context title", 200),
    content: requireText(payload.content, "Context content", 20000),
    structured_content: asObject(payload.structured_content),
    confidence: numberInRange(payload.confidence, 1),
    temporal_stability: allowed(payload.temporal_stability, ["stable", "review_periodically", "volatile"], "review_periodically"),
    source: optionalText(payload.source, 120) || "manual",
    last_reviewed_at: validDate(payload.last_reviewed_at) || new Date().toISOString(),
    valid_until: validDate(payload.valid_until)
  };
}

function normalizePublicUrl(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new ContextControlError("Enter a valid http or https URL."); }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new ContextControlError("Only http and https URLs are allowed.");
  if (/^(localhost|127\.|0\.0\.0\.0|169\.254\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/i.test(url.hostname) || url.hostname.endsWith(".local")) throw new ContextControlError("Private network URLs are not allowed.");
  ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"].forEach((key) => url.searchParams.delete(key));
  url.hash = "";
  return url.toString();
}

function requireText(value: unknown, label: string, max: number) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > max) throw new ContextControlError(`${label} is required.`);
  return text;
}
function optionalText(value: unknown, max: number) { const text = typeof value === "string" ? value.trim() : ""; return text && text.length <= max ? text : null; }
function asObject(value: unknown): JsonRecord { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {}; }
function arrayOfStrings(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function allowed(value: unknown, options: string[], fallback: string) { return typeof value === "string" && options.includes(value) ? value : fallback; }
function validDate(value: unknown) { return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null; }
function numberInRange(value: unknown, fallback: number) { return typeof value === "number" && value >= 0 && value <= 1 ? value : fallback; }
function slugify(value: string) { const slug = value.toLowerCase().trim().replace(/[^a-z0-9가-힣]+/g, "-").replace(/^-+|-+$/g, ""); return slug.slice(0, 80) || "project"; }
function safeError(error: unknown) { return error instanceof Error ? error.message.slice(0, 240) : "Import failed."; }
function toLegacyStatus(status: string): ProjectRecord["status"] {
  if (status === "idea") return "idea";
  if (status === "paused") return "paused";
  if (status === "blocked") return "blocked";
  if (status === "completed" || status === "archived") return "done";
  return "active";
}
function toLegacyPriority(priority: string): ProjectRecord["priority"] {
  if (priority === "highest") return "urgent";
  if (priority === "high") return "high";
  if (priority === "low") return "low";
  return "medium";
}
function seedResourceType(value: unknown) {
  if (value === "github_repository") return "github_repository";
  if (value === "vercel_project") return "vercel_project";
  if (value === "supabase_project") return "supabase_project";
  if (value === "google_drive") return "google_drive";
  if (value === "google_doc") return "google_doc";
  if (value === "youtube_channel" || value === "youtube_studio") return "youtube_channel";
  return "web_url";
}
