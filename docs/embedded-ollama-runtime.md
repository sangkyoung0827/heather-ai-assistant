# Heather embedded Ollama runtime

## Goal

Heather Basic must generate answers without depending on a separately installed Ollama application or a user-managed `ollama serve` process.

The desktop application therefore owns all three local-inference layers:

1. the Ollama runtime executable and runner libraries packaged inside the Heather `.app` bundle;
2. a private loopback server process started and stopped by Heather;
3. a Heather-owned model directory inside the application data directory.

The Vercel web application does not contain this runtime. On the web, selecting Heather Basic fails closed and explains that the desktop application is required. It never silently sends a Basic request to NVIDIA, OpenAI, or another external model.

## Runtime packaging

Run:

```bash
npm run prepare:embedded-ollama
```

The preparation script downloads the pinned official macOS Ollama release, verifies its SHA-256 digest, and extracts only:

- the `ollama` CLI runtime;
- the sibling `lib/` runner directory required for inference;
- the Ollama MIT license;
- a small runtime manifest recording the pinned version and checksum.

Generated binaries are intentionally excluded from Git. Tauri copies `src-tauri/resources/embedded-ollama` into the built application resources.

## Model ownership and migration

Heather uses an application-owned model directory under its local application-data directory:

```text
<Heather app local data>/embedded-ollama/models
```

On first launch, Heather checks `~/.ollama/models`. When legacy model files exist, Heather creates hard links into its own model directory where the filesystem allows it, and copies files otherwise. Ollama manifests reference content-addressed blobs, so the Heather copy remains usable after the legacy directory is removed.

If the configured model is not already present, Heather's embedded runtime downloads it directly into the Heather-owned directory. The separately installed Ollama application is not required for that download.

## Process isolation

Heather allocates an unused loopback port and starts its bundled runtime with:

```text
OLLAMA_HOST=127.0.0.1:<private port>
OLLAMA_MODELS=<Heather-owned model directory>
OLLAMA_KEEP_ALIVE=10m
OLLAMA_NOHISTORY=1
OLLAMA_FLASH_ATTENTION=1
```

The process is not exposed on the default global Ollama port. Heather tracks the child process, restarts it if it dies, writes logs to `embedded-ollama.log`, and terminates it when the application exits.

## Chat routing

For `HEATHER_BASIC` in the Tauri desktop app:

```text
Chat UI
  -> Tauri ollama_chat command
  -> Heather-owned embedded Ollama process
  -> Heather-owned model store
  -> local answer
```

The resulting message metadata must contain:

```text
provider = embedded-ollama
actualExecutionMode = HEATHER_BASIC
localEngineUsed = true
externalLlmUsed = false
```

Personal chat continues using its existing account conversation persistence. Research chat sends the completed local answer to a server endpoint that verifies the local-execution metadata before saving it.

## Build

```bash
npm install
npm run desktop:build
```

The Tauri build command prepares the runtime, applies the deterministic source integration patches, exports the web frontend, compiles the Rust bridge, and bundles the runtime resources into Heather.

## Independence verification on the target Mac

Do not remove the existing Ollama installation until this sequence succeeds:

1. Build and install the new Heather desktop application.
2. Launch Heather and open Local Control.
3. Confirm the status says `embedded=true`, shows an application-resource runtime path, and shows a Heather-owned model directory.
4. Select Heather Basic and send a test question.
5. Confirm the answer badge shows `embedded-ollama`, `localEngineUsed=true`, and `externalLlmUsed=false`.
6. Quit Heather and the separately installed Ollama application.
7. Temporarily rename `/Applications/Ollama.app` and `~/.ollama` instead of deleting them immediately.
8. Relaunch Heather and send a second Heather Basic question.
9. Confirm a new answer is generated and the metadata remains fully local.
10. Only after that verification, remove the renamed legacy Ollama application and directory.

Renaming first provides a reversible test and distinguishes genuine independence from an accidentally running global process.
