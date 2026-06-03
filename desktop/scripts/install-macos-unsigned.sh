#!/usr/bin/env bash
set -euo pipefail

APP_NAME="Claude Code Haha.app"
APP_PATH="/Applications/${APP_NAME}"

script_dir() {
  cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1
  pwd
}

find_dmg() {
  local dir="$1"
  local arch
  arch="$(uname -m)"

  shopt -s nullglob
  local matches=("${dir}"/Claude-Code-Haha-*-mac-*.dmg)
  shopt -u nullglob

  if [ "${#matches[@]}" -eq 0 ]; then
    return 1
  fi

  if [ "${#matches[@]}" -eq 1 ]; then
    printf '%s\n' "${matches[0]}"
    return 0
  fi

  local wanted="mac-x64"
  if [ "$arch" = "arm64" ]; then
    wanted="mac-arm64"
  fi

  local dmg
  for dmg in "${matches[@]}"; do
    if [[ "$(basename "$dmg")" == *"${wanted}.dmg" ]]; then
      printf '%s\n' "$dmg"
      return 0
    fi
  done

  printf '%s\n' "${matches[0]}"
}

main() {
  local base_dir
  base_dir="$(script_dir)"

  local dmg="${1:-}"
  if [ -z "$dmg" ]; then
    if ! dmg="$(find_dmg "$base_dir")"; then
      echo "No Claude Code Haha macOS DMG found next to this script."
      echo "Usage: bash install-macos-unsigned.sh /path/to/Claude-Code-Haha-0.4.0-mac-arm64.dmg"
      exit 1
    fi
  fi

  if [ ! -f "$dmg" ]; then
    echo "DMG not found: $dmg"
    exit 1
  fi

  echo "Using DMG: $dmg"
  xattr -dr com.apple.quarantine "$dmg" 2>/dev/null || true

  local mount_output volume app_in_volume
  mount_output="$(hdiutil attach "$dmg" -nobrowse -readonly)"
  volume="$(printf '%s\n' "$mount_output" | sed -n 's#^.*\(/Volumes/.*\)$#\1#p' | head -n 1)"
  if [ -z "$volume" ] || [ ! -d "$volume" ]; then
    echo "Could not find mounted DMG volume."
    exit 1
  fi

  cleanup() {
    hdiutil detach "$volume" >/dev/null 2>&1 || true
  }
  trap cleanup EXIT

  app_in_volume="${volume}/${APP_NAME}"
  if [ ! -d "$app_in_volume" ]; then
    echo "Could not find ${APP_NAME} in mounted DMG: $volume"
    exit 1
  fi

  osascript -e 'quit app "Claude Code Haha"' >/dev/null 2>&1 || true

  if [ -d "$APP_PATH" ]; then
    local backup
    backup="${HOME}/.Trash/Claude Code Haha.$(date +%Y%m%d%H%M%S).app"
    echo "Moving existing app to: $backup"
    mv "$APP_PATH" "$backup"
  fi

  echo "Installing to: $APP_PATH"
  ditto "$app_in_volume" "$APP_PATH"
  xattr -dr com.apple.quarantine "$APP_PATH" 2>/dev/null || true

  echo "Opening Claude Code Haha..."
  open "$APP_PATH"
}

main "$@"
