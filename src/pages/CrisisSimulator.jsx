/**
 * CrisisSimulator.jsx — 위기 시뮬레이터 + 분배 추천
 */

import { useState } from 'react'
import { calculateAssetClassAllocation } from '../utils/calculator.js'
import { buildAssetRows } from '../utils/portfolioRows.js'
import { simulateCrisisScenarios } from '../utils/riskEngine.js'
import AllocationAdvisor from '../components/crisis/AllocationAdvisor.jsx'
import CrisisScenarioPicker from '../components/crisis/CrisisScenarioPicker.jsx'
import { formatCurrency, formatPercent, formatProfitLoss, getPnlClass } from '../utils/formatters.js'
import '../styles/WorkspacePages.css'
import '../styles/AllocationAdvisor.css'

function ScenarioCard({ scenario, isWorst }) {
  return (
    <article className={`workspace-card${isWorst ? ' workspace-card--worst' : ''}`}>
      <div className="workspace-card__header">
        <h4 className="workspace-card__title">{scenario.name}</h4>
        {isWorst && <span className="workspace-card__badge">최악</span>}
      </div>
      <p className="workspace-card__desc">{scenario.description}</p>

      <div className="workspace-card__metrics">
        <div>
          <span className="workspace-card__metric-label">예상 손실률</span>
          <span className={`workspace-card__metric-value ${getPnlClass(scenario.expectedLossRate)}`}>
            {formatPercent(scenario.expectedLossRate)}
          </span>
        </div>
        <div>
          <span className="workspace-card__metric-label">예상 손실액</span>
          <span className={`workspace-card__metric-value ${getPnlClass(scenario.expectedLossAmount)}`}>
            {formatProfitLoss(scenario.expectedLossAmount)}
          </span>
        </div>
      </div>

      {scenario.breakdown?.length > 0 && (
        <table className="workspace-card__table">
          <thead>
            <tr>
              <th>자산군</th>
              <th>비중</th>
              <th>충격</th>
              <th>기여</th>
            </tr>
          </thead>
          <tbody>
            {scenario.breakdown.map((row) => (
              <tr key={row.assetClass}>
                <td>{row.assetClass}</td>
                <td>{row.weight.toFixed(1)}%</td>
                <td className={getPnlClass(row.shock)}>{formatPercent(row.shock)}</td>
                <td className={getPnlClass(row.contribution)}>
                  {formatPercent(row.contribution)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </article>
  )
}

function CurrentPortfolioStressTest({ allocation, crisisSimulation, worstScenario }) {
  const [selectedScenarioId, setSelectedScenarioId] = useState('all')

  const visibleScenarios =
    selectedScenarioId === 'all'
      ? crisisSimulation.scenarios
      : crisisSimulation.scenarios.filter((scenario) => scenario.id === selectedScenarioId)

  const focusedScenario =
    selectedScenarioId === 'all'
      ? worstScenario
      : crisisSimulation.scenarios.find((scenario) => scenario.id === selectedScenarioId)

  return (
    <section className="workspace-section crisis-current">
      <h3 className="workspace-section__title">현재 포트폴리오 위기 점검</h3>
      <p className="workspace-section__desc">
        등록된 보유 자산의 현재 비중을 기준으로 위기 시나리오별 예상 손실을 계산합니다. 아래에서
        시나리오를 골라 자세히 볼 수 있습니다.
      </p>

      <CrisisScenarioPicker
        selectedId={selectedScenarioId}
        onChange={setSelectedScenarioId}
        label="점검 시나리오"
      />

      <div className="workspace-page__summary">
        <article className="workspace-page__summary-card">
          <p className="workspace-page__summary-label">총 평가 자산</p>
          <p className="workspace-page__summary-value">
            {formatCurrency(allocation.totalValuedAmount)}
          </p>
        </article>
        <article className="workspace-page__summary-card workspace-page__summary-card--alert">
          <p className="workspace-page__summary-label">
            {selectedScenarioId === 'all' ? '최악 시나리오' : '선택 시나리오 손실'}
          </p>
          <p
            className={`workspace-page__summary-value ${getPnlClass(focusedScenario?.expectedLossAmount)}`}
          >
            {focusedScenario ? formatProfitLoss(focusedScenario.expectedLossAmount) : '—'}
          </p>
          {focusedScenario && (
            <p className="workspace-page__summary-sub">{focusedScenario.name}</p>
          )}
        </article>
      </div>

      <div className="workspace-page__grid">
        {visibleScenarios.map((scenario) => (
          <ScenarioCard
            key={scenario.id}
            scenario={scenario}
            isWorst={scenario.id === crisisSimulation.worstScenarioId}
          />
        ))}
      </div>
    </section>
  )
}

function CrisisSimulator({ assets = [], prices = [] }) {
  const assetRows = buildAssetRows(assets, prices)
  const allocation = calculateAssetClassAllocation(assetRows)
  const hasPortfolio = assets.length > 0 && allocation.totalValuedAmount > 0
  const crisisSimulation = hasPortfolio ? simulateCrisisScenarios(allocation) : null
  const worstScenario = crisisSimulation?.scenarios.find(
    (scenario) => scenario.id === crisisSimulation.worstScenarioId,
  )

  return (
    <div className="workspace-page">
      <header className="workspace-page__header">
        <h2 className="workspace-page__title">위기 시뮬레이터</h2>
        <p className="workspace-page__desc">
          투자 금액·배분 후보·위기 시나리오를 직접 고르며 시뮬할 수 있습니다. 자산을 등록했다면
          현재 포트폴리오도 같은 방식으로 점검할 수 있습니다.
        </p>
      </header>

      <AllocationAdvisor />

      {hasPortfolio && crisisSimulation ? (
        <CurrentPortfolioStressTest
          allocation={allocation}
          crisisSimulation={crisisSimulation}
          worstScenario={worstScenario}
        />
      ) : (
        <p className="workspace-page__empty workspace-page__empty--inline">
          {assets.length === 0
            ? '자산을 등록하면 아래에 현재 포트폴리오 위기 점검이 표시됩니다.'
            : '시세를 갱신하면 현재 포트폴리오 위기 점검이 표시됩니다.'}
        </p>
      )}
    </div>
  )
}

export default CrisisSimulator
