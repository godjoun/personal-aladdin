import {
  MARKET_ENGINE_TITLE,
  MARKET_STATE_DISCLAIMER,
  formatConfidence,
  formatPriceValue,
  formatSignalStrength,
  getBiasLabel,
  getBiasModifier,
  getMarketStateLabel,
  getMarketStateModifier,
  buildMarketStateHistoryRows,
} from '../../utils/tradingLabView.js'

/**
 * ALADDIN Analysis — 자동 시장 상태 + 최근 수동 기록
 *
 * 자동 판정은 관찰 지표이며 매수·매도 추천이 아니다.
 */
export default function AnalysisPanel({
  analysis,
  marketState,
  marketStateHistory,
  onRecord,
}) {
  const hasAnalysis = Boolean(analysis)
  const historyRows = buildMarketStateHistoryRows(marketStateHistory)
  const primary = marketState?.primaryState
  const evidence = Array.isArray(marketState?.evidence) ? marketState.evidence : []
  const counterEvidence = Array.isArray(marketState?.counterEvidence)
    ? marketState.counterEvidence
    : []
  const secondary = Array.isArray(marketState?.secondaryStates)
    ? marketState.secondaryStates
    : []

  return (
    <section className="trading-lab__section" aria-label={MARKET_ENGINE_TITLE}>
      <header className="trading-lab__section-head">
        <h2 className="trading-lab__section-title">{MARKET_ENGINE_TITLE}</h2>
        <button type="button" className="trading-lab__action" onClick={onRecord}>
          + 분석 기록
        </button>
      </header>

      {marketState ? (
        <div className="trading-lab__engine">
          <div className="trading-lab__verdict">
            <span
              className={`trading-lab__bias trading-lab__bias--${getMarketStateModifier(
                primary,
              )}`}
            >
              {marketState.primaryStateLabel || getMarketStateLabel(primary)}
            </span>
            <span className="trading-lab__strength">
              {formatSignalStrength(marketState.strengthScore)}
            </span>
          </div>

          <div className="trading-lab__reasons">
            <div>
              <h3 className="trading-lab__reason-title">근거</h3>
              {evidence.length > 0 ? (
                <ul className="trading-lab__reason-list">
                  {evidence.map((item, index) => (
                    <li key={`ev-${index}-${item}`}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="trading-lab__reason-empty">표시할 근거 없음</p>
              )}
            </div>

            <div>
              <h3 className="trading-lab__reason-title">반대 근거</h3>
              {counterEvidence.length > 0 ? (
                <ul className="trading-lab__reason-list">
                  {counterEvidence.map((item, index) => (
                    <li key={`ce-${index}-${item}`}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="trading-lab__reason-empty">표시할 반대 근거 없음</p>
              )}
            </div>
          </div>

          {secondary.length > 0 ? (
            <div>
              <h3 className="trading-lab__reason-title">보조 상태</h3>
              <ul className="trading-lab__reason-list">
                {secondary.map((code) => (
                  <li key={code}>{getMarketStateLabel(code)}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {historyRows.length > 0 ? (
            <div className="trading-lab__state-history">
              <h3 className="trading-lab__reason-title">최근 시장 상태</h3>
              <ul className="trading-lab__state-history-list">
                {historyRows.map((row) => (
                  <li key={row.id || `${row.timeLabel}-${row.stateLabel}`}>
                    <span className="trading-lab__state-history-time">
                      {row.timeLabel}
                    </span>
                    <span>
                      {row.stateLabel}
                      {row.strength != null ? ` ${row.strength}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <p className="trading-lab__disclaimer">{MARKET_STATE_DISCLAIMER}</p>
        </div>
      ) : (
        <p className="trading-lab__notice">
          시장 상태를 아직 불러오지 못했습니다. 시장 데이터 연결 후 자동으로
          표시됩니다.
        </p>
      )}

      {!hasAnalysis ? (
        <p className="trading-lab__notice">
          이 종목에 기록된 수동 분석이 없습니다. 직접 판단을 기록하면 이후 결과와
          함께 복기할 수 있습니다.
        </p>
      ) : (
        <div className="trading-lab__manual-analysis">
          <h3 className="trading-lab__reason-title">최근 수동 분석</h3>
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
        </div>
      )}
    </section>
  )
}
