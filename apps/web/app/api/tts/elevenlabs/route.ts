import { NextResponse } from "next/server";

export const runtime = "nodejs";

interface ElevenLabsTtsPayload {
  text?: string;
  voiceId?: string;
  modelId?: string;
}

export async function POST(request: Request) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ELEVENLABS_API_KEY is not configured." },
      { status: 503 }
    );
  }

  const payload = (await request.json()) as ElevenLabsTtsPayload;
  const text = payload.text?.trim();
  const voiceId = payload.voiceId?.trim() || "JBFqnCBsd6RMkjVDRZzb";
  const modelId = payload.modelId?.trim() || "eleven_v3";

  if (!text) {
    return NextResponse.json({ error: "Text is required." }, { status: 400 });
  }

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
      "xi-api-key": apiKey
    },
    body: JSON.stringify({
      text: text.slice(0, 2400),
      model_id: modelId
    })
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: "ElevenLabs text-to-speech request failed." },
      { status: response.status }
    );
  }

  return new Response(await response.arrayBuffer(), {
    headers: {
      "Content-Type": response.headers.get("Content-Type") || "audio/mpeg",
      "Cache-Control": "no-store"
    }
  });
}
