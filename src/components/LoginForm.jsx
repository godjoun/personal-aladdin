/**
 * LoginForm.jsx — 단일 사용자 로그인
 */

import { useState } from 'react'
import { login } from '../services/authApi.js'
import '../styles/LoginForm.css'

function LoginForm({ onSuccess }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await login(username, password)
      if (!result.ok) {
        setError(
          result.message ||
            (result.status === 429
              ? '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.'
              : '아이디 또는 비밀번호를 확인해주세요.'),
        )
        return
      }
      onSuccess?.(result)
    } catch {
      setError('로그인에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit} autoComplete="off">
        <h1 className="login-card__brand">ALADDIN</h1>
        <p className="login-card__hint">개인용 투자 기록 · 로그인 필요</p>
        <label className="login-card__label" htmlFor="login-username">
          Username
        </label>
        <input
          id="login-username"
          className="login-card__input"
          name="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          maxLength={64}
        />
        <label className="login-card__label" htmlFor="login-password">
          Password
        </label>
        <input
          id="login-password"
          className="login-card__input"
          name="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          maxLength={256}
        />
        {error && <p className="login-card__error">{error}</p>}
        <button className="login-card__submit" type="submit" disabled={loading}>
          {loading ? '확인 중…' : '로그인'}
        </button>
      </form>
    </div>
  )
}

export default LoginForm
