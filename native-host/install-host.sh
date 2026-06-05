#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <chrome-extension-id>" >&2
  exit 2
fi

EXTENSION_ID="$1"
HOST_NAME="kz.esf.touchid"
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOST_BIN="$ROOT_DIR/bin/esf-touchid-native-host"
TARGET_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
TARGET_FILE="$TARGET_DIR/$HOST_NAME.json"

if [[ ! -x "$HOST_BIN" ]]; then
  "$ROOT_DIR/build.sh"
fi

mkdir -p "$TARGET_DIR"
cat > "$TARGET_FILE" <<JSON
{
  "name": "$HOST_NAME",
  "description": "ESF Bio Auth native messaging host",
  "path": "$HOST_BIN",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXTENSION_ID/"
  ]
}
JSON

echo "$TARGET_FILE"
