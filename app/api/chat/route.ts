import { NextResponse } from "next/server";

export const runtime = "nodejs";

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "gemma4:latest";

type ChatRequest = { message?: string };
type OllamaResponse = { message?: { content?: string }; response?: string; model?: string };

export async function GET() {
  return NextResponse.json({ status: "ok", provider: "ollama", model: OLLAMA_MODEL });
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as ChatRequest;
  const message = payload.message?.trim();

  if (!message) {
    return NextResponse.json({ error: "메시지를 입력하세요." }, { status: 400 });
  }

  if (asksRuntimeStatus(message)) {
    return NextResponse.json({
      message: `현재 사용 중인 모델은 ${OLLAMA_MODEL}입니다. provider는 ollama입니다.`,
      provider: "ollama",
      model: OLLAMA_MODEL
    });
  }

  try {
    const response = await fetch(`${OLLAMA_BASE_URL.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        messages: [
          {
            role: "system",
            content: `You are Heather, a concise personal AI assistant. Current runtime: provider=ollama, model=${OLLAMA_MODEL}. Answer simple factual and status questions directly in one to three sentences.`
          },
          { role: "user", content: message }
        ],
        options: { num_predict: 1200 }
      }),
      signal: AbortSignal.timeout(30000)
    });

    if (!response.ok) throw new Error(`Ollama request failed (${response.status})`);
    const data = (await response.json()) as OllamaResponse;
    const answer = data.message?.content?.trim() || data.response?.trim();
    if (!answer) throw new Error("Ollama returned an empty response.");

    return NextResponse.json({ message: answer, provider: "ollama", model: data.model || OLLAMA_MODEL });
  } catch {
    return NextResponse.json(
      { error: "Ollama가 실행 중인지 확인하세요.", provider: "ollama", model: OLLAMA_MODEL },
      { status: 503 }
    );
  }
}

function asksRuntimeStatus(message: string): boolean {
  const value = message.toLowerCase();
  return /모델|model|provider|프로바이더|backend|백엔드|api|런타임|runtime|status|상태/.test(value)
    && /현재|지금|사용|what|which|current|check|확인|뭐/.test(value);
}
