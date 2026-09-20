import React from 'react'
import {
  journalConclusionSummary,
  journalDate,
  journalDirectionLabel,
  journalHorizonResult,
  journalLatestReadyHorizon,
  journalLeverageSummary,
  journalMaeSummary,
  journalPricePlanSummary,
  journalRecordTypeLabel,
  journalReviewSummary,
  journalRiskSummary,
  journalSnippet,
  journalStatusLabel,
  journalStructureSummary,
  journalTitle,
} from '../../utils/tradeJournalView.js'

function JournalCard({ trade, onSelect }) {
  const journal = trade.journal
  const ready = journalLatestReadyHorizon(trade)
  const leverageLine = journalLeverageSummary(trade)
  const conclusion = journalConclusionSummary(journal)
  const structure = journalStructureSummary(journal)
  return (
    <article className="lab-journal-card">
      <button type="button" className="lab-journal-card__hit" onClick={() => onSelect(trade.id)} aria-label={`${journalTitle(trade)} 일지 열기`}>
        <div className="lab-journal-card__media">
          {journal?.coverImageUrl
            ? <img src={journal.coverImageUrl} alt="" className="lab-journal-card__thumb" />
            : <div className="lab-journal-card__placeholder" aria-hidden="true">캡처 없음</div>}
          {(conclusion || structure) ? (
            <div className="lab-journal-card__thinking">
              {conclusion ? (
                <p className="lab-journal-card__conclusion">
                  <span>내 결론</span>
                  {conclusion}
                </p>
              ) : null}
              {structure ? (
                <p className="lab-journal-card__structure">
                  <span>구조</span>
                  {structure}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="lab-journal-card__body">
          <div className="lab-journal-card__top">
            <span className={`lab-direction lab-direction--${String(trade.direction).toLowerCase()}`}>{journalDirectionLabel(trade.direction)}</span>
            <span className="lab-journal-card__status">{journalStatusLabel(trade)}</span>
          </div>
          <h3>{journalTitle(trade)}</h3>
          <p className="lab-journal-card__meta">{trade.symbol} · {journalDirectionLabel(trade.direction)} · {journalRecordTypeLabel(trade.recordType)} · {journalDate(trade.createdAt)}</p>
          <p className="lab-journal-card__plan">{journalPricePlanSummary(trade)}</p>
          {leverageLine ? <p className="lab-journal-card__leverage">{leverageLine}</p> : null}
          <dl className="lab-journal-card__facts">
            <div><dt>진입 시나리오</dt><dd>{journalSnippet(journal?.scenarioText, '시나리오를 남겨주세요')}</dd></div>
            <div><dt>리스크 계획</dt><dd>{journalRiskSummary(journal)}</dd></div>
            {journal?.entryReasonText ? <div><dt>진입 이유</dt><dd>{journalSnippet(journal.entryReasonText)}</dd></div> : null}
            <div><dt>복기</dt><dd>{journalReviewSummary(journal)}</dd></div>
            {journal?.mistakeText ? <div><dt>놓친 점</dt><dd>{journalSnippet(journal.mistakeText)}</dd></div> : null}
            {journal?.lessonText ? <div><dt>다음에 고칠 점</dt><dd>{journalSnippet(journal.lessonText)}</dd></div> : null}
          </dl>
          {(journal?.reasonTags?.length || journal?.emotionTag || journal?.fomo != null) && (
            <div className="lab-journal-card__tags">
              {(journal?.reasonTags || []).slice(0, 6).map((tag) => <span key={tag}>{tag}</span>)}
              {journal?.emotionTag ? <span>{journal.emotionTag}</span> : null}
              {journal?.fomo ? <span>FOMO</span> : null}
            </div>
          )}
          <div className="lab-journal-card__bottom">
            <span>{ready ? journalHorizonResult(trade, ready) : journalStatusLabel(trade)}</span>
            {journalMaeSummary(trade) ? <span>{journalMaeSummary(trade)}</span> : null}
            <span className="lab-journal-card__open">일지 열기</span>
          </div>
        </div>
      </button>
    </article>
  )
}

export default function TradeJournalList({ trades = [], loading, error, filter, onFilter, onSelect, onCreate, onRefresh, hasMore, onMore, offset = 0, onPrevious }) {
  return (
    <section className="lab-journal-list" aria-label="매매일지 · 복기">
      <header className="lab-section-head">
        <div><div className="lab-eyebrow">MY JOURNAL</div><h2>내가 남긴 시나리오</h2></div>
        <div className="lab-journal-toolbar">
          <button type="button" className="lab-button lab-button--quiet" onClick={onRefresh}>목록 새로고침</button>
          <button type="button" className="lab-button lab-button--primary" onClick={onCreate}>+ 시나리오 남기기</button>
        </div>
      </header>
      <div className="lab-filters" aria-label="일지 필터">
        {[['all', '전체 기록'], ['review', '복기할 기록'], ['reviewed', '복기 완료']].map(([key, label]) => (
          <button type="button" key={key} aria-pressed={filter === key} className={`lab-filter${filter === key ? ' is-selected' : ''}`} onClick={() => onFilter(key)}>{label}</button>
        ))}
      </div>
      {error ? <p className="lab-error" role="alert">{error}</p> : loading && !trades.length ? <p className="lab-empty" role="status">일지를 불러오는 중…</p> : !trades.length ? (
        <div className="lab-empty">
          <span className="lab-empty__icon">✎</span>
          <h3>{filter === 'all' ? '아직 남긴 시나리오가 없습니다.' : filter === 'review' ? '지금 복기할 기록이 없습니다.' : '복기를 마친 기록이 없습니다.'}</h3>
          <p>{filter === 'all' ? '캡처와 근거를 남겨두면, 시간별 결과를 이 기록에 이어서 돌아볼 수 있습니다.' : '시간별 결과가 도착한 기록을 열고, 다음에 고칠 점을 적어보세요.'}</p>
          {filter === 'all' && <button className="lab-button lab-button--primary" type="button" onClick={onCreate}>첫 시나리오 남기기</button>}
        </div>
      ) : (
        <ul className="lab-journal-cards">{trades.map((trade) => <li key={trade.id}><JournalCard trade={trade} onSelect={onSelect} /></li>)}</ul>
      )}
      <div className="lab-pagination">
        {offset > 0 && <button className="lab-button" type="button" onClick={onPrevious} disabled={loading}>이전 기록</button>}
        {hasMore && <button className="lab-button" type="button" onClick={onMore} disabled={loading}>다음 기록</button>}
      </div>
    </section>
  )
}
