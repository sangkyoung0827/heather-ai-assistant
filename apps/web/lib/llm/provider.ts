import { getLlmConfig, resolveModelProfile } from "./config";
import { LlmProviderError } from "./errors";
import { NvidiaLlmProvider } from "./providers/nvidia";
import type { HeatherModelRole, LlmProvider } from "./types";

export function createConfiguredLlmProvider(role: HeatherModelRole): LlmProvider {
  const config = getLlmConfig();
  if (config.provider === "nvidia") return new NvidiaLlmProvider(config, resolveModelProfile(role, config));
  throw new LlmProviderError("configuration", false);
}
