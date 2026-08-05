#!/bin/bash
set -euo pipefail

DIST_DIR="${1:-dist}"
APP_ID="com.heather.personalassistant"
EXPECTED_VERSION="0.6.0"

shopt -s nullglob
DMGS=("$DIST_DIR"/Heather-${EXPECTED_VERSION}-*.dmg)
if [ ${#DMGS[@]} -eq 0 ]; then
  echo "No Heather DMG files found in $DIST_DIR" >&2
  exit 1
fi

for dmg in "${DMGS[@]}"; do
  echo "Verifying $dmg"
  MOUNT_POINT="$(mktemp -d /tmp/heather-dmg.XXXXXX)"
  INSTALL_ROOT="$(mktemp -d /tmp/heather-applications.XXXXXX)"
  cleanup() {
    hdiutil detach "$MOUNT_POINT" -quiet -force 2>/dev/null || true
    rm -rf "$MOUNT_POINT" "$INSTALL_ROOT"
  }
  trap cleanup EXIT

  hdiutil attach "$dmg" -nobrowse -readonly -mountpoint "$MOUNT_POINT" -quiet

  test -d "$MOUNT_POINT/Heather.app"
  test -L "$MOUNT_POINT/Applications"
  test "$(readlink "$MOUNT_POINT/Applications")" = "/Applications"

  APP="$MOUNT_POINT/Heather.app"
  INFO="$APP/Contents/Info.plist"
  test -f "$INFO"
  test "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$INFO")" = "$APP_ID"
  test "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$INFO")" = "$EXPECTED_VERSION"
  test -x "$APP/Contents/MacOS/Heather"
  test -f "$APP/Contents/Resources/youtube-auto-editor/install.py"

  codesign --verify --deep --strict --verbose=2 "$APP"

  ditto "$APP" "$INSTALL_ROOT/Heather.app"
  test -d "$INSTALL_ROOT/Heather.app"
  ELECTRON_RUN_AS_NODE=1 "$INSTALL_ROOT/Heather.app/Contents/MacOS/Heather" -e 'process.stdout.write("Heather executable OK\n")'

  ARCH_NAME="$(basename "$dmg" | sed -E 's/^Heather-[0-9.]+-([^.]+)\.dmg$/\1/')"
  if [ "$ARCH_NAME" = "arm64" ]; then
    file "$APP/Contents/MacOS/Heather" | grep -q "arm64"
  elif [ "$ARCH_NAME" = "x64" ]; then
    file "$APP/Contents/MacOS/Heather" | grep -Eq "x86_64|x86-64"
  else
    echo "Unexpected architecture in $dmg" >&2
    exit 1
  fi

  hdiutil detach "$MOUNT_POINT" -quiet
  rm -rf "$MOUNT_POINT" "$INSTALL_ROOT"
  trap - EXIT
  echo "Verified installable DMG: $dmg"
done
