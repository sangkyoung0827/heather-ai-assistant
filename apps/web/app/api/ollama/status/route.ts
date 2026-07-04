import { NextResponse } from "next/server";

export const runtime = "nodejs";

type OllamaStatusRequest = {
  baseUrl?: string;
  model?: string;
};

const DEFAULT_OLLAMA_MODEL = "gemma4:latest";

export async function GET() {
  return NextResponse.json({
    available: false,
    mode: "web-only",
    configuredModel: DEFAULT_OLLAMA_MODEL,
    model: DEFAULT_OLLAMA_MODEL,
    models: [],
    message: "Heather 1.0 web MVP does not require Ollama. Local model status is disabled in web-only deployment."
  });
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as OllamaStatusRequest;
  const model = payload.model?.trim() || DEFAULT_OLLAMA_MODEL;

  return NextResponse.json({
    available: false,
    mode: "web-only",
    configuredModel: model,
    model,
    models: [],
    message: "Heather 1.0 web MVP is running without desktop/local Ollama integration."
  });
}
