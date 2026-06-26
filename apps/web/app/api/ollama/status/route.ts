import { NextResponse } from "next/server";
import { createOllamaProvider } from "@heather/ai";

export const runtime = "nodejs";

interface OllamaStatusRequest {
  baseUrl?: string;
  model?: string;
}

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
    "gemma4:latest";
  const provider = createOllamaProvider({ baseUrl, model });
  const available = await provider.isAvailable();

  return NextResponse.json({
    available,
    baseUrl,
    model,
    message: available
      ? "Ollama 연결 가능"
      : "Ollama is not running. Start it with: ollama serve"
  });
}
