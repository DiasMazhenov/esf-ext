#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
SDK_LIB="$ROOT_DIR/lib"
JAVA="$("$ROOT_DIR/resolve-java.sh")"
JAVAC="$(dirname "$JAVA")/javac"
JARS="$SDK_LIB/*"

if [[ ! -d "$SDK_LIB" ]] || ! compgen -G "$SDK_LIB/*.jar" > /dev/null; then
  echo "Missing SDK runtime JARs in $SDK_LIB" >&2
  exit 1
fi

mkdir -p "$ROOT_DIR/bin/classes"
"$JAVAC" -encoding UTF-8 -cp "$JARS" -d "$ROOT_DIR/bin/classes" "$ROOT_DIR/src/SignXml.java" "$ROOT_DIR/src/SignRaw.java"
cat > "$ROOT_DIR/bin/sign-xml" <<'RUNNER'
#!/usr/bin/env bash
set -euo pipefail
BRIDGE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
JAVA="$("$BRIDGE_DIR/resolve-java.sh")"
exec "$JAVA" -cp "$BRIDGE_DIR/bin/classes:$BRIDGE_DIR/lib/*" SignXml "$@"
RUNNER
chmod +x "$ROOT_DIR/bin/sign-xml"
cat > "$ROOT_DIR/bin/sign-raw" <<'RUNNER'
#!/usr/bin/env bash
set -euo pipefail
BRIDGE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
JAVA="$("$BRIDGE_DIR/resolve-java.sh")"
exec "$JAVA" -cp "$BRIDGE_DIR/bin/classes:$BRIDGE_DIR/lib/*" SignRaw "$@"
RUNNER
chmod +x "$ROOT_DIR/bin/sign-raw"
echo "Built sdk-bridge/bin/sign-xml and sdk-bridge/bin/sign-raw"
