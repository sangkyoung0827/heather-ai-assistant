from __future__ import annotations

import argparse
import base64
import hashlib
import zipfile
from pathlib import Path

EXPECTED_SHA256 = "ad0dab495fb757199d0c5d699ab30e4de906c098e0e118718d5f1752bbde3ddf"


def safe_extract(archive: zipfile.ZipFile, target: Path) -> None:
    target = target.resolve()
    for member in archive.infolist():
        destination = (target / member.filename).resolve()
        if target not in destination.parents and destination != target:
            raise SystemExit(f"Unsafe archive path: {member.filename}")
    archive.extractall(target)


def load_package() -> bytes:
    service_dir = Path(__file__).resolve().parent
    parts = sorted(service_dir.glob("worker-package.zip.b64.part-*"))
    if parts:
        encoded = "".join(part.read_text(encoding="ascii").strip() for part in parts)
    else:
        legacy = service_dir / "worker-package.zip.b64"
        if not legacy.exists():
            raise SystemExit("Missing worker package parts.")
        encoded = legacy.read_text(encoding="ascii").strip()

    try:
        package = base64.b64decode(encoded, validate=True)
    except ValueError as error:
        raise SystemExit(f"Worker package Base64 is invalid: {error}") from error

    digest = hashlib.sha256(package).hexdigest()
    if digest != EXPECTED_SHA256:
        raise SystemExit(f"Worker package checksum mismatch: {digest}")
    return package


def main() -> None:
    parser = argparse.ArgumentParser(description="Install the isolated Heather YouTube editing worker")
    parser.add_argument("--output", type=Path, default=Path.cwd(), help="Directory that will contain the worker folder")
    parser.add_argument("--verify-only", action="store_true", help="Validate the packaged worker without extracting it")
    args = parser.parse_args()

    package = load_package()
    if args.verify_only:
        print(f"Heather YouTube worker package verified: {EXPECTED_SHA256}")
        return

    args.output.mkdir(parents=True, exist_ok=True)
    archive_path = args.output / ".heather-youtube-worker.zip"
    archive_path.write_bytes(package)
    try:
        with zipfile.ZipFile(archive_path) as archive:
            safe_extract(archive, args.output)
    finally:
        archive_path.unlink(missing_ok=True)

    installed = args.output / "heather-youtube-auto-editor"
    print(f"Installed: {installed}")
    print("Next:")
    print(f"  cd {installed}")
    print("  python3 -m venv .venv && source .venv/bin/activate")
    print("  pip install -e '.[all,dev]'")
    print("  cp config.example.yaml config.yaml && cp .env.example .env")
    print("  yt-auto-editor serve --host 127.0.0.1 --port 8787")


if __name__ == "__main__":
    main()
