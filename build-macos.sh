#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

VERSION="$(node -p "const m=JSON.parse(require('fs').readFileSync('extension/manifest.json','utf8')); m.version_name || m.version")"
if [[ "${MACOS_UNIVERSAL:-0}" == "1" ]]; then
  BUILD_ARCH="universal"
else
  BUILD_ARCH="${MACOS_ARCH:-$(uname -m)}"
fi
PACKAGE_NAME="ESF-Bio-Auth-macOS-$BUILD_ARCH-v$VERSION"
DIST_DIR="$ROOT_DIR/dist"
PACKAGE_DIR="$DIST_DIR/$PACKAGE_NAME"
ZIP_PATH="$DIST_DIR/$PACKAGE_NAME.zip"

if [[ -e "$PACKAGE_DIR" || -e "$ZIP_PATH" ]]; then
  echo "Build output already exists: $PACKAGE_NAME" >&2
  echo "Increase the extension version or remove the generated dist entry manually." >&2
  exit 1
fi

./sdk-bridge/build.sh
MACOS_UNIVERSAL="${MACOS_UNIVERSAL:-0}" ./native-host/build.sh

mkdir -p \
  "$PACKAGE_DIR/extension" \
  "$PACKAGE_DIR/native-host/bin" \
  "$PACKAGE_DIR/sdk-bridge/bin" \
  "$PACKAGE_DIR/sdk-bridge/lib"

rsync -a --exclude='.DS_Store' extension/ "$PACKAGE_DIR/extension/"
ditto native-host/bin/esf-touchid-native-host "$PACKAGE_DIR/native-host/bin/esf-touchid-native-host"
ditto native-host/install-host.sh "$PACKAGE_DIR/native-host/install-host.sh"
ditto sdk-bridge/bin/classes "$PACKAGE_DIR/sdk-bridge/bin/classes"
ditto sdk-bridge/bin/sign-xml "$PACKAGE_DIR/sdk-bridge/bin/sign-xml"
ditto sdk-bridge/bin/sign-raw "$PACKAGE_DIR/sdk-bridge/bin/sign-raw"
ditto sdk-bridge/lib "$PACKAGE_DIR/sdk-bridge/lib"
ditto sdk-bridge/resolve-java.sh "$PACKAGE_DIR/sdk-bridge/resolve-java.sh"
ditto README.md "$PACKAGE_DIR/README.md"
ditto macos/install.sh "$PACKAGE_DIR/install-macos.sh"

chmod +x "$PACKAGE_DIR/install-macos.sh"
chmod +x "$PACKAGE_DIR/native-host/install-host.sh"
chmod +x "$PACKAGE_DIR/sdk-bridge/resolve-java.sh"
chmod +x "$PACKAGE_DIR/sdk-bridge/bin/sign-xml" "$PACKAGE_DIR/sdk-bridge/bin/sign-raw"

ditto -c -k --sequesterRsrc --keepParent "$PACKAGE_DIR" "$ZIP_PATH"

echo "Built: $ZIP_PATH"
echo "Install script: $PACKAGE_DIR/install-macos.sh"
