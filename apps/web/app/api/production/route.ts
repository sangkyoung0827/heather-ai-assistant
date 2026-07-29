import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 32_000;

export async function GET(request: Request) {
  return forward(request, "GET");
}

export async function POST(request: Request) {
  return forward(request, "POST");
}

async function forward(request: Request, method: "GET" | "POST") {
  const runtimeUrl = process.env.AGENT_RUNTIME_URL?.replace(/\/$/, "");
  const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!runtimeUrl) return NextResponse.json({ error: "Production simulation service is not configured." }, { status: 503 });
  if (!accessToken) return NextResponse.json({ error: "Sign in is required for production simulations." }, { status: 401 });

  const target = new URL(request.url);
  const path = target.searchParams.get("path") || "experiments";
  if (!/^(parse|experiments(?:\/[A-Za-z0-9-]+(?:\/(?:run|literature))?)?|compare)$/.test(path)) {
    return NextResponse.json({ error: "Unsupported production request." }, { status: 400 });
  }
  const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
  if (process.env.AGENT_RUNTIME_INTERNAL_TOKEN) headers["X-Agent-Runtime-Token"] = process.env.AGENT_RUNTIME_INTERNAL_TOKEN;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const body = method === "POST" ? await request.text() : undefined;
    if (body && body.length > MAX_BODY_BYTES) return NextResponse.json({ error: "Production request is too large." }, { status: 413 });
    const response = await fetch(`${runtimeUrl}/v1/production/${path}`, { method, headers, body, cache: "no-store", signal: controller.signal });
    const payload = await response.json().catch(() => ({ error: "Production service returned an invalid response." }));
    return NextResponse.json(payload, { status: response.status });
  } catch {
    return NextResponse.json({ error: "Production simulation service is temporarily unavailable." }, { status: 503 });
  } finally {
    clearTimeout(timeout);
  }
}
