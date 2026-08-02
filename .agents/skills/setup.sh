#!/usr/bin/env bash
set -eo pipefail

echo "🤖 AI 에이전트 스킬 설치를 시작합니다..."

npx --yes skills add junh0328/harness-diagnostics -y
npx --yes skills add skillrecordings/adr-skill -y

echo "✅ 모든 스킬 설치가 완료되었습니다!"
