"use client";

import { prebuiltAppConfig } from "@mlc-ai/web-llm";

export const HEATHER_STANDARD_MODEL_ID = "Heather-Qwen2.5-3B-Instruct-q4f16_1-v1.0.0";
export const UPSTREAM_STANDARD_MODEL_ID = "Qwen2.5-3B-Instruct-q4f16_1-MLC";
export const LOW_MEMORY_MODEL_ID = "Qwen2.5-1.5B-Instruct-q4f16_1-MLC";

const STANDARD_MANIFEST_PATH = "manifests/heather-standard-v1.json";

type HeatherModelIntegrity = {
  config?: string;
  model_lib?: string;
  tokenizer?: Record<string, string>;
  onFailure?: "error" | "warn";
};

type HeatherModelManifest = {
  schemaVersion: 1;
  modelId: string;
  version: string;
  modelPath: string;
  modelLibPath: string;
  vramRequiredMB: number;
  contextWindowSize: number;
  lowResourceRequired: boolean;
  integrity?: HeatherModelIntegrity;
};

export function hasHeatherModelStore(): boolean {
  return Boolean(modelStoreBaseUrl());
}

export async function resolveHeatherModelAppConfig(modelId: string) {
  if (modelId !== HEATHER_STANDARD_MODEL_ID) {
    return { ...prebuiltAppConfig, cacheBackend: "indexeddb" as const };
  }

  const baseUrl = modelStoreBaseUrl();
  if (!baseUrl) {
    throw new Error("Heather 모델 저장소 주소가 설정되지 않았습니다.");
  }

  const manifestUrl = resolveAssetUrl(baseUrl, STANDARD_MANIFEST_PATH);
  const response = await fetch(manifestUrl, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`Heather 모델 매니페스트를 불러오지 못했습니다. (${response.status})`);
  }

  const manifest = await response.json() as HeatherModelManifest;
  validateManifest(manifest);

  const customRecord = {
    model: ensureTrailingSlash(resolveAssetUrl(baseUrl, manifest.modelPath)),
    model_id: manifest.modelId,
    model_lib: resolveAssetUrl(baseUrl, manifest.modelLibPath),
    vram_required_MB: manifest.vramRequiredMB,
    low_resource_required: manifest.lowResourceRequired,
    overrides: {
      context_window_size: manifest.contextWindowSize
    },
    integrity: manifest.integrity
  };

  return {
    cacheBackend: "indexeddb" as const,
    model_list: [
      customRecord,
      ...prebuiltAppConfig.model_list.filter((record) => record.model_id !== manifest.modelId)
    ]
  };
}

function modelStoreBaseUrl(): string | null {
  const configured = process.env.NEXT_PUBLIC_HEATHER_MODEL_BASE_URL?.trim();
  if (!configured) return null;
  return ensureTrailingSlash(configured);
}

function resolveAssetUrl(baseUrl: string, path: string): string {
  return new URL(path.replace(/^\/+/, ""), ensureTrailingSlash(baseUrl)).toString();
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function validateManifest(manifest: HeatherModelManifest): void {
  if (manifest.schemaVersion !== 1) {
    throw new Error("지원하지 않는 Heather 모델 매니페스트 버전입니다.");
  }
  if (manifest.modelId !== HEATHER_STANDARD_MODEL_ID) {
    throw new Error("Heather 표준 모델 ID가 매니페스트와 일치하지 않습니다.");
  }
  if (!manifest.version || !manifest.modelPath || !manifest.modelLibPath) {
    throw new Error("Heather 모델 매니페스트에 필수 경로가 없습니다.");
  }
  if (!Number.isFinite(manifest.vramRequiredMB) || manifest.vramRequiredMB <= 0) {
    throw new Error("Heather 모델의 VRAM 요구량이 올바르지 않습니다.");
  }
  if (!Number.isInteger(manifest.contextWindowSize) || manifest.contextWindowSize <= 0) {
    throw new Error("Heather 모델의 컨텍스트 길이가 올바르지 않습니다.");
  }
}
