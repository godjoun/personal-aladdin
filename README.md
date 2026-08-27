# ALADDIN — 개인 투자 대시보드

브라우저에서 보유 자산·거래·배당을 관리합니다.
시세 조회는 Express 서버의 `/api/public-data` 프록시만 사용하며,
`API_KEY` 및 향후 `KIWOOM_*` 인증정보는 서버(`process.env`)에만 둡니다.

## 실행

```bash
# 개발: API 서버 + Vite (시세 갱신에 둘 다 필요)
npm run dev:all

# 또는 터미널 두 개
npm run central   # http://localhost:3001
npm run dev       # Vite ( /api → 3001 프록시 )

# 프로덕션
npm run build
npm start
```

환경 변수는 `.env.example`을 참고해 `.env`를 만드세요. `.env`는 git에 커밋하지 마세요.

Render 배포는 [RENDER_DEPLOY.md](./RENDER_DEPLOY.md)를 따릅니다.
