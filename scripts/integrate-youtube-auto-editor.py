from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORKSPACE = ROOT / "apps/web/components/heather/HeatherWorkspace.tsx"


def replace_once(content: str, old: str, new: str, label: str) -> str:
    if new in content:
        return content
    if old not in content:
        raise SystemExit(f"Heather YouTube integration failed: {label} pattern not found")
    return content.replace(old, new, 1)


content = WORKSPACE.read_text(encoding="utf-8")

if "Clapperboard" not in content.split('from "lucide-react"', 1)[0]:
    content = replace_once(
        content,
        "import { Bell, ",
        "import { Bell, Clapperboard, ",
        "lucide icon import",
    )

content = replace_once(
    content,
    'import { MemoryArchivePanel } from "./panels/MemoryArchivePanel";\n',
    'import { MemoryArchivePanel } from "./panels/MemoryArchivePanel";\nimport { YouTubeAutoEditorPanel } from "./panels/YouTubeAutoEditorPanel";\n',
    "panel import",
)
content = replace_once(
    content,
    '"memoryArchive" | "projects"',
    '"memoryArchive" | "youtubeEditor" | "projects"',
    "workspace type",
)
content = replace_once(
    content,
    '  if (pathname.startsWith("/memory-archive")) return "memoryArchive";\n',
    '  if (pathname.startsWith("/memory-archive")) return "memoryArchive";\n  if (pathname.startsWith("/youtube-editor")) return "youtubeEditor";\n',
    "route resolver",
)
content = replace_once(
    content,
    '<div className="rail-actions">{NODES.map((node) => <RailButton key={node.id} icon={node.icon} label={railLabel(node.id, t)} active={active === node.id} onClick={() => onNavigate(node.path)} />)}</div>',
    '<div className="rail-actions">{NODES.map((node) => <RailButton key={node.id} icon={node.icon} label={railLabel(node.id, t)} active={active === node.id} onClick={() => onNavigate(node.path)} />)}<RailButton icon={Clapperboard} label={settings.defaultLanguage === "ko" ? "YouTube 자동 편집" : "YouTube Auto Editor"} active={active === "youtubeEditor"} onClick={() => onNavigate("/youtube-editor")} /></div>',
    "left rail button",
)
content = replace_once(
    content,
    'memoryArchive: ["추억 저장소", "사진과 일기로 나의 역사를 기록하는 공간입니다."], projects:',
    'memoryArchive: ["추억 저장소", "사진과 일기로 나의 역사를 기록하는 공간입니다."], youtubeEditor: ["YouTube 자동 편집", "영상 분석, 자동 컷, Whisper 캡션, 썸네일과 업로드를 관리합니다."], projects:',
    "workspace metadata",
)
content = replace_once(
    content,
    '{workspace === "memoryArchive" && <MemoryArchivePanel locale={data.settings.defaultLanguage} />}{workspace === "projects"',
    '{workspace === "memoryArchive" && <MemoryArchivePanel locale={data.settings.defaultLanguage} />}{workspace === "youtubeEditor" && <YouTubeAutoEditorPanel locale={data.settings.defaultLanguage} />}{workspace === "projects"',
    "panel render",
)

WORKSPACE.write_text(content, encoding="utf-8")
print("Heather YouTube Auto Editor integrated as an isolated workspace.")
