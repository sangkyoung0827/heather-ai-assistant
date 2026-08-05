from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from .config import UploadConfig

SCOPES = [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.force-ssl",
]


def validate_desktop_oauth(client_secret: Path) -> dict[str, str]:
    """Validate a Google installed-app OAuth JSON without returning the secret."""
    if not client_secret.exists():
        raise FileNotFoundError(f"YouTube OAuth client secret not found: {client_secret}")
    try:
        payload = json.loads(client_secret.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError("YouTube OAuth JSON cannot be read") from exc
    installed = payload.get("installed") if isinstance(payload, dict) else None
    if not isinstance(installed, dict):
        raise ValueError("Google OAuth credential must use the Desktop app/installed format")
    required = ("client_id", "auth_uri", "token_uri")
    missing = [name for name in required if not installed.get(name)]
    if missing:
        raise ValueError(f"Google OAuth JSON is missing: {', '.join(missing)}")
    redirects = installed.get("redirect_uris") or []
    if not any(
        isinstance(value, str)
        and (value.startswith("http://localhost") or value.startswith("http://127.0.0.1"))
        for value in redirects
    ):
        raise ValueError("Google Desktop OAuth JSON needs a localhost loopback redirect")
    return {
        "project_id": str(installed.get("project_id") or ""),
        "client_id": str(installed["client_id"]),
    }


def _credentials(client_secret: Path, token_file: Path):
    try:
        from google.auth.transport.requests import Request
        from google.oauth2.credentials import Credentials
        from google_auth_oauthlib.flow import InstalledAppFlow
    except ModuleNotFoundError as exc:
        raise RuntimeError("Install Google API dependencies before enabling upload") from exc

    validate_desktop_oauth(client_secret)
    credentials: Credentials | None = None
    if token_file.exists():
        try:
            credentials = Credentials.from_authorized_user_file(str(token_file), SCOPES)
        except (OSError, ValueError, json.JSONDecodeError):
            token_file.unlink(missing_ok=True)
    if credentials and credentials.expired and credentials.refresh_token:
        credentials.refresh(Request())
    if not credentials or not credentials.valid:
        flow = InstalledAppFlow.from_client_secrets_file(str(client_secret), SCOPES)
        credentials = flow.run_local_server(
            host="localhost",
            port=0,
            open_browser=True,
            access_type="offline",
            prompt="consent",
            success_message="Heather YouTube 연결이 완료됐습니다. 이 창을 닫고 Heather로 돌아가세요.",
        )
    token_file.parent.mkdir(parents=True, exist_ok=True)
    token_file.write_text(credentials.to_json(), encoding="utf-8")
    try:
        os.chmod(token_file, 0o600)
    except OSError:
        pass
    return credentials


def youtube_channel_info(*, client_secret: Path, token_file: Path) -> dict[str, Any]:
    """Authorize the installed app and return the selected upload channel."""
    try:
        from googleapiclient.discovery import build
    except ModuleNotFoundError as exc:
        raise RuntimeError("Install google-api-python-client before checking YouTube") from exc

    credentials = _credentials(client_secret, token_file)
    youtube = build("youtube", "v3", credentials=credentials, cache_discovery=False)
    response = youtube.channels().list(part="id,snippet,status", mine=True).execute()
    items = list(response.get("items") or [])
    if not items:
        raise RuntimeError("The authorized Google account does not expose a YouTube channel")
    channel = items[0]
    return {
        "status": "ok",
        "channel_id": channel.get("id"),
        "channel_title": (channel.get("snippet") or {}).get("title"),
        "privacy_status": (channel.get("status") or {}).get("privacyStatus"),
    }


def upload_to_youtube(
    *,
    video: Path,
    thumbnail: Path | None,
    caption_srt: Path | None,
    client_secret: Path,
    token_file: Path,
    config: UploadConfig,
    language: str,
) -> dict[str, Any]:
    """Upload video, thumbnail, and timed caption track after complete preflight."""
    if not video.exists():
        raise FileNotFoundError(f"Final video not found: {video}")
    if config.require_thumbnail_upload and (not thumbnail or not thumbnail.exists()):
        raise FileNotFoundError("Thumbnail upload is required but thumbnail.jpg is missing")
    if (
        config.upload_caption_track
        and config.require_caption_upload
        and (not caption_srt or not caption_srt.exists())
    ):
        raise FileNotFoundError("Caption upload is required but the edited Whisper SRT is missing")
    validate_desktop_oauth(client_secret)

    try:
        from googleapiclient.discovery import build
        from googleapiclient.http import MediaFileUpload
    except ModuleNotFoundError as exc:
        raise RuntimeError("Install google-api-python-client before enabling upload") from exc

    credentials = _credentials(client_secret, token_file)
    youtube = build("youtube", "v3", credentials=credentials, cache_discovery=False)

    body = {
        "snippet": {
            "title": config.title,
            "description": config.description,
            "tags": config.tags,
            "categoryId": config.category_id,
            "defaultLanguage": language,
        },
        "status": {
            "privacyStatus": config.privacy_status,
            "selfDeclaredMadeForKids": config.made_for_kids,
            "containsSyntheticMedia": config.contains_synthetic_media,
        },
    }
    request = youtube.videos().insert(
        part="snippet,status",
        body=body,
        notifySubscribers=config.notify_subscribers,
        media_body=MediaFileUpload(str(video), chunksize=8 * 1024 * 1024, resumable=True),
    )
    response = None
    while response is None:
        _, response = request.next_chunk()
    video_id = response["id"]

    thumbnail_uploaded = False
    caption_id = None
    try:
        if thumbnail and thumbnail.exists():
            youtube.thumbnails().set(
                videoId=video_id,
                media_body=MediaFileUpload(str(thumbnail), mimetype="image/jpeg"),
            ).execute()
            thumbnail_uploaded = True

        if config.upload_caption_track and caption_srt and caption_srt.exists():
            caption = youtube.captions().insert(
                part="snippet",
                body={
                    "snippet": {
                        "videoId": video_id,
                        "language": language,
                        "name": config.caption_name,
                        "isDraft": False,
                    }
                },
                media_body=MediaFileUpload(
                    str(caption_srt), mimetype="application/x-subrip", resumable=False
                ),
            ).execute()
            caption_id = caption.get("id")
    except Exception as exc:
        raise RuntimeError(
            f"YouTube video {video_id} was created, but post-upload completion failed: {exc}"
        ) from exc

    if config.require_thumbnail_upload and not thumbnail_uploaded:
        raise RuntimeError(f"YouTube video {video_id} exists, but thumbnail upload did not complete")
    if config.upload_caption_track and config.require_caption_upload and not caption_id:
        raise RuntimeError(f"YouTube video {video_id} exists, but caption upload did not complete")

    return {
        "status": "complete",
        "video_id": video_id,
        "thumbnail_uploaded": thumbnail_uploaded,
        "caption_id": caption_id,
        "caption_uploaded": bool(caption_id),
        "privacy_status": config.privacy_status,
        "response": json.loads(json.dumps(response)),
    }
