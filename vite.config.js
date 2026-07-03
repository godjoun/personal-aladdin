import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // .env 파일의 BASE_URL, API_KEY 를 읽어 옵니다.
  // 세 번째 인자 '' = VITE_ 접두사 없이 모든 변수 로드
  const fileEnv = loadEnv(mode, process.cwd(), '')
  const env = {
    BASE_URL: fileEnv.BASE_URL || process.env.BASE_URL || '',
    STOCK_BASE_URL: fileEnv.STOCK_BASE_URL || process.env.STOCK_BASE_URL || '',
    API_KEY: fileEnv.API_KEY || process.env.API_KEY || '',
  }

  return {
    plugins: [react()],

    // define: 로컬 개발용 — 배포(production)에서는 /api/public-data 프록시 사용
    define: {
      __BASE_URL__: JSON.stringify(env.BASE_URL),
      __STOCK_BASE_URL__: JSON.stringify(env.STOCK_BASE_URL),
      __API_KEY__: JSON.stringify(env.API_KEY),
    },
  }
})
