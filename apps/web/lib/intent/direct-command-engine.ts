export type IntentMatchKind = "exact" | "normalized" | "trigger" | "similarity";

export type IntentCommand = {
  id: string;
  canonicalTrigger: string;
  triggers: string[];
  response: string;
  enabled: boolean;
};

export type IntentMatch = { command: IntentCommand; kind: IntentMatchKind };

const WAKE_WORD = /^(헤더야|헤더|heather)\s*[,，:：\-~!?.]*\s*/i;
const SAFE_PUNCTUATION = /[.,!?~·…"'“”‘’()[\]{}]/g;
const SIMILARITY_THRESHOLD = 0.94;
const MINIMUM_LENGTH = 5;

export function normalizeIntentText(input: string): string {
  return input
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase()
    .replace(WAKE_WORD, "")
    .replace(SAFE_PUNCTUATION, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function findIntentCommandMatch(message: string, commands: IntentCommand[]): IntentMatch | null {
  const raw = message.trim();
  const normalized = normalizeIntentText(raw);
  if (!normalized) return null;
  const enabled = commands.filter((command) => command.enabled);

  const exact = enabled.find((command) => command.canonicalTrigger.trim() === raw);
  if (exact) return { command: exact, kind: "exact" };

  const normalizedCanonical = enabled.find(
    (command) => normalizeIntentText(command.canonicalTrigger) === normalized
  );
  if (normalizedCanonical) return { command: normalizedCanonical, kind: "normalized" };

  const trigger = enabled.find((command) =>
    command.triggers.some((candidate) => normalizeIntentText(candidate) === normalized)
  );
  if (trigger) return { command: trigger, kind: "trigger" };

  if (normalized.length < MINIMUM_LENGTH) return null;
  const scored = enabled
    .flatMap((command) => [command.canonicalTrigger, ...command.triggers].map((triggerText) => ({
      command,
      score: similarity(normalized, normalizeIntentText(triggerText))
    })))
    .sort((left, right) => right.score - left.score);
  const best = scored[0];
  const second = scored[1];
  if (!best || best.score < SIMILARITY_THRESHOLD || (second && best.score - second.score < 0.025)) return null;
  return { command: best.command, kind: "similarity" };
}

export function isAutoPromotionEligible(message: string, response: string): boolean {
  const normalized = normalizeIntentText(message);
  if (normalized.length < MINIMUM_LENGTH || response.trim().length < 8) return false;
  const volatileOrRisky = /날짜|시간|오늘|내일|날씨|가격|뉴스|최신|실시간|일정|결제|주문|이메일|메일.*보내|삭제|캘린더.*수정|투자|주식|매수|매도|의료|법률|진단|명령.*실행|파일.*(삭제|이동|수정)/i;
  const failure = /오류|error|실패|실행할 수 없|확인하세요/i;
  return !volatileOrRisky.test(message) && !failure.test(response);
}

function similarity(left: string, right: string): number {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const distance = levenshtein(left, right);
  return 1 - distance / Math.max(left.length, right.length);
}

function levenshtein(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = new Array<number>(right.length + 1);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(current[rightIndex - 1] + 1, previous[rightIndex] + 1, previous[rightIndex - 1] + cost);
    }
    for (let index = 0; index <= right.length; index += 1) previous[index] = current[index];
  }
  return previous[right.length];
}
