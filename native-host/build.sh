#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p bin
swiftc Sources/main.swift -o bin/esf-touchid-native-host
chmod +x bin/esf-touchid-native-host
echo "Built native-host/bin/esf-touchid-native-host"
