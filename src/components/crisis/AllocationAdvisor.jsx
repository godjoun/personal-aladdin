/**
 * AllocationAdvisor.jsx — 투자금 기준 분배 추천 시뮬
 */

import { useEffect, useMemo, useState } from 'react'
import { applyCustomTargets, applyStrategyPreset } from '../../data/strategyPresets.js'
import {
  rankRecommendationsForView,
  recommendAllocations,
} from '../../utils/allocationOptimizer.js'
import { CRISIS_SCENARIOS } from '../../utils/riskEngine.js'
import CrisisScenarioPicker from './CrisisScenarioPicker.jsx'
import { formatCurrency, formatPercent, formatProfitLoss, getPnlClass } from '../../utils/formatters.js'

const DEFAULT_AMOUNT = 1_000_000

function scenarioShortLabel(scenarioId) {
  return CRISIS_SCENARIOS.find((scenario) => scenario.id === scenarioId)?.name ?? ''
}

function AllocationAdvisor({ onPresetApplied }) {
  const [amountInput, setAmountInput] = useState(String(DEFAULT_AMOUNT))
  const [selectedCandidateId, setSelectedCandidateId] = useState(null)
  const [selectedScenarioId, setSelectedScenarioId] = useState('all')
  const [appliedMessage, setAppliedMessage] = useState('')

  const totalAmount = Math.max(0, Number.parseInt(amountInput.replace(/,/g, ''), 10) || 0)
  const result = useMemo(() => recommendAllocations(totalAmount), [totalAmount])

  const tableRows = useMemo(
    () => rankRecommendationsForView(result.recommendations, selectedScenarioId),
    [result.recommendations, selectedScenarioId],
  )

  useEffect(() => {
    if (result.best) {
      setSelectedCandidateId(result.best.id)
    }
  }, [result.best?.id, totalAmount])

  const selected =
    result.recommendations.find((row) => row.id === selectedCandidateId) ??
    tableRows.find((row) => row.isViewBest) ??
    result.best

  const selectedScenario =
    selectedScenarioId === 'all'
      ? null
      : selected?.scenarios?.find((scenario) => scenario.id === selectedScenarioId)

  function handleApplyRecommendation(candidate) {
    const applied =
      candidate.source === 'preset'
        ? applyStrategyPreset(candidate.id)
        : applyCustomTargets(candidate.targets)

    if (applied) {
      setAppliedMessage('리밸런싱 목표로 적용했습니다. 네트워크 참여는 꺼집니다.')
      onPresetApplied?.()
    }
  }

  return (
    <section className="allocation-advisor" aria-label="분배 추천 시뮬">
      <header className="allocation-advisor__header">
        <h3 className="allocation-advisor__title">분배 추천 시뮬</h3>
        <p className="allocation-advisor__desc">
          시나리오를 고르면 <strong>모든 후보 비교표</strong>가 그 기준으로 순위·손실이
          바뀝니다. 행을 클릭해 배분을 선택할 수 있습니다.
        </p>
      </header>

      <div className="allocation-advisor__input-row">
        <label className="allocation-advisor__label" htmlFor="advisor-amount">
          투자 금액
        </label>
        <input
          id="advisor-amount"
          className="allocation-advisor__input"
          type="text"
          inputMode="numeric"
          value={amountInput}
          onChange={(e) => setAmountInput(e.target.value)}
          placeholder="1000000"
        />
        <span className="allocation-advisor__input-hint">
          {totalAmount > 0 ? formatCurrency(totalAmount) : '금액을 입력하세요'}
        </span>
      </div>

      {tableRows.length > 0 && (
        <>
          <CrisisScenarioPicker
            selectedId={selectedScenarioId}
            onChange={setSelectedScenarioId}
            label="비교 시나리오"
          />

          <div className="allocation-advisor__compare allocation-advisor__compare--primary">
            <h4 className="allocation-advisor__compare-title">
              {selectedScenarioId === 'all'
                ? '후보 비교 · 전체 시나리오'
                : `후보 비교 · ${scenarioShortLabel(selectedScenarioId)}`}
            </h4>
            <div className="allocation-advisor__table-wrap">
              <table className="allocation-advisor__table">
                <thead>
                  <tr>
                    <th>순위</th>
                    <th>배분</th>
                    {selectedScenarioId === 'all' ? (
                      <>
                        {CRISIS_SCENARIOS.map((scenario) => (
                          <th key={scenario.id}>{scenario.name.replace('형', '')}</th>
                        ))}
                        <th>방어</th>
                      </>
                    ) : (
                      <>
                        <th>손실률</th>
                        <th>손실액</th>
                        <th>방어</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((row) => {
                    const isSelected = selected?.id === row.id
                    return (
                      <tr
                        key={row.id}
                        className={`allocation-advisor__table-row${
                          isSelected ? ' allocation-advisor__table-row--selected' : ''
                        }${row.isViewBest ? ' allocation-advisor__table-row--best' : ''}`}
                        onClick={() => setSelectedCandidateId(row.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setSelectedCandidateId(row.id)
                          }
                        }}
                        tabIndex={0}
                        role="button"
                        aria-pressed={isSelected}
                      >
                        <td>
                          {row.viewRank}
                          {row.isViewBest && (
                            <span className="allocation-advisor__rank-badge">1위</span>
                          )}
                        </td>
                        <td>
                          <strong>{row.name}</strong>
                          <span className="allocation-advisor__table-desc">{row.desc}</span>
                        </td>
                        {selectedScenarioId === 'all' ? (
                          <>
                            {CRISIS_SCENARIOS.map((scenario) => {
                              const scenarioResult = row.scenarios?.find(
                                (item) => item.id === scenario.id,
                              )
                              return (
                                <td
                                  key={scenario.id}
                                  className={getPnlClass(scenarioResult?.expectedLossRate)}
                                >
                                  {formatPercent(scenarioResult?.expectedLossRate)}
                                </td>
                              )
                            })}
                            <td>{row.defenseScore}</td>
                          </>
                        ) : (
                          <>
                            <td className={getPnlClass(row.viewLossRate)}>
                              {formatPercent(row.viewLossRate)}
                            </td>
                            <td className={getPnlClass(row.viewLossAmount)}>
                              {formatProfitLoss(row.viewLossAmount)}
                            </td>
                            <td>{row.defenseScore}</td>
                          </>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {selected && (
        <article className="allocation-advisor__best allocation-advisor__best--compact">
          <div className="allocation-advisor__best-header">
            <div>
              <p className="allocation-advisor__best-label">선택한 배분</p>
              <h4 className="allocation-advisor__best-name">{selected.name}</h4>
              <p className="allocation-advisor__best-desc">{selected.desc}</p>
            </div>
            <div className="allocation-advisor__score">
              {selectedScenario ? (
                <>
                  <span className="allocation-advisor__score-label">
                    {scenarioShortLabel(selectedScenarioId)}
                  </span>
                  <strong
                    className={`allocation-advisor__score-value ${getPnlClass(selectedScenario.expectedLossRate)}`}
                  >
                    {formatPercent(selectedScenario.expectedLossRate)}
                  </strong>
                  <span className="allocation-advisor__score-sub">
                    {formatProfitLoss(selectedScenario.expectedLossAmount)}
                  </span>
                </>
              ) : (
                <>
                  <span className="allocation-advisor__score-label">방어 점수</span>
                  <strong className="allocation-advisor__score-value">{selected.defenseScore}</strong>
                  <span className="allocation-advisor__score-sub">
                    최악 {formatPercent(selected.worstLossRate)}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="allocation-advisor__amount-grid">
            {Object.entries(selected.amounts).map(([assetClass, value]) => (
              <div key={assetClass} className="allocation-advisor__amount-item">
                <span className="allocation-advisor__amount-class">{assetClass}</span>
                <span className="allocation-advisor__amount-weight">
                  {selected.targets[assetClass].toFixed(1)}%
                </span>
                <span className="allocation-advisor__amount-value">{formatCurrency(value)}</span>
              </div>
            ))}
          </div>

          <button
            type="button"
            className="allocation-advisor__apply-btn"
            onClick={() => handleApplyRecommendation(selected)}
          >
            선택한 비중을 리밸런싱 목표로 적용
          </button>
          {appliedMessage && <p className="allocation-advisor__message">{appliedMessage}</p>}
        </article>
      )}
    </section>
  )
}

export default AllocationAdvisor
