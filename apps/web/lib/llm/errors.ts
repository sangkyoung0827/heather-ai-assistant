export type LlmErrorCode =
  | "configuration"
  | "validation"
  | "authentication"
  | "permission"
  | "not_found"
  | "rate_limit"
  | "upstream"
  | "timeout"
  | "invalid_response";

export class LlmProviderError extends Error {
  constructor(
    public readonly code: LlmErrorCode,
    public readonly retryable: boolean,
    public readonly status?: number
  ) {
    super(code);
    this.name = "LlmProviderError";
  }
}
