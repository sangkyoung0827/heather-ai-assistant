export const OLLAMA_NOT_RUNNING_MESSAGE =
  "Ollama가 실행 중인지 확인하세요. 터미널에서 `ollama serve`를 실행하고, `ollama pull gemma4:latest`로 모델을 설치했는지 확인하세요.";

export const QWEN_MODEL_MISSING_MESSAGE =
  "gemma4:latest 모델이 설치되어 있지 않을 수 있습니다. `ollama pull gemma4:latest`를 실행하세요.";

export function formatOllamaChatError(error: unknown, model: string): Error {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (
    lower.includes("fetch failed") ||
    lower.includes("econnrefused") ||
    lower.includes("enotfound") ||
    lower.includes("network") ||
    lower.includes("failed to fetch")
  ) {
    return new Error(OLLAMA_NOT_RUNNING_MESSAGE);
  }

  if (
    model.includes("gemma4:latest") &&
    (lower.includes("model") || lower.includes("pull")) &&
    (lower.includes("not found") ||
      lower.includes("does not exist") ||
      lower.includes("unable to find") ||
      lower.includes("404"))
  ) {
    return new Error(QWEN_MODEL_MISSING_MESSAGE);
  }

  if (lower.includes("ollama가 실행 중인지")) {
    return new Error(message);
  }

  return new Error(message || OLLAMA_NOT_RUNNING_MESSAGE);
}
