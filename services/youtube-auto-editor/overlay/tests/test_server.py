from pathlib import Path

from fastapi.testclient import TestClient

from yt_auto_editor.models import PipelineArtifacts
import yt_auto_editor.server as server


def fake_pipeline(source: Path, settings):
    assert source.exists()
    assert settings.nvidia_api_key == "nvapi-test-key"
    assert settings.upload.enabled is False
    workspace = source.parent / "done"
    workspace.mkdir(parents=True, exist_ok=True)
    edited = workspace / "edited.mp4"
    captions = workspace / "edited.srt"
    transcript = workspace / "source.srt"
    transcript_json = workspace / "source.json"
    thumb = workspace / "thumbnail.jpg"
    edl = workspace / "edl.json"
    for path in (edited, captions, transcript, thumb):
        path.write_bytes(b"ok")
    transcript_json.write_text('{"segments": []}', encoding="utf-8")
    edl.write_text('{"source":"sample.mp4","keep_ranges":[{"start":0,"end":1}]}', encoding="utf-8")
    return PipelineArtifacts(
        workspace=workspace,
        transcript_srt=transcript,
        transcript_json=transcript_json,
        edited_video=edited,
        edited_srt=captions,
        thumbnail=thumb,
        edl_json=edl,
    )


def test_real_job_requires_key(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("NVIDIA_API_KEY", raising=False)
    client = TestClient(server.create_app())
    response = client.post(
        "/api/jobs",
        files={"file": ("sample.mp4", b"video", "video/mp4")},
        data={"mock_ai": "false"},
    )
    assert response.status_code == 400
    assert "NVIDIA_API_KEY" in response.json()["detail"]


def test_job_accepts_ephemeral_key_but_does_not_upload(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("NVIDIA_API_KEY", raising=False)
    monkeypatch.setattr(server, "run_pipeline", fake_pipeline)
    client = TestClient(server.create_app())
    response = client.post(
        "/api/jobs",
        files={"file": ("sample.mp4", b"video", "video/mp4")},
        data={"mock_ai": "false", "nvidia_api_key": "nvapi-test-key"},
    )
    assert response.status_code == 200
    job_id = response.json()["id"]
    job = client.get(f"/api/jobs/{job_id}").json()
    assert job["status"] == "completed"
    assert job["phase"] == "review"
    assert job["upload_status"] == "not_started"
    assert "settings" not in job
    assert "source_path" not in job
    assert job["artifacts"]["edited_video"] == "edited.mp4"
    assert job["artifacts"]["edited_srt"] == "edited.srt"
    assert job["artifacts"]["thumbnail"] == "thumbnail.jpg"


def test_refine_and_upload_require_completed_job(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    client = TestClient(server.create_app())
    server._JOBS["pending"] = {"id": "pending", "status": "processing", "upload_status": "not_started"}
    refine = client.post("/api/jobs/pending/refine", json={"instruction": "앞부분을 조금 줄여줘"})
    upload = client.post("/api/jobs/pending/upload")
    assert refine.status_code == 409
    assert upload.status_code == 409


def test_private_network_preflight_header(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    client = TestClient(server.create_app())
    response = client.options(
        "/health",
        headers={
            "origin": "http://localhost:3000",
            "access-control-request-method": "GET",
            "access-control-request-private-network": "true",
        },
    )
    assert response.headers.get("access-control-allow-private-network") == "true"
