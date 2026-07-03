/**
 * CrisisSimulator.jsx — 위기 시뮬레이터 전용 화면
 */

import { calculateAssetClassAllocation } from '../utils/calculator.js'
import { buildAssetRows } from '../utils/portfolioRows.js'
import { simulateCrisisScenarios } from '../utils/riskEngine.js'
import { formatCurrency, formatPercent, formatProfitLoss, getPnlClass } from '../utils/formatters.js'
import '../styles/WorkspacePages.css'

function CrisisSimulator({ assets = [], prices = [] }) {
  const assetRows = buildAssetRows(assets, prices)
  const allocation = calculateAssetClassAllocation(assetRows)
  const crisisSimulation = simulateCrisisScenarios(allocation)
  const worstScenario = crisisSimulation.scenarios.find(
    (scenario) => scenario.id === crisisSimulation.worstScenarioId,
  )

  if (assets.length === 0) {
    return (
      <div className="workspace-page">
        <header className="workspace-page__header">
          <h2 className="workspace-page__title">위기 시뮬레이터</h2>
          <p className="workspace-page__desc">
            역사적 위기 유형별로 포트폴리오 예상 손실을 시뮬레이션합니다.
          </p>
        </header>
        <div className="workspace-page__empty">
          자산을 등록하고 시세를 갱신한 뒤 이용할 수 있습니다.
        </div>
      </div>
    )
  }

  if (allocation.totalValuedAmount <= 0) {
    return (
      <div className="workspace-page">
        <header className="workspace-page__header">
          <h2 className="workspace-page__title">위기 시뮬레이터</h2>
        </header>
        <div className="workspace-page__empty">시세 데이터가 필요합니다. 시세 갱신 후 다시 확인해 주세요.</div>
      </div>
    )
  }

  return (
    <div className="workspace-page">
      <header className="workspace-page__header">
        <h2 className="workspace-page__title">위기 시뮬레이터</h2>
        <p className="workspace-page__desc">
          현재 자산군 비중을 기준으로 역사적 위기 시나리오별 예상 손실을 계산합니다.
          교육·참고용 모델이며 실제 시장 결과와 다를 수 있습니다.
        </p>
      </header>

      <div className="workspace-page__summary">
        <article className="workspace-page__summary-card">
          <p className="workspace-page__summary-label">총 평가 자산</p>
          <p className="workspace-page__summary-value">
            {formatCurrency(allocation.totalValuedAmount)}
          </p>
        </article>
        <article className="workspace-page__summary-card workspace-page__summary-card--alert">
          <p className="workspace-page__summary-label">최악 시나리오</p>
          <p className={`workspace-page__summary-value ${getPnlClass(worstScenario?.expectedLossAmount)}`}>
            {worstScenario ? formatProfitLoss(worstScenario.expectedLossAmount) : '—'}
          </p>
          {worstScenario && (
            <p className="workspace-page__summary-sub">{worstScenario.name}</p>
          )}
        </article>
      </div>

      <div className="workspace-page__grid">
        {crisisSimulation.scenarios.map((scenario) => {
          const isWorst = scenario.id === crisisSimulation.worstScenarioId

          return (
            <article
              key={scenario.id}
              className={`workspace-card${isWorst ? ' workspace-card--worst' : ''}`}
            >
              <div className="workspace-card__header">
                <h3 className="workspace-card__title">{scenario.name}</h3>
                {isWorst && <span className="workspace-card__badge">Worst Case</span>}
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
        })}
      </div>
    </div>
  )
}

export default CrisisSimulator
