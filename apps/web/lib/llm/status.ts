import { getLlmConfig, isModelProfileConfigured, resolveModelProfile } from "./config";
import type { HeatherModelRole } from "./types";

declare global {
  // eslint-disable-next-line no-var
  var heatherLlmLastSuccessAt: Partial<Record<HeatherModelRole, number>> | undefined;
}

export function recordLlmSuccess(role: HeatherModelRole): void {
  globalThis.heatherLlmLastSuccessAt = { ...globalThis.heatherLlmLastSuccessAt, [role]: Date.now() };
}

export function getLlmStatus() {
  const config = getLlmConfig();
  const profileStatus = (role: HeatherModelRole) => {
    const profile = resolveModelProfile(role, config);
    const lastSuccessAt = globalThis.heatherLlmLastSuccessAt?.[role];
    return {
      configured: isModelProfileConfigured(profile, config),
      verified: Boolean(lastSuccessAt),
      lastSuccessAt: lastSuccessAt ? new Date(lastSuccessAt).toISOString() : null
    };
  };

  return {
    provider: config.provider === "nvidia" ? "nvidia" : "unavailable",
    general: profileStatus("general"),
    research: profileStatus("research")
  };
}
