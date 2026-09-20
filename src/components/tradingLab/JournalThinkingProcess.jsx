import React from 'react'
import { JOURNAL_REASON_TAGS } from '../../../shared/tradeJournal.js'

const STEPS = [
  {
    key: 'chartLocationText',
    step: '01',
    title: '현재 위치',
    question: '지금 가격은 큰 그림에서 어디에 있는가?',
    placeholder: '예: 4H 박스권 하단 근처, 주봉 상승 채널 안, 이전 고점 재테스트 구간, FVG 내부',
    rows: 2,
  },
  {
    key: 'supportResistanceText',
    step: '02',
    title: '지지 / 저항',
    question: '가장 가까운 의미 있는 지지와 저항은 어디인가?',
    placeholder: '예: 76,000 지지 / 79,000 저항',
    rows: 2,
  },
  {
    key: 'marketStructureText',
    step: '03',
    title: '시장 구조',
    question: '고점과 저점은 어떻게 움직이고 있는가?',
    placeholder: '예: 고점은 낮아지고 있지만 저점은 아직 유지 중',
    rows: 2,
  },
  {
    key: 'trendText',
    step: '04',
    title: '추세',
    question: '큰 흐름과 단기 흐름은 어떤 상태인가?',
    placeholder: '예: 큰 흐름은 상승 채널, 1H는 단기 조정',
    rows: 2,
  },
  {
    key: 'volumeText',
    step: '05',
    title: '거래량',
    question: '가격 움직임에 거래량이 확인되는가?',
    placeholder: '예: 지지 구간 반응 시 거래량 증가 확인 필요',
    rows: 2,
  },
]

/** Ordered thinking notes before price plans — not a checkbox checklist. */
export default function JournalThinkingProcess({ form, onChange }) {
  function toggleTag(tag) {
    const next = form.reasonTags.includes(tag)
      ? form.reasonTags.filter((value) => value !== tag)
      : [...form.reasonTags, tag]
    onChange('reasonTags', next)
  }
  return (
    <section className="journal-thinking" aria-label="진입 전 사고 과정">
      <div className="journal-thinking__head">
        <h3>진입 전 사고 과정</h3>
        <p className="lab-muted">다른 사람의 관점보다 먼저, 내가 차트를 어떻게 봤는지 남깁니다.</p>
      </div>
      <ol className="journal-thinking__steps">
        {STEPS.map((step) => (
          <li key={step.key} className="journal-thinking__step">
            <div className="journal-thinking__step-label">
              <span>{step.step}</span>
              <strong>{step.title}</strong>
            </div>
            <p className="journal-thinking__question">{step.question}</p>
            <label className="journal-field">
              <span className="visually-hidden">{step.title}</span>
              <textarea
                value={form[step.key]}
                maxLength={500}
                rows={step.rows}
                onChange={(event) => onChange(step.key, event.target.value)}
                placeholder={step.placeholder}
              />
            </label>
          </li>
        ))}
        <li className="journal-thinking__step">
          <div className="journal-thinking__step-label">
            <span>06</span>
            <strong>추가 근거</strong>
          </div>
          <p className="journal-thinking__question">차트 표시 · 수급 · 청산 등 확인한 근거 태그를 남깁니다.</p>
          <fieldset className="journal-tag-group">
            <legend className="visually-hidden">추가 근거 태그</legend>
            <div>
              {JOURNAL_REASON_TAGS.map((tag) => (
                <button
                  type="button"
                  key={tag}
                  aria-pressed={form.reasonTags.includes(tag)}
                  className={`lab-tag${form.reasonTags.includes(tag) ? ' is-selected' : ''}`}
                  onClick={() => toggleTag(tag)}
                >
                  {tag}
                </button>
              ))}
            </div>
          </fieldset>
        </li>
        <li className="journal-thinking__step">
          <div className="journal-thinking__step-label">
            <span>07</span>
            <strong>내 결론</strong>
          </div>
          <p className="journal-thinking__question">그래서 나는 무엇을 기다리고 있는가?</p>
          <label className="journal-field">
            <span className="visually-hidden">내 결론</span>
            <textarea
              value={form.conclusionText}
              maxLength={1000}
              rows={3}
              onChange={(event) => onChange('conclusionText', event.target.value)}
              placeholder="예: 하단 재터치 후 15m에서 지지 회복 확인 시 LONG 관찰 · SHORT 관찰 · 아직 대기 · 조건 충족 시 검토"
            />
          </label>
        </li>
      </ol>
    </section>
  )
}
