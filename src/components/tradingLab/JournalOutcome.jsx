import React from 'react'
import { JOURNAL_HORIZONS } from '../../../shared/tradeJournal.js'
import { journalDate, journalNumber, journalOutcomeLabel, journalReturn } from '../../utils/tradeJournalView.js'
import { getMarketStateLabel, getChartAnnotationLabel } from '../../utils/tradingLabView.js'

export function JournalOutcome({ trade }) {
  const mae = trade.outcome?.maxAdverseMovePct
  const mfe = trade.outcome?.maxFavorableMovePct
  return <section className="journal-outcome" aria-label="시간별 결과">
    <div className="lab-eyebrow">TIME RESULTS</div>
    <h3>시간별 결과</h3>
    <p className="lab-muted">가상 {trade.direction} 기준 가격 변화 · 앱 서버가 실행 중일 때 자동 추적</p>
    <div className="journal-outcome__horizons">{JOURNAL_HORIZONS.map((horizon) => <div key={horizon}><span>{horizon}</span><strong>{journalOutcomeLabel(trade, horizon)}</strong><small>{Number.isFinite(trade.outcome?.[`return${horizon}Pct`]) ? `${horizon} 후 ${journalOutcomeLabel(trade, horizon)}` : '추적 대기'} · {journalNumber(trade.outcome?.[`price${horizon}`])}</small></div>)}</div>
    <div className="journal-outcome__excursion">
      <span>MFE <b>{journalReturn(mfe)}</b></span>
      <span>MAE <b>{journalReturn(mae)}</b></span>
      {typeof mae === 'number' && Number.isFinite(mae) ? <span>먼저 {journalReturn(mae)}까지 흔들림</span> : null}
    </div>
    <p className="lab-muted">15분 봉 기준 관찰값입니다. 경과 시점의 봉이 없으면 데이터 대기로 남습니다. 마지막 평가 {journalDate(trade.outcome?.evaluatedAt)}</p>
  </section>
}

export function JournalSnapshot({ snapshot, entryPlan }) {
  if (!snapshot) return <p className="lab-muted">저장할 때 ALADDIN이 가진 시장 데이터와 차트 표시를 함께 남깁니다.</p>
  const indicators = snapshot.indicators
  const historical = snapshot.kind === 'HISTORICAL_PARTIAL'
  const values = [
    ['EMA 20', indicators?.ema20], ['EMA 50', indicators?.ema50], ['EMA 200', indicators?.ema200], ['RSI 14', indicators?.rsi14],
    ['거래량 평균 (직전 20봉)', indicators?.volumeMa20], ['거래량 / 평균', indicators?.volumeRatio, '배'],
    ['CVD (15m, USDT)', snapshot.orderFlow?.cvdNotional], ['매수 체결 비중', snapshot.orderFlow?.buySharePct, '%'],
    ['매도 체결 비중', snapshot.orderFlow?.sellSharePct, '%'], ['OI 변화 (15m)', snapshot.openInterest?.changePct, '%'],
    ['Funding', snapshot.funding?.rate == null ? null : snapshot.funding.rate * 100, '%'],
    ['관측 롱 청산 (15m, USDT)', snapshot.liquidations?.long?.estimatedNotional], ['관측 숏 청산 (15m, USDT)', snapshot.liquidations?.short?.estimatedNotional],
  ]
  return <details className="journal-snapshot">
    <summary>저장 당시 근거 스냅샷 <span>{historical ? '일부 데이터만 보존됨' : snapshot.candleStale || snapshot.marketStale ? '최근 데이터 포함' : '고정 보관'}</span></summary>
    <p className="lab-muted">{journalDate(snapshot.capturedAt)} · {snapshot.timeframe || '시간봉 미기록'} · {snapshot.provider || '기존 기록'}{historical ? ' · 과거 기록에 없던 지표는 현재 값으로 채우지 않습니다.' : ' · 저장 후 지표와 차트 표시는 바뀌지 않습니다.'}</p>
    <p>{getMarketStateLabel(snapshot.marketState?.primaryState)}</p>
    <dl className="journal-metrics">{values.map(([name, value, unit]) => <div key={name}><dt>{name}</dt><dd>{journalNumber(value, unit)}</dd></div>)}</dl>
    {!historical && <p className="lab-muted">닫힌 봉 {indicators?.candleCount ?? 0}개 · EMA는 최초 기간의 단순평균으로 시작, RSI는 Wilder 방식. EMA 200은 연속된 닫힌 봉 200개가 필요합니다. 거래량 배수는 마지막 닫힌 봉과 직전 20봉의 평균을 비교합니다.</p>}
    <h4>함께 남긴 차트 표시</h4>
    {snapshot.annotations?.length ? <ul>{snapshot.annotations.map((a, i) => <li key={a.id || i}>{a.timeframe} · {getChartAnnotationLabel(a.annotationType)} · {a.price ?? `${a.bottomPrice ?? '—'} ~ ${a.topPrice ?? '—'}`} {a.memo}</li>)}</ul> : <p className="lab-muted">저장된 차트 표시 없음</p>}
    {entryPlan && <details><summary>처음 저장한 시나리오 · 리스크 계획</summary><p>{entryPlan.scenarioText || '미기록'}</p><p>{entryPlan.entryReasonText}</p><p>Entry {journalNumber(entryPlan.entryPrice)} · TP {journalNumber(entryPlan.takeProfitPrice)} · SL {journalNumber(entryPlan.stopLossPrice)}</p><p>무효화 가격 {journalNumber(entryPlan.invalidationPrice)}</p><p>{entryPlan.riskPlanText}</p><p>{entryPlan.avoidReasonText}</p></details>}
  </details>
}
