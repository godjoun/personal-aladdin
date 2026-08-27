/**
 * DividendForm.jsx — 배당 이벤트 추가/수정 폼
 */

import { useEffect, useState } from 'react'
import {
  addDividendEvent,
  updateDividendEvent,
} from '../services/dividendStorage.js'
import { persistDividendEvents } from '../services/dividendPersistence.js'
import {
  DIVIDEND_STATUSES,
  dividendEventToFormValues,
  validateAndBuildDividendPayload,
} from '../utils/dividendForm.js'
import { getDividendEventAmount } from '../utils/dividendCalculator.js'
import { formatCurrency } from '../utils/formatters.js'
import '../styles/DividendForm.css'

const STATUS_SELECT = [
  { value: 'ESTIMATED', label: '예정' },
  { value: 'CONFIRMED', label: '확정' },
  { value: 'PAID', label: '지급완료' },
]

function DividendForm({
  assets = [],
  initialEvent = null,
  onSaved,
  onCancel,
}) {
  const isEdit = Boolean(initialEvent?.id)
  const [form, setForm] = useState(() => dividendEventToFormValues(initialEvent))
  const [error, setError] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(
    Boolean(initialEvent?.recordDate || initialEvent?.exDate),
  )

  useEffect(() => {
    setForm(dividendEventToFormValues(initialEvent))
    setError('')
    setShowAdvanced(Boolean(initialEvent?.recordDate || initialEvent?.exDate))
  }, [initialEvent])

  function handleChange(event) {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
    setError('')
  }

  function handleAssetSelect(event) {
    const assetId = event.target.value
    if (!assetId) {
      setForm((prev) => ({ ...prev, assetId: '' }))
      return
    }

    const asset = assets.find((item) => item.id === assetId)
    if (!asset) return

    setForm((prev) => ({
      ...prev,
      assetId,
      fundName: asset.name ?? prev.fundName,
      symbol: asset.symbol ?? prev.symbol,
      quantity: asset.quantity ?? prev.quantity,
    }))
    setError('')
  }

  async function handleSubmit(event) {
    event.preventDefault()

    if (initialEvent?.source === 'KIWOOM') {
      setError('키움 자동 배당은 수정할 수 없습니다.')
      return
    }

    const result = validateAndBuildDividendPayload(form)
    if (!result.ok) {
      setError(result.error)
      return
    }

    try {
      let saved
      if (isEdit) {
        saved = updateDividendEvent(initialEvent.id, {
          ...result.payload,
          source: initialEvent.source || 'MANUAL',
        })
      } else {
        saved = addDividendEvent({
          ...result.payload,
          source: 'MANUAL',
        })
      }

      try {
        await persistDividendEvents([saved])
      } catch {
        // local 저장은 성공했으므로 화면은 갱신
      }

      onSaved?.(saved)
    } catch (saveError) {
      setError(saveError.message || '저장에 실패했습니다.')
    }
  }

  const preview = validateAndBuildDividendPayload(form)
  const previewAmount = preview.ok
    ? preview.displayAmount
    : getDividendEventAmount({
        status: DIVIDEND_STATUSES.includes(form.status) ? form.status : 'ESTIMATED',
        quantity: Number(form.quantity) || 0,
        distributionPerShare: Number(form.distributionPerShare) || 0,
        expectedAmount:
          form.expectedAmount === '' ? null : Number(form.expectedAmount),
        confirmedAmount:
          form.confirmedAmount === '' ? null : Number(form.confirmedAmount),
      })

  return (
    <form className="dividend-form" onSubmit={handleSubmit} noValidate>
      <h3 className="dividend-form__title">
        {isEdit ? '배당 수정' : '배당 기록'}
      </h3>

      {assets.length > 0 && (
        <div className="dividend-form__field">
          <label className="dividend-form__label" htmlFor="dividend-assetId">
            보유자산 선택 (선택)
          </label>
          <select
            id="dividend-assetId"
            name="assetId"
            value={form.assetId}
            onChange={handleAssetSelect}
          >
            <option value="">직접 입력</option>
            {assets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.name} ({asset.symbol})
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="dividend-form__grid">
        <div className="dividend-form__field">
          <label className="dividend-form__label" htmlFor="dividend-fundName">
            종목명
          </label>
          <input
            id="dividend-fundName"
            name="fundName"
            value={form.fundName}
            onChange={handleChange}
            required
            autoComplete="off"
          />
        </div>

        <div className="dividend-form__field">
          <label className="dividend-form__label" htmlFor="dividend-symbol">
            종목코드
          </label>
          <input
            id="dividend-symbol"
            name="symbol"
            value={form.symbol}
            onChange={handleChange}
            required
            autoComplete="off"
          />
        </div>

        <div className="dividend-form__field">
          <label className="dividend-form__label" htmlFor="dividend-paymentDate">
            지급일
          </label>
          <input
            id="dividend-paymentDate"
            name="paymentDate"
            type="date"
            value={form.paymentDate}
            onChange={handleChange}
            required
          />
        </div>

        <div className="dividend-form__field">
          <label className="dividend-form__label" htmlFor="dividend-status">
            상태
          </label>
          <select
            id="dividend-status"
            name="status"
            value={form.status}
            onChange={handleChange}
          >
            {STATUS_SELECT.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="dividend-form__field">
          <label className="dividend-form__label" htmlFor="dividend-quantity">
            보유수량
          </label>
          <input
            id="dividend-quantity"
            name="quantity"
            type="number"
            min="0"
            step="any"
            value={form.quantity}
            onChange={handleChange}
            required
          />
        </div>

        <div className="dividend-form__field">
          <label
            className="dividend-form__label"
            htmlFor="dividend-distributionPerShare"
          >
            주당 분배금
          </label>
          <input
            id="dividend-distributionPerShare"
            name="distributionPerShare"
            type="number"
            min="0"
            step="any"
            value={form.distributionPerShare}
            onChange={handleChange}
            required
          />
        </div>

        <div className="dividend-form__field">
          <label
            className="dividend-form__label"
            htmlFor="dividend-expectedAmount"
          >
            예상금액 (선택)
          </label>
          <input
            id="dividend-expectedAmount"
            name="expectedAmount"
            type="number"
            min="0"
            step="any"
            value={form.expectedAmount}
            onChange={handleChange}
          />
        </div>

        <div className="dividend-form__field">
          <label
            className="dividend-form__label"
            htmlFor="dividend-confirmedAmount"
          >
            실제/확정 지급금액 (선택)
          </label>
          <input
            id="dividend-confirmedAmount"
            name="confirmedAmount"
            type="number"
            min="0"
            step="any"
            value={form.confirmedAmount}
            onChange={handleChange}
          />
        </div>

        <div className="dividend-form__field dividend-form__field--full">
          <label className="dividend-form__label" htmlFor="dividend-source">
            출처 (선택)
          </label>
          <input
            id="dividend-source"
            name="source"
            value={form.source}
            onChange={handleChange}
            autoComplete="off"
          />
        </div>
      </div>

      <button
        type="button"
        className="dividend-form__advanced-toggle"
        onClick={() => setShowAdvanced((prev) => !prev)}
        aria-expanded={showAdvanced}
      >
        {showAdvanced ? '추가 정보 숨기기' : '추가 정보'}
      </button>

      {showAdvanced && (
        <div className="dividend-form__grid">
          <div className="dividend-form__field">
            <label className="dividend-form__label" htmlFor="dividend-recordDate">
              기준일 (recordDate)
            </label>
            <input
              id="dividend-recordDate"
              name="recordDate"
              type="date"
              value={form.recordDate}
              onChange={handleChange}
            />
          </div>
          <div className="dividend-form__field">
            <label className="dividend-form__label" htmlFor="dividend-exDate">
              분배락일 (exDate)
            </label>
            <input
              id="dividend-exDate"
              name="exDate"
              type="date"
              value={form.exDate}
              onChange={handleChange}
            />
          </div>
        </div>
      )}

      <p className="dividend-form__preview">
        표시 금액 미리보기: <strong>{formatCurrency(previewAmount || 0)}</strong>
      </p>

      {error && (
        <p className="dividend-form__error" role="alert">
          {error}
        </p>
      )}

      <div className="dividend-form__actions">
        <button type="button" className="dividend-form__cancel" onClick={onCancel}>
          취소
        </button>
        <button type="submit" className="dividend-form__submit">
          {isEdit ? '수정 저장' : '배당 저장'}
        </button>
      </div>
    </form>
  )
}

export default DividendForm
