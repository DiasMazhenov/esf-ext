#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
CERT="${1:-/Users/diasmazhenov/Downloads/esf-sdk-2025/Документация ЭСФ SDK/sdk/localserver/GOSTKNCA_SELLER_NEW.p12}"
PIN="${2:-password}"
XML='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><authSign><timeMark>1699849589660</timeMark><state>test-state</state><iin>123456789011</iin><ttlInMinutes>30</ttlInMinutes></authSign>'

printf '%s' "$XML" | "$ROOT_DIR/bin/sign-xml" "$CERT" "$PIN" | grep -q "Signature"
echo "sign xml ok"
