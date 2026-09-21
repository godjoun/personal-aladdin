import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import UpbitTradeReviewDialog from './UpbitTradeReviewDialog.jsx'
import { upbitReviewBadge } from '../../utils/upbitTradeView.js'

describe('Upbit trade review dialog', () => {
  it('복기 입력 필드와 기존 reason tag / exit reason을 노출한다', () => {
    const html = renderToStaticMarkup(
      <UpbitTradeReviewDialog
        trade={{ id: 'upbit-1', market: 'KRW-BTC', status: 'CLOSED' }}
        review={null}
        onClose={() => {}}
        onSave={async () => {}}
      />,
    )
    for (const label of ['왜 진입했나요?', '진입 근거', '왜 청산했나요?', '한 줄 복기', '목표 도달', '손절', '계획 변경', '충동 청산', '수동 종료', '기타', 'FVG', 'support', '복기 저장']) {
      expect(html).toContain(label)
    }
    expect(html).not.toMatch(/alert\(|주문 실행|매수하세요|자동매매/)
  })

  it('badge helper는 COMPLETED / LATER / PENDING만 표시한다', () => {
    expect(upbitReviewBadge({ reminderState: 'COMPLETED' })).toEqual({ kind: 'done', label: '복기 완료' })
    expect(upbitReviewBadge({ reminderState: 'LATER' })).toEqual({ kind: 'pending', label: '복기 미작성' })
    expect(upbitReviewBadge({ reminderState: 'PENDING' })).toEqual({ kind: 'pending', label: '복기 미작성' })
    expect(upbitReviewBadge(null)).toBeNull()
  })
})
