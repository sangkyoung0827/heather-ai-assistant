from __future__ import annotations

import argparse
import base64
import zipfile
from pathlib import Path


def safe_extract(archive: zipfile.ZipFile, target: Path) -> None:
    target = target.resolve()
    for member in archive.infolist():
        destination = (target / member.filename).resolve()
        if target not in destination.parents and destination != target:
            raise SystemExit(f"Unsafe archive path: {member.filename}")
    archive.extractall(target)


def main() -> None:
    parser = argparse.ArgumentParser(description="Install the isolated Heather YouTube editing worker")
    parser.add_argument("--output", type=Path, default=Path.cwd(), help="Directory that will contain the worker folder")
    args = parser.parse_args()
    source = Path(__file__).with_name("worker-package.zip.b64")
    if not source.exists():
        raise SystemExit(f"Missing package: {source}")
    args.output.mkdir(parents=True, exist_ok=True)
    archive_path = args.output / ".heather-youtube-worker.zip"
    archive_path.write_bytes(base64.b64decode(source.read_text(encoding="ascii")))
    with zipfile.ZipFile(archive_path) as archive:
        safe_extract(archive, args.output)
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
