import { getLlmConfig, isNvidiaConfigured } from "./config";

declare global {
  // eslint-disable-next-line no-var
  var heatherLlmLastSuccessAt: number | undefined;
}

export function recordLlmSuccess(): void {
  globalThis.heatherLlmLastSuccessAt = Date.now();
}

export function getLlmStatus() {
  const config = getLlmConfig();
  const connected = isNvidiaConfigured(config);

  return {
    provider: connected ? "nvidia" : "unavailable",
    configured: connected,
    verified: connected && Boolean(globalThis.heatherLlmLastSuccessAt),
    available: connected,
    lastSuccessAt: globalThis.heatherLlmLastSuccessAt
      ? new Date(globalThis.heatherLlmLastSuccessAt).toISOString()
      : null
  };
}
