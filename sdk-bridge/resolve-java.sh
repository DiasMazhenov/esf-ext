#!/usr/bin/env bash
set -euo pipefail

java_major() {
  local version major
  version="$($1 -version 2>&1 | awk -F '"' '/version/ { print $2; exit }')"
  major="${version%%.*}"
  if [[ "$major" == "1" ]]; then
    major="${version#1.}"
    major="${major%%.*}"
  fi
  printf '%s' "$major"
}

candidates=()
if [[ -n "${ESF_JAVA_HOME:-}" ]]; then
  candidates+=("$ESF_JAVA_HOME/bin/java")
fi
if [[ -n "${JAVA_HOME:-}" ]]; then
  candidates+=("$JAVA_HOME/bin/java")
fi
if command -v java >/dev/null 2>&1; then
  candidates+=("$(command -v java)")
fi
candidates+=(
  "/opt/homebrew/opt/openjdk@21/bin/java"
  "/usr/local/opt/openjdk@21/bin/java"
  "/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home/bin/java"
  "/Library/Java/JavaVirtualMachines/jdk-21.jdk/Contents/Home/bin/java"
)

for java in "${candidates[@]}"; do
  if [[ -x "$java" && -x "$(dirname "$java")/javac" ]] && [[ "$(java_major "$java")" == "21" ]]; then
    printf '%s\n' "$java"
    exit 0
  fi
done

cat >&2 <<'MESSAGE'
OpenJDK 21 was not found.
Install it with: brew install openjdk@21
Or set ESF_JAVA_HOME to a JDK 21 installation.
MESSAGE
exit 1
