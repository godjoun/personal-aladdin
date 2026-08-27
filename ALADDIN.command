#!/bin/bash
# ALADDIN.command — Mac 더블클릭: 서버 확인/기동 후 브라우저 오픈
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

APP_URL="http://127.0.0.1:3001"
HEALTH_URL="${APP_URL}/api/health"

health_ok() {
  local body
  body="$(curl -fsS --max-time 2 "$HEALTH_URL" 2>/dev/null || true)"
  echo "$body" | grep -q '"ok":true'
}

open_app() {
  open "$APP_URL"
}

if health_ok; then
  open_app
  exit 0
fi

# LaunchAgent 우선
if command -v launchctl >/dev/null 2>&1; then
  LABEL="com.personal-aladdin.server"
  PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
  DOMAIN="gui/$(id -u)"
  if [ -f "$PLIST" ]; then
    launchctl kickstart -k "${DOMAIN}/${LABEL}" >/dev/null 2>&1 || \
      launchctl bootstrap "$DOMAIN" "$PLIST" >/dev/null 2>&1 || true
  fi
fi

# 여전히 down 이면 Node runner 를 백그라운드로
if ! health_ok; then
  if ! command -v node >/dev/null 2>&1; then
    osascript -e 'display alert "ALADDIN" message "Node.js 가 필요합니다."' >/dev/null 2>&1 || true
    exit 1
  fi
  if [ ! -f "$ROOT/.env" ]; then
    osascript -e 'display alert "ALADDIN" message ".env 파일이 없습니다. auth:setup 을 먼저 해주세요."' >/dev/null 2>&1 || true
    exit 1
  fi
  if [ ! -d "$ROOT/dist" ] || [ ! -f "$ROOT/dist/index.html" ]; then
    npm run build >/dev/null 2>&1 || true
  fi
  nohup node "$ROOT/scripts/run-local-server.js" >/dev/null 2>&1 &
  disown || true
fi

for _ in $(seq 1 60); do
  if health_ok; then
    open_app
    exit 0
  fi
  sleep 0.5
done

osascript -e 'display alert "ALADDIN" message "서버를 시작하지 못했습니다. 터미널에서 npm run local:install 을 실행하세요."' >/dev/null 2>&1 || true
exit 1
