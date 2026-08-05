# Heather YouTube Auto Editor Worker

This directory stores the isolated local worker package used by Heather's **YouTube Auto Editor** menu. It remains separate from Heather Chat, Memory, Researcher, Direct Commands, database, and browser-local model.

## Heather interface

The deployed Heather page contains only three user-facing actions:

1. Upload the original video and start automatic editing.
2. Review the result and request a small natural-language adjustment.
3. Upload the final video, thumbnail, and Whisper caption track to YouTube.

Technical credentials and rendering settings are kept in the local worker rather than exposed in the Heather page. The first step never uploads anything to YouTube. OAuth is used only after the final upload button is pressed.

## Install on macOS

```bash
brew install ffmpeg
python3 services/youtube-auto-editor/install.py --output "$HOME/HeatherWorker"
cd "$HOME/HeatherWorker/heather-youtube-auto-editor"
python3 -m venv .venv
source .venv/bin/activate
pip install -e '.[all,dev]'
cp config.example.yaml config.yaml
cp .env.example .env
yt-auto-editor doctor
yt-auto-editor serve --host 127.0.0.1 --port 8787
```

Put a newly issued NVIDIA key in the local `.env` file as `NVIDIA_API_KEY`. Do not commit the key.

For YouTube upload, download a Google OAuth **Desktop app** client file and place it at `secrets/client_secret.json`. The first upload opens the local Google consent flow and stores the refresh token at `secrets/youtube_token.json`.

## Pipeline

1. Whisper creates the Korean transcript and original SRT.
2. MiniMax-M3 reviews long-form visual chunks and produces the global plan.
3. Nemotron 3 Nano Omni reviews short video and audio segments.
4. FFmpeg applies the EDL and remaps Whisper caption timestamps.
5. Pillow creates the thumbnail.
6. A natural-language refinement revises the existing EDL conservatively and re-renders the result.
7. The YouTube Data API uploads the final video, thumbnail, and caption track only after explicit confirmation.

The packaged worker contains no NVIDIA key, Google OAuth secret, refresh token, source video, or rendered output.
