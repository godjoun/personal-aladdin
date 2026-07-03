/**
 * main.jsx — React 앱의 진입점(Entry Point)
 * ─────────────────────────────────────────────────────────
 * 브라우저가 index.html 을 열면, 이 파일이 가장 먼저 실행됩니다.
 *
 * 하는 일:
 *   1. 전역 CSS(index.css) 불러오기
 *   2. App 컴포넌트를 HTML의 #root 요소에 연결(렌더링)
 *   3. StrictMode 로 개발 중 잠재적 문제를 조기에 발견
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// index.html 의 <div id="root"> 를 찾아 React 앱을 붙입니다.
createRoot(document.getElementById('root')).render(
  // StrictMode: 개발 모드에서 이중 렌더 등으로 버그를 잡는 데 도움을 줍니다.
  <StrictMode>
    <App />
  </StrictMode>,
)
