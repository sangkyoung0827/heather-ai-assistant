from __future__ import annotations

import hashlib
import json
import os
import platform
import shutil
import stat
import tempfile
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DESTINATION = ROOT / "src-tauri" / "resources" / "embedded-ollama"
CACHE_ROOT = Path.home() / ".cache" / "heather" / "embedded-ollama"
OLLAMA_VERSION = os.environ.get("HEATHER_EMBEDDED_OLLAMA_VERSION", "v0.30.8")
DARWIN_ARCHIVE_SHA256 = "62a68eacb27dde8d61560fd3bf4c5669c141f5482c5668ce7328420e871088e6"
DARWIN_ARCHIVE_URL = f"https://github.com/ollama/ollama/releases/download/{OLLAMA_VERSION}/Ollama-darwin.zip"
RESOURCE_PREFIX = "Ollama.app/Contents/Resources/"

OLLAMA_LICENSE = """MIT License

Copyright (c) Ollama

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the \"Software\"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
"""


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download_archive() -> Path:
    override = os.environ.get("HEATHER_EMBEDDED_OLLAMA_ARCHIVE")
    if override:
        archive = Path(override).expanduser().resolve()
        if not archive.is_file():
            raise SystemExit(f"Embedded Ollama archive does not exist: {archive}")
        return archive

    CACHE_ROOT.mkdir(parents=True, exist_ok=True)
    archive = CACHE_ROOT / f"Ollama-darwin-{OLLAMA_VERSION}.zip"
    if archive.is_file() and sha256(archive) == DARWIN_ARCHIVE_SHA256:
        return archive
    archive.unlink(missing_ok=True)
    print(f"Downloading the pinned Ollama runtime {OLLAMA_VERSION}...")
    request = urllib.request.Request(DARWIN_ARCHIVE_URL, headers={"User-Agent": "Heather-AI-Assistant"})
    with urllib.request.urlopen(request, timeout=120) as response, archive.open("wb") as output:
        shutil.copyfileobj(response, output)
    return archive


def verify_archive(archive: Path) -> None:
    actual = sha256(archive)
    expected = os.environ.get("HEATHER_EMBEDDED_OLLAMA_SHA256", DARWIN_ARCHIVE_SHA256)
    if actual != expected:
        archive.unlink(missing_ok=True)
        raise SystemExit(f"Ollama archive checksum mismatch: expected {expected}, received {actual}")


def safe_resource_path(filename: str) -> Path | None:
    if not filename.startswith(RESOURCE_PREFIX):
        return None
    relative = Path(filename.removeprefix(RESOURCE_PREFIX))
    if not relative.parts or relative.is_absolute() or ".." in relative.parts:
        return None
    return relative


def extract_runtime(archive: Path) -> None:
    archive_digest = sha256(archive)
    manifest_path = DESTINATION / "embedded-runtime.json"
    if manifest_path.is_file() and (DESTINATION / "ollama").is_file():
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            if manifest.get("version") == OLLAMA_VERSION and manifest.get("archive_sha256") == archive_digest:
                print("Heather embedded Ollama runtime is already prepared.")
                return
        except (OSError, ValueError):
            pass

    with tempfile.TemporaryDirectory(prefix="heather-ollama-") as temporary:
        staging = Path(temporary) / "embedded-ollama"
        staging.mkdir(parents=True, exist_ok=True)
        extracted_files: list[str] = []

        # Keep the complete official Resources subtree instead of assuming a
        # version-specific runner layout such as Resources/lib. Ollama release
        # packaging may move runner assets while the root CLI remains stable.
        with zipfile.ZipFile(archive) as bundle:
            for member in bundle.infolist():
                relative = safe_resource_path(member.filename)
                if relative is None:
                    continue
                target = staging / relative
                if member.is_dir():
                    target.mkdir(parents=True, exist_ok=True)
                    continue
                target.parent.mkdir(parents=True, exist_ok=True)
                with bundle.open(member) as source, target.open("wb") as output:
                    shutil.copyfileobj(source, output)
                extracted_files.append(relative.as_posix())

        executable = staging / "ollama"
        if not executable.is_file():
            preview = ", ".join(extracted_files[:40]) or "no resource files"
            raise SystemExit(
                "The Ollama archive does not contain the expected Resources/ollama runtime. "
                f"Extracted entries: {preview}"
            )
        executable.chmod(executable.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
        (staging / "THIRD_PARTY_OLLAMA_LICENSE.txt").write_text(OLLAMA_LICENSE, encoding="utf-8")
        (staging / "embedded-runtime.json").write_text(
            json.dumps(
                {
                    "runtime": "ollama",
                    "version": OLLAMA_VERSION,
                    "archive": DARWIN_ARCHIVE_URL,
                    "archive_sha256": archive_digest,
                    "resource_file_count": len(extracted_files),
                    "managed_by": "Heather AI Assistant",
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        shutil.rmtree(DESTINATION, ignore_errors=True)
        shutil.copytree(staging, DESTINATION)
        print(f"Extracted {len(extracted_files)} official Ollama resource files.")
        for item in extracted_files[:40]:
            print(f"  - {item}")


def main() -> None:
    if platform.system() != "Darwin":
        raise SystemExit("Heather's embedded Ollama packaging is currently configured for the macOS desktop build.")
    archive = download_archive()
    verify_archive(archive)
    extract_runtime(archive)
    print(f"Embedded Ollama runtime prepared at {DESTINATION}")


if __name__ == "__main__":
    main()
