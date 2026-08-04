from __future__ import annotations

import argparse
import base64
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build the versioned Heather WebLLM model manifest.")
    parser.add_argument("--model-dir", required=True, type=Path)
    parser.add_argument("--model-lib", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--model-id", required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--model-path", required=True)
    parser.add_argument("--model-lib-path", required=True)
    parser.add_argument("--source-repository", required=True)
    parser.add_argument("--source-revision", required=True)
    parser.add_argument("--license-id", required=True)
    parser.add_argument("--vram-required-mb", required=True, type=float)
    parser.add_argument("--context-window-size", required=True, type=int)
    return parser.parse_args()


def digest(path: Path) -> bytes:
    hasher = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.digest()


def sri(path: Path) -> str:
    return "sha256-" + base64.b64encode(digest(path)).decode("ascii")


def sha256_hex(path: Path) -> str:
    return digest(path).hex()


def normalized_remote_path(value: str) -> str:
    return value.strip().strip("/")


def main() -> None:
    args = parse_args()
    model_dir = args.model_dir.resolve()
    model_lib = args.model_lib.resolve()
    config_path = model_dir / "mlc-chat-config.json"

    if not model_dir.is_dir():
        raise SystemExit(f"Model directory does not exist: {model_dir}")
    if not config_path.is_file():
        raise SystemExit(f"Missing mlc-chat-config.json: {config_path}")
    if not model_lib.is_file():
        raise SystemExit(f"Missing WebGPU model library: {model_lib}")

    config = json.loads(config_path.read_text(encoding="utf-8"))
    tokenizer_files = config.get("tokenizer_files") or []
    if not isinstance(tokenizer_files, list):
        raise SystemExit("mlc-chat-config.json tokenizer_files must be a list")

    tokenizer_integrity: dict[str, str] = {}
    for relative in tokenizer_files:
        tokenizer_path = model_dir / str(relative)
        if not tokenizer_path.is_file():
            raise SystemExit(f"Missing tokenizer artifact declared by config: {relative}")
        tokenizer_integrity[str(relative)] = sri(tokenizer_path)

    files: list[dict[str, object]] = []
    for path in sorted(candidate for candidate in model_dir.rglob("*") if candidate.is_file()):
        files.append(
            {
                "path": path.relative_to(model_dir).as_posix(),
                "sizeBytes": path.stat().st_size,
                "sha256": sha256_hex(path),
            }
        )

    files.append(
        {
            "path": normalized_remote_path(args.model_lib_path),
            "sizeBytes": model_lib.stat().st_size,
            "sha256": sha256_hex(model_lib),
            "kind": "model_library",
        }
    )

    manifest = {
        "schemaVersion": 1,
        "modelId": args.model_id,
        "version": args.version,
        "modelPath": normalized_remote_path(args.model_path),
        "modelLibPath": normalized_remote_path(args.model_lib_path),
        "vramRequiredMB": args.vram_required_mb,
        "contextWindowSize": args.context_window_size,
        "lowResourceRequired": True,
        "quantization": "q4f16_1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": {
            "repository": args.source_repository,
            "revision": args.source_revision,
        },
        "license": {
            "id": args.license_id,
            "commercialUse": "Separate permission from the model licensor is required.",
            "notice": "Qwen is licensed under the Qwen RESEARCH LICENSE AGREEMENT, Copyright (c) Alibaba Cloud. All Rights Reserved.",
        },
        "integrity": {
            "config": sri(config_path),
            "model_lib": sri(model_lib),
            "tokenizer": tokenizer_integrity,
            "onFailure": "error",
        },
        "files": files,
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote Heather model manifest: {args.output}")


if __name__ == "__main__":
    main()
