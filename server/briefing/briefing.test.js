import { describe, expect, it } from 'vitest'
import {
  classifyAttentionText,
  isImportantDisclosureTitle,
} from '../briefing/attentionKeywords.js'
import { normalizeKiwoomStockInfo, detectIsEtf } from '../kiwoomStockInfo.js'
import {
  normalizeNewsItem,
  stripHtml,
  sanitizeHttpUrl,
  getNaverNewsConfigStatus,
} from '../news/newsProvider.js'
import {
  normalizeDartDisclosure,
  getDartConfigStatus,
  lookupDartCorpCode,
  buildDartDateRange,
  DART_LOOKBACK_DAYS,
} from '../dart/dartProvider.js'
import {
  buildImportantDisclosureSignals,
  formatDisclosureDate,
} from './stockBriefing.js'
import {
  buildBriefingRiskSignals,
  percentChange,
} from '../../src/utils/briefingRiskSignals.js'
import {
  formatCurrency,
  formatEokWon,
} from '../../src/utils/formatters.js'

describe('ka10001 normalize', () => {
  it('일반 종목 정보를 정규화한다', () => {
    const info = normalizeKiwoomStockInfo({
      stk_cd: 'A365340',
      stk_nm: '성일하이텍',
      cur_prc: '80000',
      per: '12.5',
      pbr: '1.2',
      high_250: '120000',
      low_250: '50000',
      mac: '4749',
      sale_amt: '1946',
      bus_pro: '-545',
      cup_nga: '-805',
      eps: '1234',
      bps: '56789',
    })
    expect(info.symbol).toBe('365340')
    expect(info.name).toBe('성일하이텍')
    expect(info.currentPrice).toBe(80000)
    expect(info.per).toBe(12.5)
    expect(info.high250).toBe(120000)
    expect(info.isEtf).toBe(false)
    expect(info.marketCap).toBe(4749)
    expect(info.revenue).toBe(1946)
    expect(info.operatingProfit).toBe(-545)
    expect(info.netIncome).toBe(-805)
    expect(info.eps).toBe(1234)
    expect(info.bps).toBe(56789)
    expect(info.financialScaleUnit).toBe('eok')
  })

  it('ETF에서 빈 재무지표를 숨긴다', () => {
    const info = normalizeKiwoomStockInfo({
      stk_cd: '133690',
      stk_nm: 'TIGER 미국나스닥100',
      cur_prc: '110000',
      per: '',
      pbr: '',
      roe: '',
    })
    expect(detectIsEtf({}, 'TIGER 미국나스닥100')).toBe(true)
    expect(info.isEtf).toBe(true)
    expect(info.per).toBeNull()
    expect(info.pbr).toBeNull()
    expect(info.roe).toBeNull()
    expect(info.currentPrice).toBe(110000)
  })
})

describe('ka10001 단위 formatter', () => {
  it('시총/매출/영업이익/순이익은 억원, EPS/BPS/현재가는 원', () => {
    expect(formatEokWon(4749)).toBe('4,749억')
    expect(formatEokWon(1946)).toBe('1,946억')
    expect(formatEokWon(-545)).toBe('-545억')
    expect(formatEokWon(-805)).toBe('-805억')
    expect(formatCurrency(80000)).toMatch(/80,000/)
    expect(formatCurrency(1234)).toMatch(/1,234/)
    expect(formatCurrency(56789)).toMatch(/56,789/)
    expect(formatEokWon(4749)).not.toContain('₩')
    expect(formatEokWon(null)).toBeNull()
  })
})

describe('news normalize / keywords', () => {
  it('HTML을 제거한다', () => {
    expect(stripHtml('<b>유상증자</b> 결정')).toBe('유상증자 결정')
  })

  it('http(s) 외 링크를 거부한다', () => {
    expect(sanitizeHttpUrl('javascript:alert(1)')).toBeNull()
    expect(sanitizeHttpUrl('https://example.com/a')).toContain('https://')
  })

  it('뉴스 주의 category를 붙인다', () => {
    const item = normalizeNewsItem({
      title: '전환사채 발행 검토',
      description: '회사 공시',
      link: 'https://example.com/n',
      pubDate: '2026-08-27',
    })
    expect(item.attention?.matched).toContain('전환사채')
    expect(item.title.includes('<')).toBe(false)
  })

  it('일반 뉴스 false positive를 최소화한다', () => {
    const item = normalizeNewsItem({
      title: '날씨 좋은 하루 시장 마감',
      description: '코스피 소폭 상승',
      link: 'https://example.com/n',
    })
    expect(item.attention).toBeNull()
  })

  it('뉴스 API 미설정 시 configured=false', () => {
    expect(getNaverNewsConfigStatus({}).configured).toBe(false)
  })
})

describe('DART normalize / keywords', () => {
  it('중요 공시를 분류한다', () => {
    expect(isImportantDisclosureTitle('전환사채권 발행결정')).toBe(true)
    expect(isImportantDisclosureTitle('전환가액의조정')).toBe(true)
    expect(isImportantDisclosureTitle('유상증자결정')).toBe(true)
    expect(isImportantDisclosureTitle('최대주주 변경')).toBe(true)
    expect(isImportantDisclosureTitle('반기보고서')).toBe(false)
    expect(isImportantDisclosureTitle('임시주주총회결과')).toBe(false)
    expect(classifyAttentionText('최대주주 변경').matched).toContain('최대주주')
    const row = normalizeDartDisclosure({
      report_nm: '유상증자 결정',
      rcept_dt: '20260827',
      rcept_no: '20260827000001',
      corp_name: '테스트',
    })
    expect(row.important).toBe(true)
    expect(row.link).toContain('dart.fss.or.kr')
    expect(row.link).toMatch(/^https:\/\//)
  })

  it('일반 공시는 important=false (badge 없음)', () => {
    const row = normalizeDartDisclosure({
      report_nm: '반기보고서 (2026.06)',
      rcept_dt: '20260814',
      rcept_no: '20260814000001',
    })
    expect(row.important).toBe(false)
  })

  it('DART 미설정·매핑 없음에도 앱이 죽지 않는다', () => {
    expect(getDartConfigStatus({}).configured).toBe(false)
    expect(lookupDartCorpCode('005930', undefined, {})).toBeNull()
  })

  it('기본 조회 기간은 90일', () => {
    expect(DART_LOOKBACK_DAYS).toBe(90)
    const end = new Date(2026, 7, 27) // local 2026-08-27
    const range = buildDartDateRange(end, 90)
    const fmt = (d) =>
      `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
    expect(range.endDe).toBe(fmt(end))
    expect(range.bgnDe).toBe(fmt(new Date(end.getTime() - 90 * 86400000)))
    expect(range.lookbackDays).toBe(90)
  })
})

describe('중요 공시 → 상단 주의 신호', () => {
  it('중요 공시만 최신 1~3건, 레벨은 확인 필요', () => {
    const signals = buildImportantDisclosureSignals([
      {
        title: '반기보고서',
        submittedAt: '20260814',
        important: false,
        link: 'https://dart.fss.or.kr/a',
      },
      {
        title: '전환가액의조정',
        submittedAt: '20260723',
        important: true,
        link: 'https://dart.fss.or.kr/b',
      },
      {
        title: '유상증자결정',
        submittedAt: '20260601',
        important: true,
        link: 'https://dart.fss.or.kr/c',
      },
      {
        title: '최대주주변경',
        submittedAt: '20260515',
        important: true,
        link: 'https://dart.fss.or.kr/d',
      },
      {
        title: '오래된중요',
        submittedAt: '20260101',
        important: true,
        link: 'https://dart.fss.or.kr/e',
      },
    ])

    expect(signals).toHaveLength(3)
    expect(signals.map((s) => s.title)).toEqual([
      '전환가액의조정',
      '유상증자결정',
      '최대주주변경',
    ])
    expect(signals.every((s) => s.level === '확인 필요')).toBe(true)
    expect(signals[0].evidence).toBe('2026-07-23')
    expect(signals[0].link).toBe('https://dart.fss.or.kr/b')
    expect(signals.every((s) => !/위험|매도|손절/.test(`${s.level}${s.title}${s.detail || ''}`))).toBe(
      true,
    )
  })

  it('날짜 포맷', () => {
    expect(formatDisclosureDate('20260723')).toBe('2026-07-23')
    expect(formatDisclosureDate('')).toBeNull()
  })
})

describe('briefing risk signals', () => {
  it('250일 고가 대비 하락을 주의로 표시한다', () => {
    const signals = buildBriefingRiskSignals({
      info: { currentPrice: 69, high250: 100 },
    })
    expect(signals.some((s) => s.id === 'drawdown_250')).toBe(true)
    expect(signals[0].evidence).toMatch(/%/)
    expect(signals.every((s) => !/매도|손절|위험/.test(s.level))).toBe(true)
  })

  it('percentChange null 안전', () => {
    expect(percentChange(null, 100)).toBeNull()
  })
})
