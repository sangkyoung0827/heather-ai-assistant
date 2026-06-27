import { cp, copyFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webDir = path.join(rootDir, "apps", "web");
const nextDir = path.join(webDir, ".next");
const outDir = path.join(webDir, "out-tauri");

async function copyIfExists(from, to) {
  if (!existsSync(from)) return;
  await mkdir(path.dirname(to), { recursive: true });
  await copyFile(from, to);
}

async function copyDirectoryIfExists(from, to) {
  if (!existsSync(from)) return;
  await cp(from, to, { recursive: true });
}

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

await copyDirectoryIfExists(path.join(webDir, "public"), outDir);
await copyDirectoryIfExists(path.join(nextDir, "static"), path.join(outDir, "_next", "static"));

await copyIfExists(path.join(nextDir, "server", "app", "index.html"), path.join(outDir, "index.html"));
await copyIfExists(
  path.join(nextDir, "server", "app", "floating.html"),
  path.join(outDir, "floating", "index.html")
);
await copyIfExists(path.join(nextDir, "server", "app", "floating.html"), path.join(outDir, "floating.html"));
await copyIfExists(path.join(nextDir, "server", "app", "_not-found.html"), path.join(outDir, "404.html"));
await copyIfExists(
  path.join(nextDir, "server", "app", "manifest.webmanifest.body"),
  path.join(outDir, "manifest.webmanifest")
);

if (!existsSync(path.join(outDir, "index.html"))) {
  throw new Error("Tauri web export failed: missing index.html from Next build output.");
}

console.log(`Prepared Tauri web assets at ${path.relative(rootDir, outDir)}`);
