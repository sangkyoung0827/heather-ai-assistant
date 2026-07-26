type RuntimeRoute = { skill_id?: string | null; confidence?: number };
type RuntimeSource = { title?: string; url?: string; year?: number; doi?: string; verification?: string };
type RuntimeResult = { status?: string; skill_id?: string; result?: { overview?: string; themes?: Array<{ title?: string; summary?: string }>; sources?: RuntimeSource[]; provider?: string }; error_code?: string };

const MIN_SKILL_CONFIDENCE = 0.85;

export async function runMatchedSkill(message: string, locale: "ko" | "en", accessToken: string | null, space: "personal" | "research" = "personal"): Promise<{ message: string; skillId: string } | null> {
  const baseUrl = process.env.AGENT_RUNTIME_URL?.replace(/\/$/, "");
  if (!baseUrl || !accessToken) return null;
  const headers: Record<string, string> = { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` };
  if (process.env.AGENT_RUNTIME_INTERNAL_TOKEN) headers["X-Agent-Runtime-Token"] = process.env.AGENT_RUNTIME_INTERNAL_TOKEN;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 35000);
  try {
    const routed = await fetch(`${baseUrl}/v1/skills/route`, { method: "POST", headers, body: JSON.stringify({ message, locale, space }), cache: "no-store", signal: controller.signal });
    if (!routed.ok) return null;
    const decision = await routed.json() as RuntimeRoute;
    const allowed = space === "research"
      ? ["research_academic_discovery", "research_web_discovery"]
      : ["personal_memory_summary", "general_web_search"];
    if (!decision.skill_id || !allowed.includes(decision.skill_id) || Number(decision.confidence || 0) < MIN_SKILL_CONFIDENCE) return null;
    const executed = await fetch(`${baseUrl}/v1/skills/execute`, { method: "POST", headers, body: JSON.stringify({ skill_id: decision.skill_id, locale, query: message }), cache: "no-store", signal: controller.signal });
    if (!executed.ok) return null;
    const result = await executed.json() as RuntimeResult;
    if (result.status !== "completed" || !result.result) return null;
    if (result.result.sources) {
      const sources = result.result.sources.map((source, index) => `${index + 1}. ${source.title || "Untitled"}${source.year ? ` (${source.year})` : ""}${source.url ? `\n${source.url}` : ""}`).join("\n\n");
      if (!sources) return null;
      return { skillId: decision.skill_id, message: `${locale === "ko" ? "검색 결과" : "Search results"}\n\n${sources}` };
    }
    if (!result.result.overview) return null;
    const themes = (result.result.themes || []).map((theme) => `- ${theme.title}: ${theme.summary}`).join("\n");
    return { skillId: decision.skill_id, message: [result.result.overview, themes].filter(Boolean).join("\n\n") };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
