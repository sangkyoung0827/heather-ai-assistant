import { NextResponse } from "next/server";

export const runtime = "nodejs";

type ChatRequest = {
  message?: string;
};

export async function GET() {
  return NextResponse.json({
    status: "ok",
    route: "api",
    provider: "mock",
    model: "mock-fallback"
  });
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as ChatRequest;
  const message = payload.message?.trim();

  if (!message) {
    return NextResponse.json({ error: "메시지를 입력하세요." }, { status: 400 });
  }

  return NextResponse.json({
    message: "등록된 직접명령이 없어 API 응답으로 처리해야 합니다.",
    route: "api",
    provider: "mock",
    model: "mock-fallback"
  });
}
