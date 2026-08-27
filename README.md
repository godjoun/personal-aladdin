# ALADDIN — 개인 투자 대시보드 (Mac 로컬)

보유 자산·거래·배당을 브라우저에서 관리합니다.  
API Key / Kiwoom credential은 `.env`에만 두고 git에 올리지 마세요.

## 평소 사용 (권장)

**최초 1회**
```bash
chmod +x ALADDIN.command
```

**평소**  
Finder에서 `ALADDIN.command` 더블클릭

**종료**  
실행된 터미널에서 `Ctrl+C`

---

## 터미널로 실행

```bash
npm run aladdin
```

API(3001) + Vite frontend를 함께 띄우고, 준비되면 브라우저를 엽니다.  
이미 실행 중이면 서버를 또 만들지 않고 화면만 엽니다.

개별 실행(개발용):
```bash
npm run central   # API only
npm run dev       # Vite only
npm run auth:setup
npm run briefing:setup   # DART / NAVER API HUB 뉴스 키 (선택)
```

## 참고

- 로컬 DB: `server/data/aladdin.sqlite` (자동 생성)
- 일일 백업: `backups/aladdin-YYYY-MM-DD.sqlite` (하루 1회, 최근 14개)
- 환경 변수: `.env.example` → `.env`
- (선택) 웹 배포: [RENDER_DEPLOY.md](./RENDER_DEPLOY.md)
