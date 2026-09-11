import {
  NO_DATA_LABEL,
  formatConfidence,
  formatPriceValue,
  getBiasLabel,
  getBiasModifier,
} from '../../utils/tradingLabView.js'

/**
 * ALADDIN Analysis — 가장 최근에 기록된 판단을 보여준다.
 *
 * 자동 판단 알고리즘은 아직 없다.
 * 시장 관찰(observations)은 provider 데이터가 있을 때만 채워지며,
 * 모두 "가능성" 수준의 참고 정보다.
 */
export default function AnalysisPanel({ analysis, observations, onRecord }) {
  const hasAnalysis = Boolean(analysis)
  const list = Array.isArray(observations) ? observations : []

  return (
    <section className="trading-lab__section" aria-label="ALADDIN Analysis">
      <header className="trading-lab__section-head">
        <h2 className="trading-lab__section-title">ALADDIN Analysis</h2>
        <button type="button" className="trading-lab__action" onClick={onRecord}>
          + 분석 기록
        </button>
      </header>

      {!hasAnalysis ? (
        <p className="trading-lab__notice">
          이 종목에 기록된 분석이 없습니다. 직접 판단을 기록하면 이후 결과와 함께
          복기할 수 있습니다.
        </p>
      ) : (
        <>
          <div className="trading-lab__verdict">
            <span
              className={`trading-lab__bias trading-lab__bias--${getBiasModifier(
                analysis.bias,
              )}`}
            >
              {getBiasLabel(analysis.bias)}
            </span>
            <span className="trading-lab__confidence">
              Confidence {formatConfidence(analysis.confidence)}
            </span>
          </div>

          <div className="trading-lab__reasons">
            <div>
              <h3 className="trading-lab__reason-title">근거</h3>
              {analysis.reasoning?.length > 0 ? (
                <ul className="trading-lab__reason-list">
                  {analysis.reasoning.map((item, index) => (
                    <li key={`${index}-${item}`}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="trading-lab__reason-empty">기록된 근거 없음</p>
              )}
            </div>

            <div>
              <h3 className="trading-lab__reason-title">주의</h3>
              {analysis.cautions?.length > 0 ? (
                <ul className="trading-lab__reason-list">
                  {analysis.cautions.map((item, index) => (
                    <li key={`${index}-${item}`}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="trading-lab__reason-empty">기록된 주의 없음</p>
              )}
            </div>
          </div>

          <dl className="trading-lab__data-grid">
            <div className="trading-lab__data-item">
              <dt>기준 가격</dt>
              <dd>{formatPriceValue(analysis.referencePrice)}</dd>
            </div>
            <div className="trading-lab__data-item">
              <dt>Invalidation</dt>
              <dd>{formatPriceValue(analysis.invalidationPrice)}</dd>
            </div>
          </dl>

          {analysis.invalidationPrice != null ? (
            <p className="trading-lab__notice">
              이 가격을 지나면 위 판단의 근거가 약화되는 것으로 기록되었습니다.
            </p>
          ) : null}
        </>
      )}

      {list.length > 0 ? (
        <div className="trading-lab__observations">
          <h3 className="trading-lab__reason-title">시장 관찰 (가능성)</h3>
          <ul className="trading-lab__reason-list">
            {list.map((item) => (
              <li key={item.code}>
                {item.label}
                {item.detail ? (
                  <span className="trading-lab__data-hint"> — {item.detail}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="trading-lab__reason-empty">
          시장 관찰: {NO_DATA_LABEL} (시장 데이터 연결 후 표시)
        </p>
      )}
    </section>
  )
}
