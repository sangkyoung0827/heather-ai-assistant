export type SearchSource = { title: string; url: string; snippet?: string; provider?: string; published_at?: number | null };
export type AgentSearchResult = { message: string; skillId: string; provider: string; cached: boolean; sources: SearchSource[] };

type RouteResponse = { skill_id?: string | null; confidence?: number };
type ExecuteResponse = { status?: string; skill_id?: string; result?: { message?: string; provider?: string; cached?: boolean; sources?: SearchSource[] } };

const SKILL_CONFIDENCE = 0.85;

export async function runAgentSearch(message: string, accessToken: string | null, locale: "ko" | "en" = "ko"): Promise<AgentSearchResult | null> {
  const baseUrl = process.env.AGENT_RUNTIME_URL?.replace(/\/$/, "");
  if (!baseUrl || !accessToken) return null;
  const headers: Record<string, string> = { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` };
  if (process.env.AGENT_RUNTIME_INTERNAL_TOKEN) headers["X-Agent-Runtime-Token"] = process.env.AGENT_RUNTIME_INTERNAL_TOKEN;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const route = await fetch(`${baseUrl}/v1/skills/route`, { method: "POST", headers, body: JSON.stringify({ message, locale, space: "personal" }), cache: "no-store", signal: controller.signal });
    if (!route.ok) return null;
    const decision = await route.json() as RouteResponse;
    if (decision.skill_id !== "general_web_search" || Number(decision.confidence || 0) < SKILL_CONFIDENCE) return null;
    const execute = await fetch(`${baseUrl}/v1/skills/execute`, { method: "POST", headers, body: JSON.stringify({ skill_id: decision.skill_id, query: message, locale }), cache: "no-store", signal: controller.signal });
    if (!execute.ok) return null;
    const run = await execute.json() as ExecuteResponse;
    const result = run.result;
    if (run.status !== "completed" || !result?.message || !Array.isArray(result.sources)) return null;
    return { message: result.message, skillId: decision.skill_id, provider: result.provider || "searxng", cached: Boolean(result.cached), sources: result.sources.slice(0, 5) };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
