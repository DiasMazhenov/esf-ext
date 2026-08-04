#!/usr/bin/env bash
set -euo pipefail

PACKAGE_DIR="$(cd "$(dirname "$0")" && pwd)"
EXTENSION_ID="${1:-bjokedaeolojcgaaanfhpofelnfgkebk}"
INSTALL_DIR="${ESF_BIO_INSTALL_DIR:-$HOME/Library/Application Support/ESF Bio Auth}"

for required in extension native-host sdk-bridge; do
  if [[ ! -d "$PACKAGE_DIR/$required" ]]; then
    echo "Missing package directory: $required" >&2
    exit 1
  fi
done

mkdir -p "$INSTALL_DIR/extension" "$INSTALL_DIR/native-host" "$INSTALL_DIR/sdk-bridge"
ditto "$PACKAGE_DIR/extension" "$INSTALL_DIR/extension"
ditto "$PACKAGE_DIR/native-host" "$INSTALL_DIR/native-host"
ditto "$PACKAGE_DIR/sdk-bridge" "$INSTALL_DIR/sdk-bridge"

chmod +x "$INSTALL_DIR/native-host/bin/esf-touchid-native-host"
chmod +x "$INSTALL_DIR/native-host/install-host.sh"
chmod +x "$INSTALL_DIR/sdk-bridge/resolve-java.sh"
chmod +x "$INSTALL_DIR/sdk-bridge/bin/sign-xml" "$INSTALL_DIR/sdk-bridge/bin/sign-raw"

HOST_MANIFEST="$($INSTALL_DIR/native-host/install-host.sh "$EXTENSION_ID")"

echo "ESF Bio Auth installed to: $INSTALL_DIR"
echo "Native host manifest: $HOST_MANIFEST"
echo "Load unpacked extension in Chrome from: $INSTALL_DIR/extension"
if ! "$INSTALL_DIR/sdk-bridge/resolve-java.sh" >/dev/null 2>&1; then
  echo "Warning: OpenJDK 21 is not installed. Install it before biometric signing: brew install openjdk@21" >&2
fi
