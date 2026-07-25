import { getLlmConfig, resolveModelProfile } from "./config";
import { recordLlmSuccess } from "./status";
import { NvidiaLlmProvider } from "./providers/nvidia";
import type { HeatherModelRole, LlmRequest, LlmResponse } from "./types";

export async function generateForModelRole(role: Exclude<HeatherModelRole, "fallback">, request: LlmRequest): Promise<LlmResponse> {
  const config = getLlmConfig();
  const primary = resolveModelProfile(role, config);
  try {
    const response = await new NvidiaLlmProvider(config, primary).generate(request);
    recordLlmSuccess(role);
    return response;
  } catch (primaryError) {
    const fallback = resolveModelProfile("fallback", config);
    if (!fallback.modelId || fallback.modelId === primary.modelId) throw primaryError;
    const response = await new NvidiaLlmProvider(config, fallback).generate(request);
    recordLlmSuccess(role);
    return response;
  }
}
