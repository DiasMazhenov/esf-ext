#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
SDK_LIB="/Users/diasmazhenov/Downloads/esf-sdk-2025/Документация ЭСФ SDK/sdk/lib"
JAVA="/opt/homebrew/opt/openjdk@21/bin/java"
JAVAC="/opt/homebrew/opt/openjdk@21/bin/javac"
JARS="$SDK_LIB/*"

mkdir -p "$ROOT_DIR/bin/classes"
"$JAVAC" -encoding UTF-8 -cp "$JARS" -d "$ROOT_DIR/bin/classes" "$ROOT_DIR/src/SignXml.java" "$ROOT_DIR/src/SignRaw.java"
cat > "$ROOT_DIR/bin/sign-xml" <<RUNNER
#!/usr/bin/env bash
set -euo pipefail
"$JAVA" -cp "$ROOT_DIR/bin/classes:$JARS" SignXml "\$@"
RUNNER
chmod +x "$ROOT_DIR/bin/sign-xml"
cat > "$ROOT_DIR/bin/sign-raw" <<RUNNER
#!/usr/bin/env bash
set -euo pipefail
"$JAVA" -cp "$ROOT_DIR/bin/classes:$JARS" SignRaw "\$@"
RUNNER
chmod +x "$ROOT_DIR/bin/sign-raw"
echo "Built sdk-bridge/bin/sign-xml and sdk-bridge/bin/sign-raw"
