# Heather YouTube Auto Editor Worker

This directory stores the isolated local worker package used by Heather's **YouTube Auto Editor** menu. It is intentionally separate from Heather chat, memory, Researcher, Direct Commands, and the browser-local Heather model.

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

The Heather web panel can pass an NVIDIA API key with a single job. The key is held in memory for that job and is not written by the worker. You can alternatively put `NVIDIA_API_KEY` in the local `.env` file.

For YouTube upload, place the Google OAuth desktop client file at `secrets/client_secret.json`. The first upload opens the local OAuth consent flow and stores the refresh token at `secrets/youtube_token.json`.

## Pipeline

1. Whisper creates the Korean transcript and original SRT.
2. MiniMax-M3 reviews up to 29-minute overlapping visual chunks and produces the global plan.
3. Nemotron 3 Nano Omni reviews short video and audio segments.
4. FFmpeg applies the EDL and remaps Whisper caption timestamps.
5. Pillow creates the thumbnail.
6. YouTube Data API uploads the final video, thumbnail, and caption track.

The packaged worker contains no NVIDIA key, Google OAuth secret, refresh token, source video, or rendered output.
