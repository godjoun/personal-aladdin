# ALADDIN — Render 배포 가이드 (초보자용)

아직 이 문서만으로는 배포가 끝나지 않습니다.
아래를 **직접** Dashboard에서 수행하세요.
실제 비밀번호·hash·API key·secret 값은 이 문서에 적지 마세요.

## 사전 준비 (로컬)

1. `npm run auth:setup` 으로 로그인 3키 준비  
   (`ALADDIN_ADMIN_USERNAME`, `ALADDIN_ADMIN_PASSWORD_HASH`, `ALADDIN_SESSION_SECRET`)
2. Kiwoom / 공공데이터 키를 `.env`에 두고, Render에는 **이름만 같은** 값으로 등록
3. `npm run build` 가 로컬에서 성공하는지 확인

## Render 설정 순서

### 1. GitHub repo 연결
GitHub에 이 저장소를 push한 뒤 Render 계정과 연결합니다.  
(지금은 commit/push 전이면, push 이후에 진행)

### 2. New → Web Service
- **Language / Runtime:** Node
- **Node version:** `24` (package.json `engines` / `.nvmrc` 와 맞춤)
- 서비스 **1개**만 만듭니다 (Frontend 별도 Static Site 만들지 않음)

### 3. Build Command
```text
npm ci && npm run build
```

### 4. Start Command
```text
npm start
```

### 5. Health Check Path
```text
/api/health
```
응답은 `{"ok":true}` 만 와야 합니다.

### 6. Persistent Disk 추가
- Free plan에는 disk가 **없습니다**. **Starter 이상** 필요
- Disk 이름 예: `aladdin-data`
- **Mount path:** `/var/data`
- Size: 최소 1 GB

### 7. 환경변수 (값은 Dashboard에만 입력)

| 이름 | 비고 |
|------|------|
| `NODE_ENV` | `production` |
| `ALADDIN_ADMIN_USERNAME` | auth:setup 결과 |
| `ALADDIN_ADMIN_PASSWORD_HASH` | auth:setup 결과 (평문 비밀번호 금지) |
| `ALADDIN_SESSION_SECRET` | auth:setup 결과 (충분히 긴 값) |
| `ALADDIN_DB_PATH` | `/var/data/aladdin.sqlite` |
| `ALADDIN_BACKUP_DIR` | `/var/data/backups` (선택) |
| `ALADDIN_TRUST_PROXY` | `1` (Render HTTPS reverse proxy) |
| `KIWOOM_ISA_APP_KEY` | 서버 전용 |
| `KIWOOM_ISA_APP_SECRET` | 서버 전용 |
| `KIWOOM_GENERAL_APP_KEY` | 서버 전용 |
| `KIWOOM_GENERAL_APP_SECRET` | 서버 전용 |
| `BASE_URL` | 공공데이터 ETF URL |
| `STOCK_BASE_URL` | 공공데이터 주식 URL |
| `API_KEY` | 공공데이터 키 |

**등록하지 말 것**
- `PORT` (Render가 자동 제공)
- `VITE_*` 로 secret 넣기
- `ALADDIN_ALLOWED_ORIGIN` (production same-origin이면 불필요)

선택: repo 루트 `render.yaml` Blueprint로 동일 구성을 가져올 수 있습니다.
Blueprint를 써도 secret(`sync: false`)은 Dashboard에서 직접 입력합니다.

### 8. 배포
Deploy 실행 → 로그에 `ALADDIN API running on port …` / Production mode 확인

### 9. 로그인 확인
브라우저에서 `https://<서비스>.onrender.com`  
미로그인 → 로그인 화면 → 로그인 성공 → Dashboard

### 10. Kiwoom 조회 확인
로그인 후 잔고/배당 조회가 동작하는지 확인 (조회 전용)

### 11. DB 유지 확인
Render에서 서비스 Restart 후, 이전에 저장한 배당·수동 기록이 그대로인지 확인  
(`/var/data` disk 밖 경로는 재시작 시 사라질 수 있음)

---

## 배포 후 검증 체크리스트

- [ ] HTTPS 접속
- [ ] 미로그인 Dashboard 접근 불가
- [ ] 로그인 성공
- [ ] ISA 종목 조회
- [ ] 일반계좌 종목 조회
- [ ] 실제 배당 기록 조회
- [ ] SQLite 기록 표시
- [ ] 서버 재시작 후 SQLite 기록 유지
- [ ] 로그아웃 후 API 401
- [ ] `/api/health`는 `{"ok":true}` 만 반환
- [ ] secret 노출 없음 (페이지 소스·Network·JS 번들)

## 참고

- production은 Express가 `dist/` 를 same-origin으로 제공합니다.
- `ALADDIN_TRUST_PROXY=1` 일 때만 `trust proxy` 1홉을 켭니다.
- production Secure cookie는 HTTPS에서만 브라우저에 저장됩니다.  
  로컬에서 `npm start`(HTTP)로 모사하면 Secure cookie 때문에 로그인이 안 될 수 있으며, 이는 Render HTTPS와 다른 조건입니다.
- better-sqlite3는 `npm ci` 시 네이티브 빌드가 필요합니다. Render Node 빌드 환경에서 수행됩니다.
