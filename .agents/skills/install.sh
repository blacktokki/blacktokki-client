#!/usr/bin/env bash
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -d "harness-diagnostics" ]; then
  git clone https://github.com/junh0328/harness-diagnostics
else
  echo "harness-diagnostics already exists."
fi
