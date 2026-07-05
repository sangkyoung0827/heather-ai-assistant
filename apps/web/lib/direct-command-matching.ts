export type MatchKind = "exact" | "normalized" | "similarity";

export type MatchableDirectCommand = {
  question: string;
  response: string;
  enabled: boolean;
};

export type DirectCommandMatch<TCommand extends MatchableDirectCommand> = {
  command: TCommand;
  kind: MatchKind;
  score?: number;
};

const SIMILARITY_THRESHOLD = 0.92;
const MIN_TOP_SCORE_GAP = 0.02;

const WAKE_WORD_PATTERN = /^(헤더야|헤더|heather)\s*[,，:：\-~!?.]*\s*/i;
const PUNCTUATION_PATTERN = /[.,!?~·…"'“”‘’()[\]{}]/g;
const SAFE_PARTICLE_PATTERN = /(에서|으로|을|를|은|는|이|가|로)(?=\s|$)/g;

export function normalizeDirectCommandText(input: string) {
  return input
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(WAKE_WORD_PATTERN, "")
    .replace(/youtube\s*music/g, "유튜브뮤직")
    .replace(/yt\s*music/g, "유튜브뮤직")
    .replace(/유튜브\s*뮤직/g, "유튜브뮤직")
    .replace(PUNCTUATION_PATTERN, "")
    .replace(SAFE_PARTICLE_PATTERN, "")
    .replace(/\s+/g, "");
}

export function findDirectCommandMatch<TCommand extends MatchableDirectCommand>(
  message: string,
  commands: TCommand[]
): DirectCommandMatch<TCommand> | null {
  const trimmedMessage = message.trim();
  const enabledCommands = commands.filter((command) => command.enabled);

  const exactMatch = enabledCommands.find((command) => command.question.trim() === trimmedMessage);
  if (exactMatch) return { command: exactMatch, kind: "exact" };

  const normalizedMessage = normalizeDirectCommandText(trimmedMessage);
  if (!normalizedMessage) return null;

  const normalizedMatch = enabledCommands.find(
    (command) => normalizeDirectCommandText(command.question) === normalizedMessage
  );
  if (normalizedMatch) return { command: normalizedMatch, kind: "normalized" };

  const scored = enabledCommands
    .map((command) => ({
      command,
      score: levenshteinRatio(normalizedMessage, normalizeDirectCommandText(command.question))
    }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < SIMILARITY_THRESHOLD) return null;

  const second = scored[1];
  if (second && best.score - second.score < MIN_TOP_SCORE_GAP) return null;

  return { command: best.command, kind: "similarity", score: best.score };
}

export function formatMatchMetadata(match: DirectCommandMatch<MatchableDirectCommand>) {
  if (match.kind === "similarity") {
    return `direct_command · similarity ${match.score?.toFixed(2) ?? "0.00"}`;
  }

  return `direct_command · ${match.kind}`;
}

function levenshteinRatio(left: string, right: string) {
  if (left === right) return 1;
  if (!left || !right) return 0;

  const distance = levenshteinDistance(left, right);
  const maxLength = Math.max(left.length, right.length);
  return 1 - distance / maxLength;
}

function levenshteinDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = new Array<number>(right.length + 1);

  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;

    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost
      );
    }

    for (let j = 0; j <= right.length; j += 1) {
      previous[j] = current[j];
    }
  }

  return previous[right.length];
}
