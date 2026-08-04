# Heather embedded Ollama runtime

The executable and runner libraries in this directory are generated locally by:

```bash
python3 scripts/prepare-embedded-ollama.py
```

They are intentionally excluded from Git because the official macOS runtime is large. The preparation script downloads a pinned official Ollama release, verifies its SHA-256 digest, extracts only the CLI runtime and runner libraries, and writes the Ollama MIT license into the packaged resources.

During a desktop build, Tauri copies this directory into the Heather application bundle. Heather starts that bundled runtime on a private loopback port and uses an application-owned model directory. The globally installed Ollama application is not used after packaging.
