import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

export const runtime = "nodejs";
export const dynamic = "force-static";
export const revalidate = false;

const ARCHIVE_PARTS = [
  "archive.part1.txt",
  "archive.part2.txt",
  "archive.part3.txt",
  "archive.part4.txt",
  "archive.part5.txt",
  "archive.part6.txt"
] as const;

async function loadArchiveHtml(): Promise<string> {
  const possibleDirectories = [
    join(process.cwd(), "public", "memory-archive"),
    join(process.cwd(), "apps", "web", "public", "memory-archive")
  ];

  let lastError: unknown;
  for (const directory of possibleDirectories) {
    try {
      const encoded = (await Promise.all(
        ARCHIVE_PARTS.map((part) => readFile(join(directory, part), "utf8"))
      )).join("").replace(/\s+/g, "");
      return gunzipSync(Buffer.from(encoded, "base64")).toString("utf8");
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Memory archive bundle was not found.");
}

export async function GET() {
  try {
    const html = await loadArchiveHtml();
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=0, s-maxage=31536000, immutable",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown archive error";
    return new Response(
      `<!doctype html><html lang="ko"><meta charset="utf-8"><title>추억 저장소 오류</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#03070c;color:#dce7f4;font-family:system-ui"><main style="max-width:560px;padding:32px;text-align:center"><h1 style="font-size:20px">추억 저장소를 열지 못했습니다.</h1><p style="color:#8291a7">${escapeHtml(message)}</p></main></body></html>`,
      { status: 500, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
    );
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character] || character);
}
