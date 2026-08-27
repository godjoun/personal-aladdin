/**
 * AssetForm.jsx — 보유 자산 입력 폼
 * ─────────────────────────────────────────────────────────
 * 종목명 입력 시 서버 종목 검색(autocomplete)으로 코드 자동 채움.
 * 검색 실패 시에도 수동 입력으로 저장 가능합니다.
 */

import { useEffect, useId, useRef, useState } from 'react'
import { addAssetWithInitialTrade, removeAssetWithTrades } from '../services/tradeService.js'
import { searchStocks } from '../services/symbolLookup.js'
import '../styles/AssetForm.css'

const ASSET_TYPES = ['주식', '채권', '부동산', '현금', '암호화폐', '기타']

const EMPTY_FORM = {
  name: '',
  symbol: '',
  assetType: '주식',
  quantity: '',
  averageBuyPrice: '',
  memo: '',
}

const SEARCH_DEBOUNCE_MS = 250
const MIN_QUERY_LENGTH = 1

function formatPrice(value) {
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
    maximumFractionDigits: 0,
  }).format(value)
}

function AssetForm({ assets = [], onAssetsChange, onAssetAdded, hideList = false }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchFailed, setSearchFailed] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [emptyResult, setEmptyResult] = useState(false)

  const listboxId = useId()
  const searchSeq = useRef(0)
  const blurTimer = useRef(null)
  const nameFieldRef = useRef(null)

  useEffect(() => {
    const query = form.name.trim()

    if (query.length < MIN_QUERY_LENGTH) {
      setSuggestions([])
      setEmptyResult(false)
      setIsSearching(false)
      setSearchFailed(false)
      setActiveIndex(-1)
      return undefined
    }

    const seq = ++searchSeq.current
    setIsSearching(true)
    setSearchFailed(false)

    const timer = setTimeout(async () => {
      try {
        const results = await searchStocks(query, { assetType: form.assetType })
        if (seq !== searchSeq.current) return

        setSuggestions(results)
        setEmptyResult(results.length === 0)
        setSearchOpen(true)
        setActiveIndex(results.length > 0 ? 0 : -1)
      } catch {
        if (seq !== searchSeq.current) return
        setSuggestions([])
        setEmptyResult(false)
        setSearchFailed(true)
        setSearchOpen(true)
        setActiveIndex(-1)
      } finally {
        if (seq === searchSeq.current) {
          setIsSearching(false)
        }
      }
    }, SEARCH_DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [form.name, form.assetType])

  useEffect(() => {
    return () => {
      if (blurTimer.current) {
        clearTimeout(blurTimer.current)
      }
    }
  }, [])

  function handleSelectCandidate(candidate) {
    setForm((prev) => ({
      ...prev,
      symbol: candidate.symbol,
      name: candidate.name || prev.name,
    }))
    setSuggestions([])
    setSearchOpen(false)
    setEmptyResult(false)
    setActiveIndex(-1)
    setError('')
  }

  function handleChange(event) {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
    setError('')

    if (name === 'name') {
      setSearchOpen(true)
    }
  }

  function handleNameKeyDown(event) {
    if (!searchOpen) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (suggestions.length === 0) return
      setActiveIndex((prev) => (prev + 1) % suggestions.length)
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (suggestions.length === 0) return
      setActiveIndex((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1))
      return
    }

    if (event.key === 'Enter' && activeIndex >= 0 && suggestions[activeIndex]) {
      event.preventDefault()
      handleSelectCandidate(suggestions[activeIndex])
      return
    }

    if (event.key === 'Escape') {
      setSearchOpen(false)
      setActiveIndex(-1)
    }
  }

  function handleNameBlur() {
    blurTimer.current = setTimeout(() => {
      setSearchOpen(false)
    }, 150)
  }

  function handleNameFocus() {
    if (blurTimer.current) {
      clearTimeout(blurTimer.current)
    }
    if (form.name.trim().length >= MIN_QUERY_LENGTH) {
      setSearchOpen(true)
    }
  }

  function handleSubmit(event) {
    event.preventDefault()

    if (!form.name.trim()) {
      setError('종목명을 입력해 주세요.')
      return
    }
    if (!form.symbol.trim()) {
      setError('종목코드를 입력해 주세요. 검색 목록에서 선택하거나 직접 입력할 수 있습니다.')
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

    addAssetWithInitialTrade({
      name: form.name.trim(),
      symbol: form.symbol.trim(),
      assetType: form.assetType,
      quantity,
      averageBuyPrice,
      memo: form.memo.trim(),
    })

    setForm(EMPTY_FORM)
    setSuggestions([])
    setSearchOpen(false)
    setError('')
    if (onAssetAdded) {
      onAssetAdded()
    } else {
      onAssetsChange()
    }
  }

  function handleDelete(id) {
    removeAssetWithTrades(id)
    onAssetsChange()
  }

  return (
    <section className="asset-form" aria-label="보유 자산 입력">
      <h2 className="asset-form__title">자산 등록</h2>
      <p className="asset-form__desc">
        종목명을 입력하면 검색 결과가 나타납니다. 선택하면 종목코드가 자동으로 채워집니다.
      </p>

      <form onSubmit={handleSubmit}>
        <div className="asset-form__grid">
          <div className="asset-form__field asset-form__field--autocomplete">
            <label className="asset-form__label asset-form__label--required" htmlFor="name">
              종목명
            </label>
            <input
              id="name"
              ref={nameFieldRef}
              className="asset-form__input"
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              onKeyDown={handleNameKeyDown}
              onBlur={handleNameBlur}
              onFocus={handleNameFocus}
              placeholder="예: 성일, TIGER 미국"
              autoComplete="off"
              role="combobox"
              aria-expanded={searchOpen}
              aria-controls={listboxId}
              aria-autocomplete="list"
              aria-activedescendant={
                activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined
              }
            />

            {searchOpen && form.name.trim().length >= MIN_QUERY_LENGTH && (
              <div className="asset-form__suggest" id={listboxId} role="listbox">
                {isSearching && (
                  <p className="asset-form__suggest-status">검색 중…</p>
                )}
                {!isSearching && searchFailed && (
                  <p className="asset-form__suggest-status">
                    검색에 실패했습니다. 종목코드는 직접 입력할 수 있습니다.
                  </p>
                )}
                {!isSearching && !searchFailed && emptyResult && (
                  <p className="asset-form__suggest-status">검색 결과 없음</p>
                )}
                {!isSearching &&
                  suggestions.map((candidate, index) => (
                    <button
                      key={candidate.symbol}
                      id={`${listboxId}-option-${index}`}
                      type="button"
                      role="option"
                      aria-selected={index === activeIndex}
                      className={`asset-form__suggest-item${
                        index === activeIndex ? ' asset-form__suggest-item--active' : ''
                      }`}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => handleSelectCandidate(candidate)}
                    >
                      <span className="asset-form__suggest-name">{candidate.name}</span>
                      <span className="asset-form__suggest-symbol">{candidate.symbol}</span>
                    </button>
                  ))}
              </div>
            )}
          </div>

          <div className="asset-form__field">
            <label className="asset-form__label asset-form__label--required" htmlFor="symbol">
              종목코드
            </label>
            <input
              id="symbol"
              className="asset-form__input"
              type="text"
              name="symbol"
              value={form.symbol}
              onChange={handleChange}
              placeholder="검색 선택 또는 직접 입력"
            />
            <p className="asset-form__hint">검색이 안 되면 코드를 직접 입력해도 됩니다.</p>
          </div>

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

      {!hideList && (
        <div className="asset-form__list">
          <h3 className="asset-form__list-title">저장된 자산 ({assets.length}건)</h3>

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
