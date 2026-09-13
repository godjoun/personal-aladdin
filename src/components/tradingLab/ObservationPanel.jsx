import React from 'react'
import { getMarketStateLabel } from '../../utils/tradingLabView.js'
import { journalDate } from '../../utils/tradeJournalView.js'

export default function ObservationPanel({ state, loading, error, fetchedAt, stale, children }) {
  const primary = state?.primaryState
  const direction = ['BULLISH_PRESSURE', 'NEW_LONG_BUILDUP', 'SHORT_LIQUIDATION_DRIVEN'].includes(primary) ? '상승 쪽 압력 관찰' : ['BEARISH_PRESSURE', 'NEW_SHORT_BUILDUP', 'LONG_LIQUIDATION_DRIVEN'].includes(primary) ? '하락 쪽 압력 관찰' : '방향 판단 보류'
  const evidence = state?.evidence?.slice(0, 3) || []
  const conflicts = state?.counterEvidence || []
  return (
    <section className="lab-observation" aria-label="현재 관찰 근거">
      <div className="lab-eyebrow">OBSERVATION</div>
      <h2>현재 관찰 근거</h2>
      <p className="lab-muted">{loading ? '관찰 근거 불러오는 중…' : fetchedAt ? `${journalDate(fetchedAt)} 기준${stale ? ' · 최근 데이터' : ''}` : '데이터 연결 대기'}</p>
      <p className="lab-observation__summary" role="status">{error ? '관찰 근거를 불러오지 못했습니다.' : loading ? '현재 데이터를 확인하고 있습니다.' : getMarketStateLabel(primary || 'DATA_INSUFFICIENT')}</p>
      <span className="lab-tag">{direction}</span>
      <h3>관찰된 근거</h3>
      {evidence.length ? <ol>{evidence.map((item) => <li key={item}>{item}</li>)}</ol> : <p className="lab-muted">아직 충분한 근거가 없습니다. 내 시나리오는 직접 기록할 수 있습니다.</p>}
      <h3>충돌 신호</h3>
      <p className="lab-muted">{conflicts.slice(0, 2).join(' · ') || (evidence.length ? '현재 집계에서 확인된 충돌 없음' : '데이터 부족으로 확인할 수 없음')}</p>
      <div className="lab-observation__next"><span>다음 확인 하나</span><p>{conflicts.length ? '가격 움직임과 반대 방향의 수급이 이어지는지 확인하세요.' : '표시한 구간에서 다음 봉의 마감과 거래량 반응을 확인하세요.'}</p></div>
      {children}
    </section>
  )
}
