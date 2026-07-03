/**
 * TradeForm.jsx — 추가 매수·매도 기록
 */

import { useState } from 'react'
import { recordTrade } from '../services/tradeService.js'
import '../styles/TradeForm.css'

const EMPTY_TRADE = {
  assetId: '',
  side: 'buy',
  quantity: '',
  price: '',
  memo: '',
}

function TradeForm({ assets = [], onTradesChange }) {
  const [form, setForm] = useState(EMPTY_TRADE)
  const [error, setError] = useState('')

  function handleChange(event) {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
    setError('')
  }

  function handleSubmit(event) {
    event.preventDefault()

    if (!form.assetId) {
      setError('종목을 선택해 주세요.')
      return
    }

    const quantity = Number(form.quantity)
    const price = Number(form.price)

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError('수량은 0보다 커야 합니다.')
      return
    }

    if (!Number.isFinite(price) || price < 0) {
      setError('단가는 0 이상이어야 합니다.')
      return
    }

    const result = recordTrade({
      assetId: form.assetId,
      side: form.side,
      quantity,
      price,
      memo: form.memo,
    })

    if (!result.success) {
      if (result.reason === 'insufficient_quantity') {
        setError('매도 수량이 보유 수량보다 많습니다.')
      } else {
        setError('거래 기록에 실패했습니다.')
      }
      return
    }

    setForm((prev) => ({
      ...EMPTY_TRADE,
      assetId: prev.assetId,
      side: prev.side,
    }))
    setError('')
    onTradesChange?.()
  }

  if (assets.length === 0) {
    return null
  }

  return (
    <section className="trade-form" aria-label="거래 기록">
      <h3 className="trade-form__title">Transaction Ledger</h3>
      <p className="trade-form__desc">추가 매수·매도를 기록하면 보유 수량·평균매수가가 자동 갱신됩니다.</p>

      <form onSubmit={handleSubmit}>
        <div className="trade-form__grid">
          <div className="trade-form__field trade-form__field--full">
            <label className="trade-form__label" htmlFor="trade-assetId">
              종목
            </label>
            <select
              id="trade-assetId"
              className="trade-form__select"
              name="assetId"
              value={form.assetId}
              onChange={handleChange}
            >
              <option value="">선택...</option>
              {assets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.name} ({asset.symbol}) · {asset.quantity}주
                </option>
              ))}
            </select>
          </div>

          <div className="trade-form__field">
            <label className="trade-form__label">거래 유형</label>
            <div className="trade-form__sides">
              <label className="trade-form__side">
                <input
                  type="radio"
                  name="side"
                  value="buy"
                  checked={form.side === 'buy'}
                  onChange={handleChange}
                />
                매수
              </label>
              <label className="trade-form__side trade-form__side--sell">
                <input
                  type="radio"
                  name="side"
                  value="sell"
                  checked={form.side === 'sell'}
                  onChange={handleChange}
                />
                매도
              </label>
            </div>
          </div>

          <div className="trade-form__field">
            <label className="trade-form__label" htmlFor="trade-quantity">
              수량
            </label>
            <input
              id="trade-quantity"
              className="trade-form__input"
              type="number"
              name="quantity"
              value={form.quantity}
              onChange={handleChange}
              placeholder="예: 5"
              min="0"
              step="any"
            />
          </div>

          <div className="trade-form__field">
            <label className="trade-form__label" htmlFor="trade-price">
              단가 (원)
            </label>
            <input
              id="trade-price"
              className="trade-form__input"
              type="number"
              name="price"
              value={form.price}
              onChange={handleChange}
              placeholder="예: 72000"
              min="0"
              step="1"
            />
          </div>

          <div className="trade-form__field trade-form__field--full">
            <label className="trade-form__label" htmlFor="trade-memo">
              메모
            </label>
            <input
              id="trade-memo"
              className="trade-form__input"
              type="text"
              name="memo"
              value={form.memo}
              onChange={handleChange}
              placeholder="분할 매수, 익절 등 (선택)"
            />
          </div>
        </div>

        {error && <p className="trade-form__error">{error}</p>}

        <div className="trade-form__actions">
          <button type="submit" className="trade-form__submit">
            거래 기록
          </button>
        </div>
      </form>
    </section>
  )
}

export default TradeForm
