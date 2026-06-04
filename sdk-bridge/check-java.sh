#!/usr/bin/env bash
set -euo pipefail
JAVA="/opt/homebrew/opt/openjdk@21/bin/java"
if [[ ! -x "$JAVA" ]]; then
  echo "OpenJDK 21 not found at $JAVA"
  exit 1
fi
"$JAVA" -version
