import { useEffect, useState } from 'react'
import {
  createStrategyCheck,
  createStrategyShadowTrade,
} from '../../services/tradingLabApi.js'
import {
  NO_DATA_LABEL,
  STRATEGY_CHECK_DISCLAIMER,
  STRATEGY_LOCATION_TAGS,
  STRATEGY_RISK_TAGS,
  STRATEGY_SCORE_LABEL,
  formatSignedCompactUsd,
  formatStrategyCategoryScore,
  formatStrategyScore,
  formatVolumeRatio,
  getShadowTagLabel,
  getStrategyCheckResultLabel,
  getStructureLabel,
  STRATEGY_RECORD_HINT,
  STRATEGY_PANEL_TITLE,
  getStrategyActionLabel,
  getStrategyDisplayResult,
  getStrategyPrimaryIssue,
  getStrategyReviewLabel,
  getShadowRecordTypeLabel,
} from '../../utils/tradingLabView.js'

/**
 * 내 진입 기준 — 진입 기준 점검. 추천/실제 주문이 아니다.
 */
export default function StrategyChecklistPanel({
  symbol,
  onShadowRecorded,
  onCheckChange,
}) {
  const [direction, setDirection] = useState(null)
  const [selectedTags, setSelectedTags] = useState([])
  const [check, setCheck] = useState(null)
  const [busy, setBusy] = useState(false)
  const [recording, setRecording] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    setCheck(null)
    setDirection(null)
    setMessage('')
    setError('')
    onCheckChange?.(null)
  }, [symbol, onCheckChange])

  function toggleTag(tag) {
    setSelectedTags((current) =>
      current.includes(tag)
        ? current.filter((item) => item !== tag)
        : [...current, tag],
    )
  }

  async function runCheck(nextDirection, nextTags = selectedTags) {
    const chosen = nextDirection || direction
    if (!chosen) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const payload = await createStrategyCheck({
        symbol,
        direction: chosen,
        selectedTags: nextTags,
      })
      setCheck(payload.check)
      setDirection(chosen)
      onCheckChange?.(payload.check)
    } catch (err) {
      setError(err.message || '기준 점검에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDirection(nextDirection) {
    setDirection(nextDirection)
    await runCheck(nextDirection, selectedTags)
  }

  async function handleTag(tag) {
    const nextTags = selectedTags.includes(tag)
      ? selectedTags.filter((item) => item !== tag)
      : [...selectedTags, tag]
    toggleTag(tag)
    if (direction) {
      await runCheck(direction, nextTags)
    }
  }

  async function handleRecord() {
    if (!check?.id || recording) return
    setRecording(true)
    setError('')
    try {
      const payload = await createStrategyShadowTrade(check.id)
      setCheck(payload.check)
      onCheckChange?.(payload.check)
      setMessage(
        payload.trade.direction === 'SHORT'
          ? '이 기준으로 가상 SHORT 기록 완료'
          : '이 기준으로 가상 LONG 기록 완료',
      )
      onShadowRecorded?.(payload.trade)
    } catch (err) {
      setError(err.message || '가상 기록에 실패했습니다.')
    } finally {
      setRecording(false)
    }
  }

  const displayResult = getStrategyDisplayResult(check)
  const resultModifier =
    displayResult === 'READY'
      ? 'ready'
      : displayResult === 'RISK_HIGH'
        ? 'risk'
        : check
          ? 'not-ready'
          : ''
  const evidence = check?.autoEvidence || {}
  const primaryIssue = getStrategyPrimaryIssue(check)
  const actionLabel = getStrategyActionLabel(displayResult, check?.direction)
  const reviewLabel = getStrategyReviewLabel(displayResult, check?.direction)

  return (
    <section className="trading-lab__section" aria-label={STRATEGY_PANEL_TITLE}>
      <header className="trading-lab__section-head">
        <h2 className="trading-lab__section-title">{STRATEGY_PANEL_TITLE}</h2>
        <span className="trading-lab__badge">진입 기준 체크</span>
      </header>
      <p className="trading-lab__notice">{STRATEGY_CHECK_DISCLAIMER}</p>

      <div className="trading-lab__shadow-quick">
        <button
          type="button"
          className="trading-lab__shadow-quick-btn trading-lab__shadow-quick-btn--long"
          disabled={busy}
          onClick={() => handleDirection('LONG')}
        >
          {busy && direction === 'LONG' ? '점검 중' : 'LONG 기준 체크'}
        </button>
        <button
          type="button"
          className="trading-lab__shadow-quick-btn trading-lab__shadow-quick-btn--short"
          disabled={busy}
          onClick={() => handleDirection('SHORT')}
        >
          {busy && direction === 'SHORT' ? '점검 중' : 'SHORT 기준 체크'}
        </button>
      </div>

      <div className="trading-lab__strategy-block">
        <h3>진입 위치</h3>
        <div className="trading-lab__shadow-chips" aria-label="진입 위치 태그">
          {STRATEGY_LOCATION_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              className={`trading-lab__shadow-chip${
                selectedTags.includes(tag) ? ' is-active' : ''
              }`}
              disabled={busy}
              onClick={() => handleTag(tag)}
            >
              {getShadowTagLabel(tag)}
            </button>
          ))}
        </div>
      </div>

      <div className="trading-lab__strategy-block">
        <h3>리스크</h3>
        <div className="trading-lab__shadow-chips" aria-label="리스크 태그">
          {STRATEGY_RISK_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              className={`trading-lab__shadow-chip${
                selectedTags.includes(tag) ? ' is-active' : ''
              }`}
              disabled={busy}
              onClick={() => handleTag(tag)}
            >
              {tag === 'fomo' ? 'FOMO' : getShadowTagLabel(tag)}
            </button>
          ))}
        </div>
      </div>

      {check ? (
        <div className={`trading-lab__strategy-card is-${resultModifier}`}>
          <p className="trading-lab__strategy-kicker">
            {check.direction} 기준 체크 결과
          </p>
          <div className="trading-lab__strategy-result">
            <p className="trading-lab__shadow-card-title">
              {getStrategyCheckResultLabel(displayResult)}
            </p>
            <p className="trading-lab__strategy-score">
              {STRATEGY_SCORE_LABEL} {formatStrategyScore(check)}
            </p>
            <p className="trading-lab__strategy-action">
              지금 행동 {actionLabel}
              {reviewLabel !== actionLabel ? ` · ${reviewLabel}` : ''}
            </p>
            {check.recordTypeLabel || check.recordType ? (
              <p className="trading-lab__metric-sub">
                기록 유형 {check.recordTypeLabel || getShadowRecordTypeLabel(check.recordType)}
              </p>
            ) : null}
          </div>
          {primaryIssue ? (
            <div className="trading-lab__strategy-block">
              <h3>가장 큰 문제</h3>
              <p className="trading-lab__strategy-issue">{primaryIssue}</p>
            </div>
          ) : null}
          <div className="trading-lab__strategy-block">
            <h3>큰 흐름</h3>
            <dl className="trading-lab__data-grid">
              <div>
                <dt>4H 구조</dt>
                <dd>{getStructureLabel(evidence.structure4h)}</dd>
              </div>
              <div>
                <dt>1H 구조</dt>
                <dd>{getStructureLabel(evidence.structure1h)}</dd>
              </div>
            </dl>
          </div>
          <ul className="trading-lab__strategy-scores">
            {Object.values(check.categories || {}).map((category) => (
              <li key={category.label}>
                <span>{category.label}</span>
                <strong>{formatStrategyCategoryScore(category)}</strong>
              </li>
            ))}
          </ul>

          <div className="trading-lab__strategy-block">
            <h3>시장 확인</h3>
            <dl className="trading-lab__data-grid">
              <div>
                <dt>15m 가격 흐름</dt>
                <dd>{getStructureLabel(evidence.structure15m)}</dd>
              </div>
              <div>
                <dt>CVD</dt>
                <dd>{formatSignedCompactUsd(evidence.cvdNotional)}</dd>
              </div>
              <div>
                <dt>Buy/Sell</dt>
                <dd>
                  {evidence.buySharePct != null
                    ? `${Math.round(evidence.buySharePct)} / ${Math.round(
                        evidence.sellSharePct || 0,
                      )}`
                    : NO_DATA_LABEL}
                </dd>
              </div>
              <div>
                <dt>OI 변화</dt>
                <dd>
                  {evidence.oiChangePct == null
                    ? NO_DATA_LABEL
                    : `${Number(evidence.oiChangePct).toFixed(2)}%`}
                </dd>
              </div>
              <div>
                <dt>거래량 비율</dt>
                <dd>{formatVolumeRatio(evidence.volumeRatio) || NO_DATA_LABEL}</dd>
              </div>
              <div>
                <dt>Funding</dt>
                <dd>
                  {evidence.fundingRate == null
                    ? NO_DATA_LABEL
                    : `${(Number(evidence.fundingRate) * 100).toFixed(4)}%`}
                </dd>
              </div>
              <div>
                <dt>청산</dt>
                <dd>
                  {evidence.liquidationWatch
                    ? '주의 관찰'
                    : `L ${formatSignedCompactUsd(evidence.longLiquidationNotional)} / S ${formatSignedCompactUsd(evidence.shortLiquidationNotional)}`}
                </dd>
              </div>
            </dl>
          </div>

          {check.missingItems?.length ? (
            <div className="trading-lab__strategy-block">
              <h3>부족</h3>
              <ul className="trading-lab__reason-list">
                {check.missingItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {check.linkedAnnotations?.length ? (
            <div className="trading-lab__strategy-block">
              <h3>차트에서 감지된 근거</h3>
              <ul className="trading-lab__reason-list">
                {check.linkedAnnotations.map((item) => (
                  <li key={item.id || item.evidence}>{item.evidence}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {check.confirmedEvidence?.length ? (
            <div className="trading-lab__strategy-block">
              <h3>확인된 근거</h3>
              <ul className="trading-lab__reason-list">
                {check.confirmedEvidence.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {check.riskWarnings?.length ? (
            <p className="trading-lab__shadow-warnings">
              {check.riskWarnings.join(' · ')}
            </p>
          ) : null}

          <p className="trading-lab-drawer__hint">{STRATEGY_RECORD_HINT}</p>
          <div className="trading-lab__shadow-quick">
            <button
              type="button"
              className="trading-lab__shadow-quick-btn trading-lab__shadow-quick-btn--long"
              disabled={recording || check.direction !== 'LONG'}
              onClick={handleRecord}
            >
              {recording && check.direction === 'LONG'
                ? '저장 중'
                : '이 기준으로 가상 LONG 기록'}
            </button>
            <button
              type="button"
              className="trading-lab__shadow-quick-btn trading-lab__shadow-quick-btn--short"
              disabled={recording || check.direction !== 'SHORT'}
              onClick={handleRecord}
            >
              {recording && check.direction === 'SHORT'
                ? '저장 중'
                : '이 기준으로 가상 SHORT 기록'}
            </button>
          </div>
        </div>
      ) : (
        <p className="trading-lab-drawer__hint">
          먼저 방향을 점검한 뒤, 기준 체크 기반 가상 기록을 남길 수 있습니다. 실제 주문은 없습니다.
        </p>
      )}

      {message ? <p className="trading-lab__shadow-toast">{message}</p> : null}
      {error ? <p className="trading-lab__error">{error}</p> : null}
    </section>
  )
}
