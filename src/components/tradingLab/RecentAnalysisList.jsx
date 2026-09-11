import { buildRecentAnalysisRows } from '../../utils/tradingLabView.js'

/**
 * 최근 분석 목록. 행을 누르면 상세(당시 시장 데이터/판단/결과)를 연다.
 */
export default function RecentAnalysisList({ analyses, onSelect, loading }) {
  const rows = buildRecentAnalysisRows(analyses)

  return (
    <section className="trading-lab__section" aria-label="최근 분석">
      <header className="trading-lab__section-head">
        <h2 className="trading-lab__section-title">최근 분석</h2>
      </header>

      {loading ? (
        <p className="trading-lab__reason-empty">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="trading-lab__notice">
          아직 기록된 분석이 없습니다. 분석을 기록하면 여기에 누적됩니다.
        </p>
      ) : (
        <ul className="trading-lab__analysis-list">
          {rows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                className="trading-lab__analysis-row"
                onClick={() => onSelect(row.id)}
              >
                <span className="trading-lab__analysis-symbol">{row.symbol}</span>
                <span
                  className={`trading-lab__bias trading-lab__bias--${row.biasModifier}`}
                >
                  {row.biasLabel}
                </span>
                <span className="trading-lab__analysis-confidence">
                  Confidence {row.confidenceLabel}
                </span>
                <span className="trading-lab__analysis-date">
                  {row.createdAtLabel}
                </span>
                <span
                  className={`trading-lab__outcome${
                    row.hasOutcome ? ' trading-lab__outcome--set' : ''
                  }`}
                >
                  {row.outcomeLabel}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
