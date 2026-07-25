import { getLlmConfig } from "./config";
import { LlmProviderError } from "./errors";
import { NvidiaLlmProvider } from "./providers/nvidia";
import type { LlmProvider } from "./types";

export function createConfiguredLlmProvider(): LlmProvider {
  const config = getLlmConfig();
  if (config.provider === "nvidia") return new NvidiaLlmProvider(config);
  throw new LlmProviderError("configuration", false);
}
