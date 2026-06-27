import { NextResponse } from "next/server";
import { createOllamaProvider } from "@heather/ai";

export const runtime = "nodejs";

interface OllamaStatusRequest {
  baseUrl?: string;
  model?: string;
}

const DEFAULT_OLLAMA_MODEL = "llama3.2:latest";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as OllamaStatusRequest;
  const baseUrl =
    process.env.HEATHER_OLLAMA_BASE_URL ||
    process.env.OLLAMA_BASE_URL ||
    payload.baseUrl ||
    "http://localhost:11434";
  const model =
    process.env.HEATHER_OLLAMA_MODEL ||
    process.env.OLLAMA_MODEL ||
    payload.model ||
    DEFAULT_OLLAMA_MODEL;
  const provider = createOllamaProvider({ baseUrl, model });
  let models: string[] = [];
  let available = false;
  let message = "Ollama가 실행 중인지 확인하세요. 터미널에서 `ollama serve`를 실행한 뒤 다시 시도하세요.";

  try {
    models = await provider.listModels?.() || [];
    available = models.length > 0;
    if (available) {
      const selectedModel = selectModel(model, models);
      message =
        selectedModel === model
          ? "Ollama 연결 가능"
          : `Ollama 연결 가능: 설정 모델 대신 설치된 ${selectedModel} 모델을 사용합니다.`;
    } else {
      message = `Ollama에 설치된 모델이 없습니다. 먼저 \`ollama pull ${DEFAULT_OLLAMA_MODEL.replace(":latest", "")}\` 실행 후 다시 시도하세요.`;
    }
  } catch (error) {
    available = false;
    message =
      error instanceof Error
        ? error.message
        : "Ollama가 실행 중인지 확인하세요. 터미널에서 `ollama serve`를 실행한 뒤 다시 시도하세요.";
  }

  return NextResponse.json({
    available,
    baseUrl,
    configuredModel: model,
    model: available ? selectModel(model, models) : model,
    models,
    message
  });
}

function selectModel(requestedModel: string, models: string[]): string {
  return (
    models.find((model) => model === requestedModel) ||
    models.find((model) => model.replace(/:latest$/, "") === requestedModel.replace(/:latest$/, "")) ||
    models[0] ||
    requestedModel
  );
}
