export type SearchSource = { title: string; url: string; snippet?: string; provider?: string; published_at?: number | null };
export type AgentSearchResult = { message: string; skillId: string; provider: string; cached: boolean; sources: SearchSource[] };
export type AgentSearchProgress = (stage: "web_search_decision" | "web_search" | "source_validation", status: "active" | "completed" | "skipped" | "warning", detail?: { sourceName?: string }) => void;

type RouteResponse = { skill_id?: string | null; confidence?: number };
type ExecuteResponse = { status?: string; skill_id?: string; result?: { message?: string; provider?: string; cached?: boolean; sources?: SearchSource[] } };

const SKILL_CONFIDENCE = 0.85;

export async function runAgentSearch(message: string, accessToken: string | null, locale: "ko" | "en" = "ko", onProgress?: AgentSearchProgress): Promise<AgentSearchResult | null> {
  const baseUrl = process.env.AGENT_RUNTIME_URL?.replace(/\/$/, "");
  if (!baseUrl || !accessToken) {
    onProgress?.("web_search_decision", "skipped");
    return null;
  }
  const headers: Record<string, string> = { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` };
  if (process.env.AGENT_RUNTIME_INTERNAL_TOKEN) headers["X-Agent-Runtime-Token"] = process.env.AGENT_RUNTIME_INTERNAL_TOKEN;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    onProgress?.("web_search_decision", "active");
    const route = await fetch(`${baseUrl}/v1/skills/route`, { method: "POST", headers, body: JSON.stringify({ message, locale, space: "personal" }), cache: "no-store", signal: controller.signal });
    if (!route.ok) { onProgress?.("web_search_decision", "warning"); return null; }
    const decision = await route.json() as RouteResponse;
    if (decision.skill_id !== "general_web_search" || Number(decision.confidence || 0) < SKILL_CONFIDENCE) { onProgress?.("web_search_decision", "completed"); return null; }
    onProgress?.("web_search_decision", "completed");
    onProgress?.("web_search", "active");
    const execute = await fetch(`${baseUrl}/v1/skills/execute`, { method: "POST", headers, body: JSON.stringify({ skill_id: decision.skill_id, query: message, locale }), cache: "no-store", signal: controller.signal });
    if (!execute.ok) { onProgress?.("web_search", "warning"); return null; }
    const run = await execute.json() as ExecuteResponse;
    const result = run.result;
    if (run.status !== "completed" || !result?.message || !Array.isArray(result.sources)) { onProgress?.("web_search", "warning"); return null; }
    onProgress?.("web_search", "completed", { sourceName: result.provider || "search" });
    onProgress?.("source_validation", "active");
    onProgress?.("source_validation", "completed", { sourceName: result.provider || "search" });
    return { message: result.message, skillId: decision.skill_id, provider: result.provider || "searxng", cached: Boolean(result.cached), sources: result.sources.slice(0, 5) };
  } catch {
    onProgress?.("web_search", "warning");
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
