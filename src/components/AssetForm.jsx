/**
 * AssetForm.jsx — 보유 자산 입력 폼
 * ─────────────────────────────────────────────────────────
 * 사용자가 종목·수량·매수가 등을 입력하고
 * assetStorage 를 통해 localStorage 에 저장합니다.
 *
 * 저장 후 Dashboard 가 API 시세와 비교해 평가금액·손익을 계산합니다.
 *
 * @param {Object} props
 * @param {Array<Object>} props.assets - 현재 저장된 자산 목록
 * @param {Function} props.onAssetsChange - 저장/삭제 후 App 이 state 를 갱신할 콜백
 */

import { useState } from 'react'
import { addAssetWithInitialTrade, removeAssetWithTrades } from '../services/tradeService.js'
import { lookupSymbolsByName } from '../services/symbolLookup.js'
import '../styles/AssetForm.css'

/** 자산군 선택 옵션 */
const ASSET_TYPES = ['주식', '채권', '부동산', '현금', '암호화폐', '기타']

/** 폼 초기값 — 제출 후 입력창을 비울 때도 사용 */
const EMPTY_FORM = {
  name: '',
  symbol: '',
  assetType: '주식',
  quantity: '',
  averageBuyPrice: '',
  memo: '',
}

/**
 * 숫자를 원화로 간단히 표시 (목록용)
 */
function formatPrice(value) {
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
    maximumFractionDigits: 0,
  }).format(value)
}

function AssetForm({ assets = [], onAssetsChange, hideList = false }) {
  // form — 현재 입력 중인 값들 (controlled component)
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')
  const [isLookingUp, setIsLookingUp] = useState(false)
  const [lookupCandidates, setLookupCandidates] = useState([])

  /**
   * 종목명으로 API 에서 종목코드를 자동 검색합니다.
   * (주식·ETF 시세 API 의 likeItmsNm 사용)
   */
  async function handleLookupSymbol() {
    if (!form.name.trim()) {
      setError('먼저 종목명을 입력해 주세요.')
      return
    }

    setIsLookingUp(true)
    setError('')
    setLookupCandidates([])

    try {
      const candidates = await lookupSymbolsByName(form.name, form.assetType)

      if (candidates.length === 0) {
        setError('검색 결과가 없습니다. 종목명을 확인하거나 종목코드를 직접 입력해 주세요.')
        return
      }

      if (candidates.length === 1) {
        setForm((prev) => ({
          ...prev,
          symbol: candidates[0].symbol,
          name: candidates[0].name || prev.name,
        }))
        return
      }

      // 여러 건이면 사용자가 고를 수 있게 목록 표시
      setLookupCandidates(candidates)
    } catch (lookupError) {
      console.error('[AssetForm] 종목코드 검색 실패:', lookupError)
      setError('종목코드 검색에 실패했습니다. .env 의 API_KEY 를 확인해 주세요.')
    } finally {
      setIsLookingUp(false)
    }
  }

  /** 검색 결과 목록에서 한 종목을 선택 */
  function handleSelectCandidate(candidate) {
    setForm((prev) => ({
      ...prev,
      symbol: candidate.symbol,
      name: candidate.name || prev.name,
    }))
    setLookupCandidates([])
  }

  /**
   * input / select / textarea 변경 시 form state 업데이트
   * name 속성으로 어떤 필드인지 구분합니다.
   */
  function handleChange(event) {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
    setError('')
  }

  /**
   * 폼 제출 — addAsset() 호출 후 부모(App)에 알림
   */
  function handleSubmit(event) {
    event.preventDefault()

    // 필수 항목 검사
    if (!form.name.trim()) {
      setError('종목명을 입력해 주세요.')
      return
    }
    if (!form.symbol.trim()) {
      setError('종목코드를 입력해 주세요.')
      return
    }

    const quantity = Number(form.quantity)
    const averageBuyPrice = Number(form.averageBuyPrice)

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError('보유 수량은 0보다 큰 숫자여야 합니다.')
      return
    }
    if (!Number.isFinite(averageBuyPrice) || averageBuyPrice < 0) {
      setError('평균 매수가는 0 이상의 숫자여야 합니다.')
      return
    }

    // 자산 + 최초 매수 거래 기록
    addAssetWithInitialTrade({
      name: form.name.trim(),
      symbol: form.symbol.trim(),
      assetType: form.assetType,
      quantity,
      averageBuyPrice,
      memo: form.memo.trim(),
    })

    // 입력창 초기화 + App 의 assets state 갱신
    setForm(EMPTY_FORM)
    setError('')
    onAssetsChange()
  }

  /**
   * 자산 삭제 버튼 클릭
   */
  function handleDelete(id) {
    removeAssetWithTrades(id)
    onAssetsChange()
  }

  return (
    <section className="asset-form" aria-label="보유 자산 입력">
      <h2 className="asset-form__title">자산 등록 터미널</h2>
      <p className="asset-form__desc">
        종목명 · 코드 · 수량 · 매수가 입력 → 저장 후 Portfolio Holdings 에 반영
      </p>

      <form onSubmit={handleSubmit}>
        <div className="asset-form__grid">
          {/* 종목명 */}
          <div className="asset-form__field">
            <label className="asset-form__label asset-form__label--required" htmlFor="name">
              종목명
            </label>
            <input
              id="name"
              className="asset-form__input"
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="예: 삼성전자"
            />
          </div>

          {/* 종목코드 + 자동 찾기 */}
          <div className="asset-form__field">
            <label className="asset-form__label asset-form__label--required" htmlFor="symbol">
              종목코드
            </label>
            <div className="asset-form__symbol-row">
              <input
                id="symbol"
                className="asset-form__input"
                type="text"
                name="symbol"
                value={form.symbol}
                onChange={handleChange}
                placeholder="예: 005930"
              />
              <button
                type="button"
                className="asset-form__lookup-btn"
                onClick={handleLookupSymbol}
                disabled={isLookingUp}
              >
                {isLookingUp ? '검색 중...' : '코드 자동 찾기'}
              </button>
            </div>
            <p className="asset-form__hint">종목명 입력 후 「코드 자동 찾기」를 누르세요.</p>
          </div>

          {lookupCandidates.length > 0 && (
            <div className="asset-form__field asset-form__field--full">
              <p className="asset-form__hint">검색 결과가 여러 개입니다. 선택해 주세요.</p>
              <ul className="asset-form__candidates">
                {lookupCandidates.map((candidate) => (
                  <li key={candidate.symbol}>
                    <button
                      type="button"
                      className="asset-form__candidate-btn"
                      onClick={() => handleSelectCandidate(candidate)}
                    >
                      {candidate.name} ({candidate.symbol})
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 자산군 */}
          <div className="asset-form__field">
            <label className="asset-form__label" htmlFor="assetType">
              자산군
            </label>
            <select
              id="assetType"
              className="asset-form__select"
              name="assetType"
              value={form.assetType}
              onChange={handleChange}
            >
              {ASSET_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          {/* 보유 수량 */}
          <div className="asset-form__field">
            <label className="asset-form__label asset-form__label--required" htmlFor="quantity">
              보유 수량
            </label>
            <input
              id="quantity"
              className="asset-form__input"
              type="number"
              name="quantity"
              value={form.quantity}
              onChange={handleChange}
              placeholder="예: 10"
              min="0"
              step="any"
            />
          </div>

          {/* 평균 매수가 */}
          <div className="asset-form__field">
            <label
              className="asset-form__label asset-form__label--required"
              htmlFor="averageBuyPrice"
            >
              평균 매수가 (원)
            </label>
            <input
              id="averageBuyPrice"
              className="asset-form__input"
              type="number"
              name="averageBuyPrice"
              value={form.averageBuyPrice}
              onChange={handleChange}
              placeholder="예: 70000"
              min="0"
              step="1"
            />
          </div>

          {/* 메모 — 전체 너비 */}
          <div className="asset-form__field asset-form__field--full">
            <label className="asset-form__label" htmlFor="memo">
              메모
            </label>
            <textarea
              id="memo"
              className="asset-form__textarea"
              name="memo"
              value={form.memo}
              onChange={handleChange}
              placeholder="장기 보유, 배당주 등 메모 (선택)"
            />
          </div>
        </div>

        {error && <p className="asset-form__error">{error}</p>}

        <div className="asset-form__actions">
          <button type="submit" className="asset-form__submit">
            자산 저장
          </button>
        </div>
      </form>

      {/* 저장된 자산 목록 — hideList 이면 Dashboard 테이블에서 표시 */}
      {!hideList && (
      <div className="asset-form__list">
        <h3 className="asset-form__list-title">
          저장된 자산 ({assets.length}건)
        </h3>

        {assets.length === 0 ? (
          <p className="asset-form__list-empty">아직 등록된 자산이 없습니다.</p>
        ) : (
          assets.map((asset) => (
            <div key={asset.id} className="asset-form__item">
              <div className="asset-form__item-info">
                <p className="asset-form__item-name">
                  {asset.name}{' '}
                  <span className="asset-form__item-symbol">({asset.symbol})</span>
                </p>
                <p className="asset-form__item-meta">
                  {asset.assetType} · {asset.quantity}주 · 평균매수가{' '}
                  {formatPrice(asset.averageBuyPrice)}
                  {asset.memo && ` · ${asset.memo}`}
                </p>
              </div>
              <button
                type="button"
                className="asset-form__delete"
                onClick={() => handleDelete(asset.id)}
                aria-label={`${asset.name} 삭제`}
              >
                삭제
              </button>
            </div>
          ))
        )}
      </div>
      )}
    </section>
  )
}

export default AssetForm
