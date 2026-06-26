import { NextResponse } from "next/server";
import { createOllamaProvider } from "@heather/ai";

export const runtime = "nodejs";

interface OllamaStatusRequest {
  baseUrl?: string;
  model?: string;
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as OllamaStatusRequest;
  const baseUrl = payload.baseUrl || process.env.OLLAMA_BASE_URL || "http://localhost:11434";
  const model = payload.model || process.env.OLLAMA_MODEL || "llama3.1";
  const provider = createOllamaProvider({ baseUrl, model });
  const available = await provider.isAvailable();

  return NextResponse.json({
    available,
    baseUrl,
    model,
    message: available ? "Ollama 연결 가능" : "Ollama가 실행 중인지 확인하세요"
  });
}
