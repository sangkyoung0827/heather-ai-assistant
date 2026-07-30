type RuntimeRoute = { skill_id?: string | null; confidence?: number };
export type RuntimeSource = { title?: string; url?: string; snippet?: string; published_at?: number | string; doi?: string; verification_level?: string };
type RuntimeProviderStatus = { provider?: string; status?: "completed" | "warning" | "failed"; candidate_count?: number };
type RuntimeResult = { status?: string; skill_id?: string; result?: { message?: string; overview?: string; themes?: Array<{ title?: string; summary?: string }>; sources?: RuntimeSource[]; provider?: string; providers?: RuntimeProviderStatus[]; cached?: boolean }; error_code?: string };
export type RuntimeSkillProgress = { phase: "provider_routing" | "cache_check" | "provider"; status: "active" | "completed" | "warning"; skillId?: string; provider?: string; cached?: boolean; candidateCount?: number };

const MIN_SKILL_CONFIDENCE = 0.85;

export async function runMatchedSkill(message: string, locale: "ko" | "en", accessToken: string | null, space: "personal" | "research" = "personal", onProgress?: (progress: RuntimeSkillProgress) => void, signal?: AbortSignal): Promise<{ message: string; skillId: string; sources?: RuntimeSource[]; cached?: boolean; provider?: string; providers?: RuntimeProviderStatus[] } | null> {
  const baseUrl = process.env.AGENT_RUNTIME_URL?.replace(/\/$/, "");
  if (!baseUrl || !accessToken) return null;
  const headers: Record<string, string> = { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` };
  if (process.env.AGENT_RUNTIME_INTERNAL_TOKEN) headers["X-Agent-Runtime-Token"] = process.env.AGENT_RUNTIME_INTERNAL_TOKEN;
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(() => controller.abort(), 35000);
  try {
    onProgress?.({ phase: "provider_routing", status: "active" });
    const routed = await fetch(`${baseUrl}/v1/skills/route`, { method: "POST", headers, body: JSON.stringify({ message, locale, space }), cache: "no-store", signal: controller.signal });
    if (!routed.ok) {
      onProgress?.({ phase: "provider_routing", status: "warning" });
      return null;
    }
    const decision = await routed.json() as RuntimeRoute;
    const allowed = space === "research"
      ? ["research_academic_discovery", "research_web_discovery"]
      : ["personal_memory_summary", "general_web_search"];
    if (!decision.skill_id || !allowed.includes(decision.skill_id) || Number(decision.confidence || 0) < MIN_SKILL_CONFIDENCE) {
      onProgress?.({ phase: "provider_routing", status: "warning" });
      return null;
    }
    const skillId = decision.skill_id;
    onProgress?.({ phase: "provider_routing", status: "completed", skillId });
    onProgress?.({ phase: "cache_check", status: "active", skillId });
    const executed = await fetch(`${baseUrl}/v1/skills/execute`, { method: "POST", headers, body: JSON.stringify({ skill_id: skillId, locale, query: message }), cache: "no-store", signal: controller.signal });
    if (!executed.ok) {
      onProgress?.({ phase: "cache_check", status: "warning", skillId });
      return null;
    }
    const result = await executed.json() as RuntimeResult;
    if (result.status !== "completed" || !result.result) {
      onProgress?.({ phase: "cache_check", status: "warning", skillId });
      return null;
    }
    onProgress?.({ phase: "cache_check", status: "completed", skillId, cached: Boolean(result.result.cached) });
    (result.result.providers || [{ provider: result.result.provider, status: "completed", candidate_count: result.result.sources?.length || 0 }]).forEach((provider) => {
      if (provider.provider) onProgress?.({ phase: "provider", status: provider.status === "failed" ? "warning" : "completed", provider: provider.provider, candidateCount: provider.candidate_count || 0, skillId });
    });
    if (result.result.sources?.length) {
      const sources = result.result.sources.slice(0, 5);
      const citations = sources.map((source, index) => `[${index + 1}] ${source.title || "Untitled"}${source.url ? `\n${source.url}` : ""}`).join("\n\n");
      const message = result.result.message?.trim() || `${locale === "ko" ? "검색 결과" : "Search results"}\n\n${citations}`;
      return { skillId, message, sources, cached: Boolean(result.result.cached), provider: result.result.provider, providers: result.result.providers };
    }
    if (!result.result.overview) return null;
    const themes = (result.result.themes || []).map((theme) => `- ${theme.title}: ${theme.summary}`).join("\n");
    return { skillId, message: [result.result.overview, themes].filter(Boolean).join("\n\n"), provider: result.result.provider, providers: result.result.providers };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}
