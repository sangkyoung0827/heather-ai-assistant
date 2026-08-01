import { getLlmConfig, resolveModelProfile } from "./config";
import { recordLlmSuccess } from "./status";
import { NvidiaLlmProvider } from "./providers/nvidia";
import type { HeatherModelRole, LlmRequest, LlmResponse } from "./types";

export async function generateForModelRole(role: Exclude<HeatherModelRole, "fallback">, request: LlmRequest): Promise<LlmResponse> {
  const config = getLlmConfig();
  const primary = resolveModelProfile(role, config);
  const response = await new NvidiaLlmProvider(config, primary).generate(request);
  recordLlmSuccess(role);
  return response;
}
