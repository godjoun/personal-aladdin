import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // .env 파일의 BASE_URL, API_KEY 를 읽어 옵니다.
  // 세 번째 인자 '' = VITE_ 접두사 없이 모든 변수 로드
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],

    // define: 빌드 시 코드 안의 __BASE_URL__ 등을 실제 문자열로 치환합니다.
    // → marketApi.js 에서 import.meta.env 대신 사용 (변수명을 BASE_URL 그대로 쓰기 위함)
    define: {
      __BASE_URL__: JSON.stringify(env.BASE_URL ?? ''),
      __STOCK_BASE_URL__: JSON.stringify(env.STOCK_BASE_URL ?? ''),
      __API_KEY__: JSON.stringify(env.API_KEY ?? ''),
    },
  }
})
