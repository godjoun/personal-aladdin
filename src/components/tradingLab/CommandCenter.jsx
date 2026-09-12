import {
  COMMAND_CENTER_TITLE,
  COMMAND_ROUTINE_STEPS,
  COMMAND_ROUTINE_TITLE,
  COMMAND_TODO_STEPS,
  SHADOW_AUTO_MODE_LABEL,
  getCommandStatus,
  summarizeShadowReview,
} from '../../utils/tradingLabView.js'

/**
 * 상단 요약 — 오늘 할 일과 현재 상태를 한눈에 보여준다.
 */
export default function CommandCenter({
  symbol,
  check,
  trades,
  stats,
  settings,
}) {
  const status = getCommandStatus(check)
  const review = summarizeShadowReview(trades, stats)
  const autoOn = Boolean(settings?.autoRecord)

  return (
    <section className="trading-lab__section trading-lab__command" aria-label={COMMAND_CENTER_TITLE}>
      <header className="trading-lab__section-head">
        <div>
          <h2 className="trading-lab__section-title">{COMMAND_CENTER_TITLE}</h2>
          <p className="trading-lab__metric-sub">선택 심볼 {symbol}</p>
        </div>
        <span className={`trading-lab__badge trading-lab__badge--status-${status.id.toLowerCase()}`}>
          현재 상태 {status.label}
        </span>
      </header>

      <div className="trading-lab__command-grid">
        <article className="trading-lab__command-card">
          <h3>{COMMAND_ROUTINE_TITLE}</h3>
          <ol>
            {COMMAND_ROUTINE_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </article>

        <article className="trading-lab__command-card">
          <h3>오늘 할 일</h3>
          <ol>
            {COMMAND_TODO_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </article>

        <article className="trading-lab__command-card">
          <h3>오늘의 복기</h3>
          <dl className="trading-lab__command-stats">
            <div>
              <dt>복기할 기록</dt>
              <dd>{review.reviewCount}개</dd>
            </div>
            <div>
              <dt>기준 기록</dt>
              <dd>{review.strategyCount}개</dd>
            </div>
            <div>
              <dt>충동 기록</dt>
              <dd>{review.impulseCount}개</dd>
            </div>
            <div>
              <dt>{SHADOW_AUTO_MODE_LABEL}</dt>
              <dd>{autoOn ? 'ON' : 'OFF'}</dd>
            </div>
          </dl>
          {review.fomoCount > 0 ? (
            <p className="trading-lab__metric-sub">
              최근 FOMO 기록 {review.fomoCount}건 결과 확인 필요
            </p>
          ) : null}
        </article>
      </div>
    </section>
  )
}
