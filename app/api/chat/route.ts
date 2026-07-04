import { NextResponse } from "next/server";

export const runtime = "nodejs";

type ChatRequest = {
  message?: string;
};

function buildHeatherReply(message: string) {
  const normalized = message.toLowerCase();

  if (/project|프로젝트|build|repo|github|deploy|배포/.test(normalized)) {
    return "I will treat this as a web-first project task: define the target, list the next action, keep a visible action log, and avoid desktop-only behavior in Heather 1.0.";
  }

  if (/memory|메모리|remember|기억/.test(normalized)) {
    return "Memory is currently a placeholder in this MVP. The intended behavior is explicit-save only: Heather should store durable preferences only after approval.";
  }

  if (/setting|settings|설정|mode|모드/.test(normalized)) {
    return "Heather 1.0 is running in Web Mode. Settings are a placeholder for language, model routing, privacy, and web-safe confirmations.";
  }

  return "Heather 1.0 web MVP received your message. This clean build is focused on dashboard visibility, chat, action logging, projects, memory, settings, and deployable browser access.";
}

export async function GET() {
  return NextResponse.json({
    name: "Heather AI Assistant / 헤더",
    mode: "web-mvp",
    status: "ok"
  });
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as ChatRequest;
    const message = payload.message?.trim();

    if (!message) {
      return NextResponse.json({ error: "Message is required." }, { status: 400 });
    }

    return NextResponse.json({
      message: buildHeatherReply(message),
      mode: "web-mvp",
      receivedAt: new Date().toISOString()
    });
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
}
