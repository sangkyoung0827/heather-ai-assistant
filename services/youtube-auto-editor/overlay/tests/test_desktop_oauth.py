from pathlib import Path

import pytest

from yt_auto_editor.uploader import validate_desktop_oauth


def test_validate_desktop_oauth_accepts_installed_client(tmp_path: Path) -> None:
    client_secret = tmp_path / "client.json"
    client_secret.write_text(
        '{"installed":{"client_id":"example.apps.googleusercontent.com",'
        '"project_id":"heather-test","auth_uri":"https://accounts.google.com/o/oauth2/auth",'
        '"token_uri":"https://oauth2.googleapis.com/token",'
        '"redirect_uris":["http://localhost"]}}',
        encoding="utf-8",
    )
    result = validate_desktop_oauth(client_secret)
    assert result["project_id"] == "heather-test"
    assert result["client_id"].endswith("apps.googleusercontent.com")


def test_validate_desktop_oauth_rejects_web_client(tmp_path: Path) -> None:
    client_secret = tmp_path / "client.json"
    client_secret.write_text('{"web":{"client_id":"wrong"}}', encoding="utf-8")
    with pytest.raises(ValueError, match="Desktop app"):
        validate_desktop_oauth(client_secret)
