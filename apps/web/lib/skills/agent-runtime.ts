type RuntimeRoute = { skill_id?: string | null; confidence?: number };
type RuntimeResult = { status?: string; skill_id?: string; result?: { overview?: string; themes?: Array<{ title?: string; summary?: string }> }; error_code?: string };

const MIN_SKILL_CONFIDENCE = 0.85;

export async function runMatchedSkill(message: string, locale: "ko" | "en", accessToken: string | null): Promise<{ message: string; skillId: string } | null> {
  const baseUrl = process.env.AGENT_RUNTIME_URL?.replace(/\/$/, "");
  if (!baseUrl || !accessToken) return null;
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 35000);
  try {
    const routed = await fetch(`${baseUrl}/v1/skills/route`, { method: "POST", headers, body: JSON.stringify({ message, locale }), cache: "no-store", signal: controller.signal });
    if (!routed.ok) return null;
    const decision = await routed.json() as RuntimeRoute;
    if (decision.skill_id !== "personal_memory_summary" || Number(decision.confidence || 0) < MIN_SKILL_CONFIDENCE) return null;
    const executed = await fetch(`${baseUrl}/v1/skills/execute`, { method: "POST", headers, body: JSON.stringify({ skill_id: decision.skill_id, locale }), cache: "no-store", signal: controller.signal });
    if (!executed.ok) return null;
    const result = await executed.json() as RuntimeResult;
    if (result.status !== "completed" || !result.result?.overview) return null;
    const themes = (result.result.themes || []).map((theme) => `- ${theme.title}: ${theme.summary}`).join("\n");
    return { skillId: decision.skill_id, message: [result.result.overview, themes].filter(Boolean).join("\n\n") };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

