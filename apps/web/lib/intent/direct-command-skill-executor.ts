import type { IntentCommand } from "./direct-command-engine";

export type DirectCommandSkillId =
  | "general_web_search"
  | "personal_memory_summary"
  | "research_web_discovery"
  | "research_academic_discovery";

export type DirectCommandChatType = "personal" | "research";
export type DirectCommandSkillDirective = {
  skillId: DirectCommandSkillId;
  parameters: Record<string, unknown>;
};

export type DirectCommandSkillSource = {
  title: string;
  url: string;
  snippet?: string;
  provider?: string;
  published_at?: number | null;
  doi?: string;
};

export type DirectCommandActionResult = {
  message: string;
  provider: "direct-command" | "agent-runtime";
  model: string;
  usedTools: string[];
  skillId?: DirectCommandSkillId;
  cached?: boolean;
  sources?: DirectCommandSkillSource[];
};

type RuntimeSourceInput = {
  title?: string;
  url?: string;
  snippet?: string;
  provider?: string;
  published_at?: number | string | null;
  doi?: string;
};

type RuntimePayload = {
  message?: string;
  overview?: string;
  themes?: Array<{ title?: string; summary?: string }>;
  sources?: RuntimeSourceInput[];
  provider?: string;
  cached?: boolean;
};

type RuntimeResult = {
  status?: string;
  skill_id?: string;
  result?: RuntimePayload;
  error_code?: string;
};

type ExecuteOptions = {
  request: Request;
  command: IntentCommand;
  message: string;
  chatType: DirectCommandChatType;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
};

const DIRECTIVE_PATTERN = /^@skill\s+([a-z0-9_.-]+)(?:\s+([\s\S]+))?$/i;
const MAX_PARAMETER_BYTES = 4096;
const ALLOWED_SKILLS: Record<DirectCommandSkillId, readonly DirectCommandChatType[]> = {
  general_web_search: ["personal"],
  personal_memory_summary: ["personal"],
  research_web_discovery: ["research"],
  research_academic_discovery: ["research"]
};

export class DirectCommandSkillError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
  }
}

export function parseDirectCommandSkillDirective(response: string): DirectCommandSkillDirective | null {
  const trimmed = response.trim();
  if (!trimmed.startsWith("@skill")) return null;
  const match = trimmed.match(DIRECTIVE_PATTERN);
  if (!match) throw new DirectCommandSkillError("직접명령 Skill 형식이 올바르지 않습니다.", "INVALID_SKILL_DIRECTIVE");

  const skillId = match[1] as DirectCommandSkillId;
  if (!(skillId in ALLOWED_SKILLS)) throw new DirectCommandSkillError("허용되지 않은 직접명령 Skill입니다.", "SKILL_NOT_ALLOWED");

  const rawParameters = match[2]?.trim();
  if (!rawParameters) return { skillId, parameters: {} };
  if (Buffer.byteLength(rawParameters, "utf8") > MAX_PARAMETER_BYTES) {
    throw new DirectCommandSkillError("직접명령 Skill 인자가 너무 깁니다.", "SKILL_PARAMETERS_TOO_LARGE");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawParameters);
  } catch {
    throw new DirectCommandSkillError("직접명령 Skill 인자는 JSON 객체여야 합니다.", "INVALID_SKILL_PARAMETERS");
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new DirectCommandSkillError("직접명령 Skill 인자는 JSON 객체여야 합니다.", "INVALID_SKILL_PARAMETERS");
  }
  return { skillId, parameters: parsed as Record<string, unknown> };
}

export async function executeDirectCommandAction(options: ExecuteOptions): Promise<DirectCommandActionResult> {
  const directive = parseDirectCommandSkillDirective(options.command.response);
  if (!directive) {
    return {
      message: options.command.response,
      provider: "direct-command",
      model: "server",
      usedTools: ["direct_command"]
    };
  }

  if (!ALLOWED_SKILLS[directive.skillId].includes(options.chatType)) {
    throw new DirectCommandSkillError("이 Skill은 현재 채팅 유형에서 실행할 수 없습니다.", "SKILL_SCOPE_MISMATCH");
  }

  const baseUrl = process.env.AGENT_RUNTIME_URL?.replace(/\/$/, "");
  const accessToken = options.request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!baseUrl) throw new DirectCommandSkillError("Agent Runtime이 설정되지 않았습니다.", "AGENT_RUNTIME_NOT_CONFIGURED");
  if (!accessToken) throw new DirectCommandSkillError("Skill 실행에는 로그인이 필요합니다.", "SKILL_AUTH_REQUIRED");

  const locale = resolveLocale(directive.parameters.locale, options.message);
  const query = resolveQuery(directive.parameters.query, options.message, options.command.canonicalTrigger);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`
  };
  if (process.env.AGENT_RUNTIME_INTERNAL_TOKEN) headers["X-Agent-Runtime-Token"] = process.env.AGENT_RUNTIME_INTERNAL_TOKEN;

  const fetchImpl = options.fetchImpl || fetch;
  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl}/v1/skills/execute`, {
      method: "POST",
      headers,
      body: JSON.stringify({ skill_id: directive.skillId, query, locale }),
      cache: "no-store",
      signal: options.signal || options.request.signal
    });
  } catch {
    throw new DirectCommandSkillError("직접명령 Skill 실행 서버에 연결하지 못했습니다.", "SKILL_EXECUTION_UNAVAILABLE");
  }

  if (!response.ok) {
    throw new DirectCommandSkillError("직접명령 Skill 실행에 실패했습니다.", "SKILL_EXECUTION_FAILED");
  }

  const payload = await response.json() as RuntimeResult;
  if (payload.status !== "completed" || !payload.result) {
    throw new DirectCommandSkillError("직접명령 Skill이 완료되지 않았습니다.", payload.error_code || "SKILL_EXECUTION_INCOMPLETE");
  }

  const sources = normalizeSources(payload.result.sources);
  const message = formatRuntimeMessage(payload.result, sources, locale);
  if (!message) throw new DirectCommandSkillError("직접명령 Skill이 응답을 반환하지 않았습니다.", "SKILL_EMPTY_RESULT");

  return {
    message,
    provider: "agent-runtime",
    model: `direct-command:${directive.skillId}`,
    usedTools: ["direct_command", directive.skillId],
    skillId: directive.skillId,
    cached: Boolean(payload.result.cached),
    sources
  };
}

function resolveLocale(value: unknown, message: string): "ko" | "en" {
  if (value === "ko" || value === "en") return value;
  return /[\u3131-\uD79D]/.test(message) ? "ko" : "en";
}

function resolveQuery(value: unknown, message: string, canonicalTrigger: string): string {
  if (typeof value !== "string" || !value.trim()) return message.trim();
  const resolved = value
    .replaceAll("$input", message.trim())
    .replaceAll("$trigger", canonicalTrigger.trim())
    .trim();
  if (!resolved) throw new DirectCommandSkillError("Skill 검색어가 비어 있습니다.", "SKILL_QUERY_EMPTY");
  return resolved.slice(0, 4000);
}

function normalizeSources(input: RuntimeSourceInput[] | undefined): DirectCommandSkillSource[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((source) => {
    const title = String(source.title || "").trim();
    const url = String(source.url || "").trim();
    if (!title || !/^https?:\/\//i.test(url)) return [];
    const rawPublishedAt = source.published_at;
    const publishedAt = typeof rawPublishedAt === "number"
      ? rawPublishedAt
      : typeof rawPublishedAt === "string" && /^\d+$/.test(rawPublishedAt)
        ? Number(rawPublishedAt)
        : null;
    return [{
      title: title.slice(0, 500),
      url: url.slice(0, 2048),
      snippet: source.snippet ? String(source.snippet).slice(0, 1200) : undefined,
      provider: source.provider ? String(source.provider).slice(0, 100) : undefined,
      published_at: Number.isFinite(publishedAt) ? publishedAt : null,
      doi: source.doi ? String(source.doi).slice(0, 300) : undefined
    }];
  }).slice(0, 5);
}

function formatRuntimeMessage(result: RuntimePayload, sources: DirectCommandSkillSource[], locale: "ko" | "en"): string {
  const main = result.message?.trim() || result.overview?.trim() || "";
  const themes = (result.themes || [])
    .flatMap((theme) => theme.title || theme.summary ? [`- ${[theme.title, theme.summary].filter(Boolean).join(": ")}`] : [])
    .join("\n");
  const citations = sources.map((source, index) => `[${index + 1}] ${source.title}\n${source.url}`).join("\n\n");
  return [main, themes, citations ? `${locale === "ko" ? "출처" : "Sources"}\n${citations}` : ""].filter(Boolean).join("\n\n");
}
