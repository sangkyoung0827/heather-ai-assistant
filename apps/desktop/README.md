# Heather Desktop for macOS

Heather Desktop is an Electron shell for the deployed Heather web application. It manages the isolated YouTube editing worker as a child process on `127.0.0.1:8787`.

## Security boundaries

- NVIDIA keys are encrypted with Electron `safeStorage` backed by macOS Keychain.
- Google Desktop OAuth JSON and refresh tokens stay under the app's Application Support directory with mode `0600`.
- No secret is bundled into the app, committed to GitHub, or sent to Vercel.
- The remote Heather page receives only the localhost worker URL.
- FFmpeg is local software and does not use an Authorization header.
- A YouTube API key is not used for video uploads; OAuth scopes authorize uploads.

## First launch

Open **Heather → 로컬 설정** and complete:

1. Install or repair the local runtime.
2. Save a newly issued NVIDIA `nvapi-` key.
3. Import a Google OAuth Desktop app JSON.
4. Run MiniMax/Nemotron and YouTube channel checks.

The app installs the worker and Python virtual environment in `~/Library/Application Support/Heather/runtime` and writes logs under `~/Library/Application Support/Heather/logs`.

## Distribution

The GitHub workflow builds arm64 and x64 DMG/ZIP files. Without Apple Developer ID secrets the build is intentionally unsigned and cannot be notarized; users must use macOS **Open** on first launch.
