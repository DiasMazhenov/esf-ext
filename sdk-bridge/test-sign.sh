#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <certificate-path> <certificate-pin>" >&2
  exit 2
fi
CERT="$1"
PIN="$2"
XML='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><authSign><timeMark>1699849589660</timeMark><state>test-state</state><iin>123456789011</iin><ttlInMinutes>30</ttlInMinutes></authSign>'

printf '%s' "$XML" | ESF_CERT_PIN="$PIN" "$ROOT_DIR/bin/sign-xml" "$CERT" | grep -q "Signature"
echo "sign xml ok"
