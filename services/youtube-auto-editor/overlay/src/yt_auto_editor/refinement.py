from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .config import AppConfig
from .media import burn_subtitles, media_duration, render_edl
from .models import EditDecisionList, TimeRange
from .pipeline import _global_client
from .providers import NvidiaNimError
from .transcript import remap_srt_to_edl, transcript_text_for_range
from .utils import write_json


@dataclass(slots=True)
class RefinementArtifacts:
    edl_json: Path
    edited_video: Path
    edited_srt: Path | None
    subtitled_video: Path | None
    notes: list[str]


def _load_ranges(path: Path) -> list[TimeRange]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    return [
        TimeRange(float(item["start"]), float(item["end"]))
        for item in payload.get("keep_ranges", [])
    ]


def _normalize_ranges(items: Any, duration: float) -> list[TimeRange]:
    ranges: list[TimeRange] = []
    if not isinstance(items, list):
        return ranges
    for item in items:
        if not isinstance(item, dict):
            continue
        try:
            start = max(0.0, min(duration, float(item.get("start", 0.0))))
            end = max(0.0, min(duration, float(item.get("end", 0.0))))
        except (TypeError, ValueError):
            continue
        if end - start >= 0.15:
            ranges.append(TimeRange(round(start, 3), round(end, 3)))
    ranges.sort(key=lambda value: (value.start, value.end))
    merged: list[TimeRange] = []
    for item in ranges:
        if not merged or item.start - merged[-1].end > 0.08:
            merged.append(TimeRange(item.start, item.end))
        else:
            merged[-1].end = max(merged[-1].end, item.end)
    return merged


def _parse_clock(value: str) -> float:
    parts = [float(piece) for piece in value.split(":")]
    if len(parts) == 3:
        return parts[0] * 3600 + parts[1] * 60 + parts[2]
    if len(parts) == 2:
        return parts[0] * 60 + parts[1]
    return parts[0]


def _fallback_refinement(
    instruction: str,
    current: list[TimeRange],
    duration: float,
) -> dict[str, Any]:
    """Conservative fallback for explicit timestamp instructions.

    The AI path is preferred. This fallback only handles clear commands such as
    "12초부터 18초까지 삭제" and leaves ambiguous instructions unchanged.
    """
    lowered = instruction.lower()
    remove_pattern = re.compile(
        r"(?P<start>\d+(?::\d+){0,2}(?:\.\d+)?)\s*(?:초|s|sec)?\s*(?:부터|~|에서|-)\s*"
        r"(?P<end>\d+(?::\d+){0,2}(?:\.\d+)?)\s*(?:초|s|sec)?\s*(?:까지)?\s*"
        r"(?:삭제|제거|잘라|cut|remove)",
        re.IGNORECASE,
    )
    match = remove_pattern.search(lowered)
    if not match:
        return {"keep_ranges": [{"start": item.start, "end": item.end} for item in current], "notes": ["명시적인 시간 범위를 찾지 못해 기존 편집을 유지했습니다."]}

    cut_start = max(0.0, min(duration, _parse_clock(match.group("start"))))
    cut_end = max(cut_start, min(duration, _parse_clock(match.group("end"))))
    revised: list[TimeRange] = []
    for keep in current:
        if cut_end <= keep.start or cut_start >= keep.end:
            revised.append(keep)
            continue
        if keep.start < cut_start:
            revised.append(TimeRange(keep.start, cut_start))
        if cut_end < keep.end:
            revised.append(TimeRange(cut_end, keep.end))
    return {
        "keep_ranges": [{"start": item.start, "end": item.end} for item in revised],
        "notes": [f"{cut_start:.1f}초부터 {cut_end:.1f}초까지 제거했습니다."],
    }


def plan_refinement(
    *,
    instruction: str,
    source: Path,
    edl_json: Path,
    transcript_json: Path | None,
    config: AppConfig,
) -> dict[str, Any]:
    duration = media_duration(source)
    current_ranges = _load_ranges(edl_json)
    transcript = ""
    if transcript_json and transcript_json.exists():
        transcript = transcript_text_for_range(
            transcript_json,
            0.0,
            duration,
            max_chars=120_000,
            include_timestamps=True,
        )

    client = _global_client(config)
    if config.project.mock_ai or not client.available:
        return _fallback_refinement(instruction, current_ranges, duration)

    compact_ranges = [{"start": item.start, "end": item.end} for item in current_ranges]
    prompt = f"""
You are MiniMax-M3 revising an existing YouTube edit decision list.
The user wants a small, conservative adjustment. Do not redesign the entire video.
Preserve chronology, never create overlapping ranges, and never reference time outside
0 to {duration:.3f} seconds. Prefer the existing keep ranges unless the instruction clearly
requires a change. The timestamps below refer to the ORIGINAL source video.

User instruction:
{instruction[:2000]}

Current keep ranges:
{compact_ranges}

Whisper transcript with original timestamps:
{transcript}

Return ONLY JSON with this schema:
{{
  "keep_ranges": [{{"start": 0.0, "end": 10.0}}],
  "subtitle": {{"burn_in": true, "font_size": {config.subtitles.font_size}, "margin_v": {config.subtitles.margin_v}}},
  "notes": ["brief Korean explanation"]
}}
""".strip()
    try:
        result = client.text_json(prompt, max_tokens=min(client.max_tokens, 4096))
    except (NvidiaNimError, ValueError, TypeError):
        return _fallback_refinement(instruction, current_ranges, duration)

    normalized = _normalize_ranges(result.get("keep_ranges"), duration)
    if not normalized:
        normalized = current_ranges
    subtitle = result.get("subtitle") if isinstance(result.get("subtitle"), dict) else {}
    return {
        "keep_ranges": [{"start": item.start, "end": item.end} for item in normalized],
        "subtitle": {
            "burn_in": bool(subtitle.get("burn_in", config.subtitles.burn_in)),
            "font_size": max(10, min(48, int(subtitle.get("font_size", config.subtitles.font_size)))),
            "margin_v": max(0, min(180, int(subtitle.get("margin_v", config.subtitles.margin_v)))),
        },
        "notes": [str(item) for item in result.get("notes", [])][:8],
    }


def apply_refinement(
    *,
    instruction: str,
    source: Path,
    workspace: Path,
    edl_json: Path,
    transcript_srt: Path | None,
    transcript_json: Path | None,
    config: AppConfig,
    revision: int,
) -> RefinementArtifacts:
    plan = plan_refinement(
        instruction=instruction,
        source=source,
        edl_json=edl_json,
        transcript_json=transcript_json,
        config=config,
    )
    duration = media_duration(source)
    ranges = _normalize_ranges(plan.get("keep_ranges"), duration)
    if not ranges:
        raise ValueError("Natural-language refinement produced no usable video ranges")

    revision_dir = workspace / "refinements" / f"revision-{revision:02d}"
    revision_dir.mkdir(parents=True, exist_ok=True)
    refined_edl = EditDecisionList(source=str(source), keep_ranges=ranges)
    refined_edl_json = write_json(
        revision_dir / "edl.json",
        {
            **refined_edl.to_dict(),
            "instruction": instruction,
            "notes": plan.get("notes", []),
        },
    )
    edited_video = render_edl(source, ranges, revision_dir / "edited.mp4")

    edited_srt: Path | None = None
    subtitled_video: Path | None = None
    if transcript_srt and transcript_srt.exists():
        edited_srt = remap_srt_to_edl(
            transcript_srt,
            ranges,
            revision_dir / "edited.srt",
        )
        subtitle = plan.get("subtitle") if isinstance(plan.get("subtitle"), dict) else {}
        if bool(subtitle.get("burn_in", config.subtitles.burn_in)):
            subtitled_video = burn_subtitles(
                edited_video,
                edited_srt,
                revision_dir / "edited-subtitled.mp4",
                font_name=config.subtitles.font_name,
                font_size=int(subtitle.get("font_size", config.subtitles.font_size)),
                margin_v=int(subtitle.get("margin_v", config.subtitles.margin_v)),
            )

    return RefinementArtifacts(
        edl_json=refined_edl_json,
        edited_video=edited_video,
        edited_srt=edited_srt,
        subtitled_video=subtitled_video,
        notes=[str(item) for item in plan.get("notes", [])],
    )
