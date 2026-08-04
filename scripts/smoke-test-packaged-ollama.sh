#!/usr/bin/env bash
set -Eeuo pipefail

RUNTIME_PATH="${1:?Usage: smoke-test-packaged-ollama.sh /path/to/embedded-ollama/ollama}"
RUNTIME_PATH="$(cd "$(dirname "$RUNTIME_PATH")" && pwd)/$(basename "$RUNTIME_PATH")"
RUNTIME_DIR="$(dirname "$RUNTIME_PATH")"
TEST_ROOT="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/heather-embedded-smoke"
LOG_PATH="$TEST_ROOT/runtime.log"
PULL_PATH="$TEST_ROOT/pull.json"
CHAT_PATH="$TEST_ROOT/chat.json"
TAGS_PATH="$TEST_ROOT/tags.json"
MODEL="${HEATHER_SMOKE_MODEL:-smollm:135m}"
PORT="${HEATHER_SMOKE_PORT:-11577}"

export OLLAMA_HOST="127.0.0.1:${PORT}"
export OLLAMA_MODELS="$TEST_ROOT/models"
export OLLAMA_RUNNERS_DIR="$RUNTIME_DIR"
export OLLAMA_NOHISTORY="1"
export OLLAMA_KEEP_ALIVE="1m"
export OLLAMA_DEBUG="1"
export DYLD_LIBRARY_PATH="$RUNTIME_DIR${DYLD_LIBRARY_PATH:+:$DYLD_LIBRARY_PATH}"
export PATH="$RUNTIME_DIR:$PATH"

rm -rf "$TEST_ROOT"
mkdir -p "$OLLAMA_MODELS"

RUNTIME_PID=""
print_diagnostics() {
  local status=$?
  set +e
  echo "::group::Heather embedded Ollama diagnostics"
  echo "exit_status=$status"
  echo "runtime=$RUNTIME_PATH"
  echo "runtime_dir=$RUNTIME_DIR"
  echo "models=$OLLAMA_MODELS"
  echo "runners=$OLLAMA_RUNNERS_DIR"
  echo "host=$OLLAMA_HOST"
  echo "runtime directory contents:"
  find "$RUNTIME_DIR" -maxdepth 3 -type f -print | sort | head -200
  echo "runtime file metadata:"
  file "$RUNTIME_PATH"
  codesign -dv --verbose=4 "$RUNTIME_PATH" 2>&1 || true
  otool -L "$RUNTIME_PATH" 2>&1 || true
  for file_path in "$RUNTIME_DIR/llama-server" "$RUNTIME_DIR/ollama_llama_server"; do
    if [[ -e "$file_path" ]]; then
      echo "runner metadata: $file_path"
      file "$file_path"
      codesign -dv --verbose=4 "$file_path" 2>&1 || true
      otool -L "$file_path" 2>&1 || true
    fi
  done
  echo "runtime log:"
  cat "$LOG_PATH" 2>/dev/null || true
  echo "tags response:"
  cat "$TAGS_PATH" 2>/dev/null || true
  echo "pull response:"
  cat "$PULL_PATH" 2>/dev/null || true
  echo "chat response:"
  cat "$CHAT_PATH" 2>/dev/null || true
  echo "::endgroup::"
  if [[ -n "$RUNTIME_PID" ]]; then
    kill "$RUNTIME_PID" >/dev/null 2>&1 || true
    wait "$RUNTIME_PID" >/dev/null 2>&1 || true
  fi
  exit "$status"
}
trap print_diagnostics ERR
trap 'if [[ -n "$RUNTIME_PID" ]]; then kill "$RUNTIME_PID" >/dev/null 2>&1 || true; wait "$RUNTIME_PID" >/dev/null 2>&1 || true; fi' EXIT

cd "$RUNTIME_DIR"
"$RUNTIME_PATH" serve >"$LOG_PATH" 2>&1 &
RUNTIME_PID=$!

for _ in $(seq 1 120); do
  if curl --fail --silent "http://${OLLAMA_HOST}/api/tags" >"$TAGS_PATH"; then
    break
  fi
  if ! kill -0 "$RUNTIME_PID" >/dev/null 2>&1; then
    echo "Embedded Ollama process exited before becoming ready." >&2
    false
  fi
  sleep 0.25
done
curl --fail-with-body --silent --show-error "http://${OLLAMA_HOST}/api/tags" >"$TAGS_PATH"
curl --fail-with-body --silent --show-error "http://${OLLAMA_HOST}/api/version" | tee "$TEST_ROOT/version.json"

curl --fail-with-body --silent --show-error "http://${OLLAMA_HOST}/api/pull" \
  -H 'Content-Type: application/json' \
  -d "{\"model\":\"${MODEL}\",\"stream\":false}" \
  >"$PULL_PATH"
cat "$PULL_PATH"

curl --fail-with-body --silent --show-error "http://${OLLAMA_HOST}/api/chat" \
  -H 'Content-Type: application/json' \
  -d "{\"model\":\"${MODEL}\",\"stream\":false,\"messages\":[{\"role\":\"system\",\"content\":\"Return a short confirmation that local generation works.\"},{\"role\":\"user\",\"content\":\"Confirm Heather local inference.\"}],\"options\":{\"num_predict\":32,\"temperature\":0}}" \
  >"$CHAT_PATH"
cat "$CHAT_PATH"

python3 - "$CHAT_PATH" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
payload = json.loads(path.read_text(encoding="utf-8"))
content = str(payload.get("message", {}).get("content", "")).strip()
if not content:
    raise SystemExit(f"Packaged embedded runtime returned no content: {payload}")
print(f"Packaged embedded runtime generated: {content}")
PY

# The model directory is deliberately independent from ~/.ollama. Its manifest
# and blob files prove that the packaged runtime can own models by itself.
test -d "$OLLAMA_MODELS/manifests"
test -d "$OLLAMA_MODELS/blobs"
echo "Heather embedded Ollama package smoke test passed."
