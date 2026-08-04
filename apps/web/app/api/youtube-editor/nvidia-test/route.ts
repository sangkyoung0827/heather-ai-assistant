import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NVIDIA_ENDPOINT = "https://integrate.api.nvidia.com/v1/chat/completions";
const MODEL = "minimaxai/minimax-m3";

export async function POST(request: Request) {
  const requestKey = request.headers.get("x-nvidia-api-key")?.trim();
  const apiKey = requestKey || process.env.NVIDIA_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "NVIDIA API key is required." }, { status: 400, headers: { "cache-control": "no-store" } });
  }

  let prompt = 'Return only JSON: {"status":"ok"}';
  try {
    const body = await request.json() as { prompt?: unknown };
    if (typeof body.prompt === "string" && body.prompt.trim()) prompt = body.prompt.trim().slice(0, 800);
  } catch {
    // The default probe prompt is sufficient.
  }

  try {
    const response = await fetch(NVIDIA_ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        accept: "application/json",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
        top_p: 0.95,
        max_tokens: 128,
        stream: false
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(55_000)
    });

    const payload = await response.json().catch(() => ({})) as {
      choices?: Array<{ message?: { content?: string } }>;
      detail?: string;
      message?: string;
      error?: { message?: string };
    };
    if (!response.ok) {
      const error = payload.error?.message || payload.detail || payload.message || `NVIDIA API returned HTTP ${response.status}`;
      return NextResponse.json({ ok: false, error }, { status: response.status, headers: { "cache-control": "no-store" } });
    }

    return NextResponse.json({
      ok: true,
      model: MODEL,
      content: payload.choices?.[0]?.message?.content || ""
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "NVIDIA connection failed."
    }, { status: 502, headers: { "cache-control": "no-store" } });
  }
}
