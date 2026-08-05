from __future__ import annotations

import os
import shutil
import tempfile
from pathlib import Path

import typer
from rich.console import Console
from rich.table import Table

from .config import AppConfig, load_config
from .media import (
    extract_analysis_media,
    extract_global_analysis_video,
    media_duration,
)
from .pipeline import run_pipeline
from .providers import NvidiaNimClient, NvidiaNimError
from .uploader import youtube_channel_info

app = typer.Typer(no_args_is_help=True, help="Heather YouTube Auto Editor")
console = Console()


def _global_client(settings: AppConfig) -> NvidiaNimClient:
    return NvidiaNimClient(
        api_key=settings.nvidia_api_key,
        api_base=settings.nvidia.api_base,
        asset_api_base=settings.nvidia.asset_api_base,
        model=settings.nvidia.global_model,
        profile="minimax",
        temperature=settings.nvidia.global_temperature,
        top_p=settings.nvidia.global_top_p,
        max_tokens=settings.nvidia.global_max_tokens,
        thinking_mode=settings.nvidia.global_thinking_mode,
        media_enable_thinking=True,
        text_enable_thinking=True,
        inline_limit_bytes=settings.nvidia.inline_limit_bytes,
        cleanup_assets=settings.nvidia.cleanup_assets,
        timeout=settings.nvidia.request_timeout_sec,
        poll_interval=settings.nvidia.poll_interval_sec,
    )


def _segment_client(settings: AppConfig) -> NvidiaNimClient:
    return NvidiaNimClient(
        api_key=settings.nvidia_api_key,
        api_base=settings.nvidia.api_base,
        asset_api_base=settings.nvidia.asset_api_base,
        model=settings.nvidia.segment_model,
        profile="nemotron",
        temperature=settings.nvidia.segment_temperature,
        top_p=settings.nvidia.segment_top_p,
        reasoning_budget=settings.nvidia.segment_reasoning_budget,
        media_enable_thinking=settings.nvidia.segment_media_enable_thinking,
        text_enable_thinking=settings.nvidia.segment_text_enable_thinking,
        inline_limit_bytes=settings.nvidia.inline_limit_bytes,
        cleanup_assets=settings.nvidia.cleanup_assets,
        timeout=settings.nvidia.request_timeout_sec,
        poll_interval=settings.nvidia.poll_interval_sec,
    )


@app.command()
def doctor(config: Path = typer.Option(Path("config.yaml"), "--config", "-c")) -> None:
    """Check local runtime dependencies and secret presence without printing secrets."""
    settings = load_config(config)
    table = Table(title="Runtime check")
    table.add_column("Dependency")
    table.add_column("Status")
    for binary in ("ffmpeg", "ffprobe", "whisper"):
        binary_path = shutil.which(binary)
        table.add_row(binary, binary_path or "NOT FOUND")
    table.add_row("NVIDIA_API_KEY", "configured" if settings.nvidia_api_key else "NOT SET")
    table.add_row("Global model", settings.nvidia.global_model)
    table.add_row("Segment model", settings.nvidia.segment_model)
    table.add_row("NVCF assets", settings.nvidia.asset_api_base)
    table.add_row(
        "YouTube OAuth",
        "configured" if Path(settings.youtube_client_secret).exists() else "NOT FOUND",
    )
    console.print(table)


@app.command("nvidia-check")
def nvidia_check(config: Path = typer.Option(Path("config.yaml"), "--config", "-c")) -> None:
    """Verify both MiniMax-M3 and Nemotron Omni with minimal text calls."""
    settings = load_config(config)
    clients = (
        ("MiniMax global", _global_client(settings)),
        ("Nemotron segment", _segment_client(settings)),
    )
    if not settings.nvidia_api_key:
        raise typer.BadParameter("NVIDIA_API_KEY is not configured")
    for label, client in clients:
        try:
            result = client.healthcheck()
        except NvidiaNimError as exc:
            console.print(f"[red]{label} failed:[/red] {exc}")
            raise typer.Exit(code=1) from exc
        console.print(f"[green]{label} OK[/green] — {result['model']} ({result['status']})")


@app.command("youtube-check")
def youtube_check(config: Path = typer.Option(Path("config.yaml"), "--config", "-c")) -> None:
    """Open the system browser for OAuth and verify the selected YouTube channel."""
    settings = load_config(config)
    try:
        result = youtube_channel_info(
            client_secret=Path(settings.youtube_client_secret),
            token_file=Path(settings.youtube_token_file),
        )
    except Exception as exc:
        console.print(f"[red]YouTube connection failed:[/red] {exc}")
        raise typer.Exit(code=1) from exc
    console.print(
        f"[green]YouTube OK[/green] — {result.get('channel_title')} "
        f"({result.get('channel_id')})"
    )


@app.command("nvidia-global-check")
def nvidia_global_check(
    video: Path = typer.Argument(..., exists=True, dir_okay=False, readable=True),
    config: Path = typer.Option(Path("config.yaml"), "--config", "-c"),
    start: float = typer.Option(0.0, help="Start time in seconds"),
    duration: float = typer.Option(60.0, help="Long-form sample duration in seconds"),
) -> None:
    """Verify a real MiniMax-M3 video request."""
    settings = load_config(config)
    client = _global_client(settings)
    if not client.available:
        raise typer.BadParameter("NVIDIA_API_KEY is not configured")
    end = min(media_duration(video), max(start + 0.1, start + duration))
    with tempfile.TemporaryDirectory(prefix="yt-auto-minimax-") as directory:
        root = Path(directory)
        sample = extract_global_analysis_video(
            video,
            start=start,
            end=end,
            output=root / "sample.mp4",
            max_duration=settings.global_analysis.max_chunk_sec,
            width=settings.global_analysis.analysis_video_width,
            fps=settings.global_analysis.analysis_video_fps,
            crf=settings.global_analysis.analysis_video_crf,
        )
        try:
            result = client.video_json(
                """Analyze this video and return ONLY JSON:
{"status":"ok","summary":"...","thumbnail_timestamp":0.0}""",
                sample,
                max_tokens=1200,
            )
        except NvidiaNimError as exc:
            console.print(f"[red]MiniMax video connection failed:[/red] {exc}")
            raise typer.Exit(code=1) from exc
    console.print_json(data=result)


@app.command("nvidia-media-check")
def nvidia_media_check(
    video: Path = typer.Argument(..., exists=True, dir_okay=False, readable=True),
    config: Path = typer.Option(Path("config.yaml"), "--config", "-c"),
    start: float = typer.Option(0.0, help="Start time in seconds"),
    duration: float = typer.Option(12.0, help="Analysis clip duration in seconds"),
) -> None:
    """Verify a real short-range Nemotron video+audio request."""
    settings = load_config(config)
    client = _segment_client(settings)
    if not client.available:
        raise typer.BadParameter("NVIDIA_API_KEY is not configured")
    end = min(media_duration(video), max(start + 0.1, start + duration))
    with tempfile.TemporaryDirectory(prefix="yt-auto-omni-") as directory:
        root = Path(directory)
        sample_video, sample_audio = extract_analysis_media(
            video,
            start=start,
            end=end,
            video_output=root / "sample.mp4",
            audio_output=root / "sample.mp3",
            max_duration=settings.cut.max_omni_segment_sec,
            width=settings.cut.analysis_video_width,
            fps=settings.cut.analysis_video_fps,
            audio_bitrate=settings.cut.analysis_audio_bitrate,
        )
        try:
            result = client.omni_json(
                """Analyze the supplied video and audio. Return ONLY JSON:
{"status":"ok","visual_summary":"...","audio_summary":"...","issues":[]}""",
                video_path=sample_video,
                audio_path=sample_audio,
                max_tokens=900,
            )
        except NvidiaNimError as exc:
            console.print(f"[red]Nemotron media connection failed:[/red] {exc}")
            raise typer.Exit(code=1) from exc
    console.print_json(data=result)


@app.command()
def run(
    video: Path = typer.Argument(..., exists=True, dir_okay=False, readable=True),
    config: Path = typer.Option(Path("config.yaml"), "--config", "-c"),
    mock_ai: bool = typer.Option(False, help="Use deterministic heuristics instead of NVIDIA API"),
    no_upload: bool = typer.Option(False, help="Force-disable YouTube upload"),
) -> None:
    """Run global planning, auto-cut, Whisper captions, thumbnail, and upload."""
    settings = load_config(config)
    if mock_ai:
        settings.project.mock_ai = True
    if no_upload:
        settings.upload.enabled = False
    artifacts = run_pipeline(video, settings)

    table = Table(title="Generated artifacts")
    table.add_column("Item")
    table.add_column("Path")
    for label, value in (
        ("Workspace", artifacts.workspace),
        ("MiniMax global plan", artifacts.global_plan_json),
        ("EDL", artifacts.edl_json),
        ("Remapped Whisper SRT", artifacts.edited_srt),
        ("Edited video", artifacts.edited_video),
        ("Subtitled video", artifacts.subtitled_video),
        ("Thumbnail", artifacts.thumbnail),
        ("Upload receipt", artifacts.upload_receipt),
    ):
        table.add_row(label, str(value) if value else "-")
    console.print(table)


@app.command()
def serve(
    host: str = typer.Option(os.getenv("YT_AUTO_EDITOR_HOST", "127.0.0.1"), "--host"),
    port: int = typer.Option(int(os.getenv("YT_AUTO_EDITOR_PORT", "8787")), "--port"),
    reload: bool = typer.Option(False, help="Development auto-reload"),
) -> None:
    """Start the isolated web service that Heather opens on localhost."""
    try:
        import uvicorn
    except ModuleNotFoundError as exc:
        raise typer.BadParameter("Install the web extra: pip install -e '.[web]'") from exc
    uvicorn.run("yt_auto_editor.server:app", host=host, port=port, reload=reload)
