#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p bin

SWIFTC="${SWIFTC:-$(command -v swiftc)}"
MODULE_CACHE_ROOT="${SWIFT_MODULE_CACHE_ROOT:-${TMPDIR:-/tmp}/esf-swift-module-cache}"
MIN_MACOS="${MACOS_MIN_VERSION:-12.0}"

build_target() {
  local arch="$1"
  local output="$2"
  mkdir -p "$MODULE_CACHE_ROOT/$arch"
  "$SWIFTC" \
    -module-cache-path "$MODULE_CACHE_ROOT/$arch" \
    -target "$arch-apple-macosx$MIN_MACOS" \
    Sources/main.swift \
    -o "$output"
}

if [[ "${MACOS_UNIVERSAL:-0}" == "1" ]]; then
  build_target arm64 bin/esf-touchid-native-host-arm64
  build_target x86_64 bin/esf-touchid-native-host-x86_64
  lipo -create \
    bin/esf-touchid-native-host-arm64 \
    bin/esf-touchid-native-host-x86_64 \
    -output bin/esf-touchid-native-host
  rm -f bin/esf-touchid-native-host-arm64 bin/esf-touchid-native-host-x86_64
else
  ARCH="${MACOS_ARCH:-$(uname -m)}"
  case "$ARCH" in
    arm64|x86_64) ;;
    *) echo "Unsupported macOS architecture: $ARCH" >&2; exit 1 ;;
  esac
  build_target "$ARCH" bin/esf-touchid-native-host
fi

chmod +x bin/esf-touchid-native-host
echo "Built native-host/bin/esf-touchid-native-host"
