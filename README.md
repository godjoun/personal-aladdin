# ALADDIN — 개인 투자 대시보드 (Mac 로컬)

보유 자산·거래·배당을 브라우저에서 관리합니다.  
API Key / Kiwoom credential은 `.env`에만 두고 git에 올리지 마세요.

## 평소 사용 (권장) — Cursor 없이

주소: **http://127.0.0.1:3001**  
(Express가 API + `dist` React를 함께 제공합니다. Vite 불필요)

**최초 1회**
```bash
npm run local:install
chmod +x ALADDIN.command
```

- `local:install`: `npm run build` + macOS LaunchAgent 설치 (로그인 시 자동 기동)
- Credential은 `.env`만 사용 (plist에 키를 넣지 않음)
- 서버는 **127.0.0.1** 에만 bind (LAN 비노출)

**평소**  
Finder에서 `ALADDIN.command` 더블클릭 → 서버가 켜져 있으면 브라우저만 열고, 꺼져 있으면 LaunchAgent/백그라운드로 기동합니다.

**상태 / 제거**
```bash
npm run local:status
npm run local:uninstall
```

---

## 개발용 (Cursor/터미널)

```bash
npm run central   # API only (기본 127.0.0.1:3001, dist 미제공)
npm run dev       # Vite only (:5173, /api 프록시)
npm run dev:all
npm run aladdin   # health 확인 후 http://127.0.0.1:3001 오픈 (필요 시 서버 기동)
npm run auth:setup
npm run briefing:setup   # DART / NAVER API HUB 뉴스 키 (선택)
```

---

## 참고

- 로컬 DB: `server/data/aladdin.sqlite` (자동 생성)
- 일일 백업: `backups/aladdin-YYYY-MM-DD.sqlite` (하루 1회, 최근 14개)
- 로그: `logs/` (크기 제한, gitignore)
- 환경 변수: `.env.example` → `.env`
- (선택) 웹 배포 메모: [RENDER_DEPLOY.md](./RENDER_DEPLOY.md) — 평소 로컬 사용과는 무관
