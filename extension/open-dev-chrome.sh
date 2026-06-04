#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
EXTENSION_DIR="$ROOT_DIR/extension"
PROFILE_DIR="${ESF_EXT_CHROME_PROFILE:-/private/tmp/esf-ext-chrome-profile}"

open -na "Google Chrome" --args \
  "--user-data-dir=$PROFILE_DIR" \
  "--load-extension=$EXTENSION_DIR" \
  "chrome://extensions"
