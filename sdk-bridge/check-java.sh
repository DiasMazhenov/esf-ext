#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
JAVA="$($ROOT_DIR/resolve-java.sh)"
"$JAVA" -version
