from __future__ import annotations

import os
import shutil
import threading
import uuid
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .config import AppConfig, load_config
from .pipeline import run_pipeline
from .refinement import apply_refinement
from .uploader import upload_to_youtube
from .utils import write_json

try:
    from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import FileResponse
    from pydantic import BaseModel, Field
except ModuleNotFoundError as exc:
    raise RuntimeError("Install the web extra: pip install -e '.[web]'") from exc


class RefineRequest(BaseModel):
    instruction: str = Field(min_length=2, max_length=2000)


_JOBS: dict[str, dict[str, Any]] = {}
_LOCK = threading.Lock()


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _public_artifacts(artifacts: Any) -> dict[str, str | None]:
    values = asdict(artifacts)
    result: dict[str, str | None] = {}
    for key, value in values.items():
        if key == "workspace":
            continue
        result[key] = Path(value).name if value else None
    return result


def _public_job(job: dict[str, Any]) -> dict[str, Any]:
    private = {"artifact_paths", "settings", "source_path", "workspace_path", "transcript_srt_path", "transcript_json_path"}
    return {key: value for key, value in job.items() if key not in private}


def _run_job(job_id: str, source: Path, settings: AppConfig) -> None:
    with _LOCK:
        _JOBS[job_id].update({"status": "processing", "phase": "editing", "started_at": _utc_now()})
    try:
        settings.upload.enabled = False
        artifacts = run_pipeline(source, settings)
        artifact_paths = {
            key: Path(value) if value else None
            for key, value in asdict(artifacts).items()
            if key != "workspace"
        }
        with _LOCK:
            _JOBS[job_id].update(
                {
                    "status": "completed",
                    "phase": "review",
                    "completed_at": _utc_now(),
                    "workspace": str(artifacts.workspace),
                    "workspace_path": artifacts.workspace,
                    "artifacts": _public_artifacts(artifacts),
                    "artifact_paths": artifact_paths,
                    "transcript_srt_path": artifacts.transcript_srt,
                    "transcript_json_path": artifacts.transcript_json,
                    "revision": 0,
                }
            )
    except Exception as exc:
        with _LOCK:
            _JOBS[job_id].update(
                {
                    "status": "failed",
                    "phase": "editing",
                    "completed_at": _utc_now(),
                    "error": f"{type(exc).__name__}: {exc}",
                }
            )


def _run_refinement(job_id: str, instruction: str) -> None:
    with _LOCK:
        job = _JOBS[job_id]
        job.update({"status": "processing", "phase": "refining", "error": None})
        source = Path(job["source_path"])
        workspace = Path(job["workspace_path"])
        artifact_paths = dict(job.get("artifact_paths") or {})
        settings: AppConfig = job["settings"]
        revision = int(job.get("revision", 0)) + 1
        transcript_srt = job.get("transcript_srt_path")
        transcript_json = job.get("transcript_json_path")
        current_edl = artifact_paths.get("edl_json")
    try:
        if not current_edl:
            raise FileNotFoundError("Current EDL is missing")
        refined = apply_refinement(
            instruction=instruction,
            source=source,
            workspace=workspace,
            edl_json=Path(current_edl),
            transcript_srt=Path(transcript_srt) if transcript_srt else None,
            transcript_json=Path(transcript_json) if transcript_json else None,
            config=settings,
            revision=revision,
        )
        artifact_paths.update(
            {
                "edl_json": refined.edl_json,
                "edited_video": refined.edited_video,
                "edited_srt": refined.edited_srt,
                "subtitled_video": refined.subtitled_video,
            }
        )
        public_artifacts = {
            key: Path(value).name if value else None
            for key, value in artifact_paths.items()
        }
        with _LOCK:
            history = list(_JOBS[job_id].get("refinements") or [])
            history.append(
                {
                    "revision": revision,
                    "instruction": instruction,
                    "notes": refined.notes,
                    "completed_at": _utc_now(),
                }
            )
            _JOBS[job_id].update(
                {
                    "status": "completed",
                    "phase": "review",
                    "completed_at": _utc_now(),
                    "revision": revision,
                    "refinements": history,
                    "refinement_notes": refined.notes,
                    "artifact_paths": artifact_paths,
                    "artifacts": public_artifacts,
                }
            )
    except Exception as exc:
        with _LOCK:
            _JOBS[job_id].update(
                {
                    "status": "failed",
                    "phase": "refining",
                    "completed_at": _utc_now(),
                    "error": f"{type(exc).__name__}: {exc}",
                }
            )


def _run_upload(job_id: str) -> None:
    with _LOCK:
        job = _JOBS[job_id]
        job.update({"upload_status": "uploading", "upload_error": None})
        settings: AppConfig = job["settings"]
        artifact_paths = dict(job.get("artifact_paths") or {})
        workspace = Path(job["workspace_path"])
        settings.upload.enabled = True
        settings.upload.title = str(job.get("title") or settings.upload.title)
        final_video = artifact_paths.get("subtitled_video") or artifact_paths.get("edited_video")
        thumbnail = artifact_paths.get("thumbnail")
        caption_srt = artifact_paths.get("edited_srt")
    try:
        if not final_video:
            raise FileNotFoundError("Final edited video is missing")
        receipt = upload_to_youtube(
            video=Path(final_video),
            thumbnail=Path(thumbnail) if thumbnail else None,
            caption_srt=Path(caption_srt) if caption_srt else None,
            client_secret=Path(settings.youtube_client_secret),
            token_file=Path(settings.youtube_token_file),
            config=settings.upload,
            language=settings.project.language,
        )
        receipt_path = write_json(workspace / "upload-receipt.json", receipt)
        artifact_paths["upload_receipt"] = receipt_path
        with _LOCK:
            _JOBS[job_id].update(
                {
                    "upload_status": "completed",
                    "uploaded_at": _utc_now(),
                    "youtube": receipt,
                    "artifact_paths": artifact_paths,
                    "artifacts": {
                        key: Path(value).name if value else None
                        for key, value in artifact_paths.items()
                    },
                }
            )
    except Exception as exc:
        with _LOCK:
            _JOBS[job_id].update(
                {
                    "upload_status": "failed",
                    "upload_error": f"{type(exc).__name__}: {exc}",
                }
            )


def create_app():
    app = FastAPI(
        title="Heather YouTube Auto Editor",
        version="0.4.0",
        description="Isolated auto-editing service. It does not call Heather memory or chat APIs.",
    )
    configured_origins = os.getenv("HEATHER_ORIGINS") or os.getenv("HEATHER_ORIGIN") or ""
    origins = [item.strip().rstrip("/") for item in configured_origins.split(",") if item.strip()]
    if not origins:
        origins = [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "https://heather-ai-assistant.vercel.app",
            "https://heather-ai-assistant-web.vercel.app",
            "https://heather-ai-assistant-7x6i6v747.vercel.app",
        ]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def allow_private_network(request, call_next):
        response = await call_next(request)
        if request.headers.get("access-control-request-private-network") == "true":
            response.headers["Access-Control-Allow-Private-Network"] = "true"
        return response

    web_root = Path(__file__).with_name("web")

    @app.get("/")
    def index():
        return FileResponse(web_root / "index.html")

    @app.get("/health")
    def health() -> dict[str, Any]:
        config_path = Path(os.getenv("YT_AUTO_EDITOR_CONFIG", "config.yaml"))
        settings = load_config(config_path)
        return {
            "status": "ok",
            "service": "heather-youtube-auto-editor",
            "version": "0.4.0",
            "isolation": "standalone",
            "global_model": settings.nvidia.global_model,
            "segment_model": settings.nvidia.segment_model,
            "nvidia_configured": bool(settings.nvidia_api_key),
            "youtube_oauth_configured": Path(settings.youtube_client_secret).exists(),
        }

    @app.post("/api/jobs")
    async def create_job(
        background_tasks: BackgroundTasks,
        file: UploadFile = File(...),
        nvidia_api_key: str = Form(""),
        mock_ai: bool = Form(False),
    ) -> dict[str, Any]:
        suffix = Path(file.filename or "input.mp4").suffix.lower()
        if suffix not in {".mp4", ".mov", ".mkv", ".webm"}:
            raise HTTPException(status_code=415, detail="Unsupported video format")

        job_id = uuid.uuid4().hex
        config_path = Path(os.getenv("YT_AUTO_EDITOR_CONFIG", "config.yaml"))
        settings = load_config(config_path)
        settings.project.mock_ai = mock_ai
        settings.upload.enabled = False
        title = Path(file.filename or "자동 편집 영상").stem.strip() or "자동 편집 영상"
        settings.upload.title = title
        settings.thumbnail.title_hint = title
        supplied_key = nvidia_api_key.strip()
        if supplied_key:
            settings.nvidia_api_key = supplied_key
        if not mock_ai and not settings.nvidia_api_key:
            raise HTTPException(status_code=400, detail="NVIDIA_API_KEY must be configured in the local worker .env")

        upload_root = Path(settings.project.workspace_root) / "incoming" / job_id
        upload_root.mkdir(parents=True, exist_ok=True)
        source = upload_root / f"source{suffix}"
        with source.open("wb") as target:
            shutil.copyfileobj(file.file, target)
        await file.close()

        with _LOCK:
            _JOBS[job_id] = {
                "id": job_id,
                "status": "queued",
                "phase": "editing",
                "created_at": _utc_now(),
                "filename": file.filename,
                "title": title,
                "upload_status": "not_started",
                "mock_ai": mock_ai,
                "artifacts": {},
                "source_path": source,
                "settings": settings,
            }
        background_tasks.add_task(_run_job, job_id, source, settings)
        return {"id": job_id, "status": "queued"}

    @app.get("/api/jobs/{job_id}")
    def get_job(job_id: str) -> dict[str, Any]:
        with _LOCK:
            job = _JOBS.get(job_id)
            if not job:
                raise HTTPException(status_code=404, detail="Job not found")
            return _public_job(job)

    @app.post("/api/jobs/{job_id}/refine")
    def refine_job(job_id: str, request: RefineRequest, background_tasks: BackgroundTasks) -> dict[str, Any]:
        with _LOCK:
            job = _JOBS.get(job_id)
            if not job:
                raise HTTPException(status_code=404, detail="Job not found")
            if job.get("status") != "completed":
                raise HTTPException(status_code=409, detail="The current edit must be complete before refinement")
            if job.get("upload_status") == "uploading":
                raise HTTPException(status_code=409, detail="Cannot refine while YouTube upload is running")
        background_tasks.add_task(_run_refinement, job_id, request.instruction.strip())
        return {"id": job_id, "status": "queued", "phase": "refining"}

    @app.post("/api/jobs/{job_id}/upload")
    def upload_job(job_id: str, background_tasks: BackgroundTasks) -> dict[str, Any]:
        with _LOCK:
            job = _JOBS.get(job_id)
            if not job:
                raise HTTPException(status_code=404, detail="Job not found")
            if job.get("status") != "completed":
                raise HTTPException(status_code=409, detail="The edit must be complete before upload")
            if job.get("upload_status") == "uploading":
                raise HTTPException(status_code=409, detail="YouTube upload is already running")
        background_tasks.add_task(_run_upload, job_id)
        return {"id": job_id, "upload_status": "uploading"}

    @app.get("/api/jobs/{job_id}/artifacts/{artifact_name}")
    def get_artifact(job_id: str, artifact_name: str):
        with _LOCK:
            job = _JOBS.get(job_id)
            if not job:
                raise HTTPException(status_code=404, detail="Job not found")
            path = (job.get("artifact_paths") or {}).get(artifact_name)
        if not path or not Path(path).exists():
            raise HTTPException(status_code=404, detail="Artifact not found")
        return FileResponse(Path(path), filename=Path(path).name)

    return app


app = create_app()
