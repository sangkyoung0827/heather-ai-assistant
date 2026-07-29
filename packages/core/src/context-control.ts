export type ContextMemoryKind = "identity" | "preference" | "project" | "operational" | "sensitive";
export type ContextSensitivity = "normal" | "sensitive";
export type TemporalStability = "stable" | "review_periodically" | "volatile";
export type ControlProjectStatus = "idea" | "planning" | "active" | "paused" | "blocked" | "completed" | "archived";
export type ControlProjectPriority = "highest" | "high" | "medium" | "low";
export type PermissionLevel = "observe" | "propose" | "approval_execute" | "strong_approval";
export type ConnectorStatus = "not_connected" | "connected" | "expired" | "revoked" | "error" | "disabled";
export type ResourceHealthStatus = "healthy" | "degraded" | "unreachable" | "authentication_required" | "unknown";

export type ContextSeedItem = {
  memory_type: ContextMemoryKind;
  title: string;
  content: string;
  structured_content?: Record<string, unknown>;
  sensitivity: ContextSensitivity;
  confidence: number;
  temporal_stability: TemporalStability;
  source: string;
  last_reviewed_at: string;
  valid_until?: string | null;
  recommended_action?: "import" | "review" | "exclude";
};

export type ProjectAliasCandidate = { projectId: string; score: number };

export function normalizeProjectAlias(value: string) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9가-힣]+/gi, "").trim();
}

export function identifyProjectByAlias(message: string, projects: Array<{ id: string; name: string; aliases?: string[] }>): ProjectAliasCandidate | null {
  const source = normalizeProjectAlias(message);
  const ranked = projects.map((project) => {
    const aliases = [project.name, ...(project.aliases || [])].map(normalizeProjectAlias).filter(Boolean);
    const match = aliases.reduce((score, alias) => Math.max(score, source.includes(alias) ? alias.length : 0), 0);
    return { projectId: project.id, score: match ? Math.min(.99, .6 + match / Math.max(source.length, 1)) : 0 };
  }).filter((candidate) => candidate.score > 0).sort((left, right) => right.score - left.score);
  return ranked[0] || null;
}

export const DEFAULT_PERMISSION_LEVELS: Record<string, PermissionLevel> = {
  "github.repository.read": "observe",
  "github.issue.create": "approval_execute",
  "github.code.push": "strong_approval",
  "vercel.deployment.read": "observe",
  "vercel.deployment.trigger": "approval_execute",
  "youtube.analytics.read": "observe",
  "youtube.video.metadata.update": "approval_execute",
  "youtube.video.publish": "strong_approval",
  "gmail.draft.create": "propose",
  "gmail.send": "strong_approval"
};
