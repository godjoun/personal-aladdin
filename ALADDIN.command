#!/bin/bash
# ALADDIN.command — Mac 더블클릭 실행기 (credential 없음)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

echo "========================================"
echo " ALADDIN — 개인 투자 대시보드"
echo "========================================"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "[오류] Node.js가 없습니다. https://nodejs.org 에서 설치 후 다시 실행하세요."
  read -r -p "Enter 키를 누르면 종료합니다… " _
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "[오류] npm이 없습니다. Node.js 설치를 확인하세요."
  read -r -p "Enter 키를 누르면 종료합니다… " _
  exit 1
fi

if [ ! -f "$ROOT/.env" ]; then
  echo "[오류] .env 파일이 없습니다."
  echo "1) .env.example 을 복사해 .env 를 만드세요."
  echo "2) npm run auth:setup 으로 로그인을 설정하세요."
  read -r -p "Enter 키를 누르면 종료합니다… " _
  exit 1
fi

if [ ! -d "$ROOT/node_modules" ]; then
  echo "[안내] 의존성 설치 중 (최초 1회)…"
  npm install
fi

echo "[안내] ALADDIN을 시작합니다. 종료는 이 창에서 Ctrl+C 입니다."
echo ""

set +e
npm run aladdin
EXIT_CODE=$?
set -e

# 정상 종료 / Ctrl+C / SIGTERM
if [ "$EXIT_CODE" -eq 0 ] || [ "$EXIT_CODE" -eq 130 ] || [ "$EXIT_CODE" -eq 143 ]; then
  exit 0
fi

echo ""
echo "[오류] ALADDIN 실행에 실패했습니다. (code=$EXIT_CODE)"
read -r -p "Enter 키를 누르면 종료합니다… " _
exit "$EXIT_CODE"
