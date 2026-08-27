/**
 * attentionKeywords.js — 뉴스/공시 제목 기반 주의 분류 (단정 금지)
 */

/** @typedef {{ id: string, label: string, priority: number, patterns: RegExp[] }} AttentionCategory */

/** @type {AttentionCategory[]} */
export const ATTENTION_CATEGORIES = Object.freeze([
  {
    id: 'legal',
    label: '법적',
    priority: 100,
    patterns: [/횡령/, /배임/, /소송/, /압수수색/, /수사/],
  },
  {
    id: 'listing',
    label: '거래/상장',
    priority: 95,
    patterns: [/거래정지/, /상장폐지/, /관리종목/, /투자주의/, /투자경고/, /투자위험/],
  },
  {
    id: 'audit',
    label: '회계',
    priority: 90,
    patterns: [/감사의견/, /의견거절/, /회계처리/, /한정\s*의견/, /부적정/],
  },
  {
    id: 'dilution',
    label: '자금/희석',
    priority: 85,
    patterns: [
      /유상증자/,
      /전환사채/,
      /전환가액/,
      /신주인수권/,
      /\bCB\b/i,
      /\bBW\b/i,
      /신주인수권부사채/,
      /감자/,
    ],
  },
  {
    id: 'governance',
    label: '경영',
    priority: 70,
    patterns: [/최대주주\s*변경/, /대표이사\s*변경/, /대표\s*교체/],
  },
  {
    id: 'operations',
    label: '영업',
    priority: 75,
    patterns: [/영업정지/, /회생/, /파산/, /워크아웃/, /자산\s*양수/, /자산\s*양도/],
  },
  {
    id: 'earnings',
    label: '실적',
    priority: 50,
    patterns: [/적자전환/, /영업손실/, /실적\s*악화/, /적자\s*확대/],
  },
])

/**
 * @param {string} text
 * @returns {{ categoryId: string, categoryLabel: string, matched: string, priority: number } | null}
 */
export function classifyAttentionText(text) {
  const source = String(text || '')
  if (!source.trim()) return null

  let best = null
  for (const category of ATTENTION_CATEGORIES) {
    for (const pattern of category.patterns) {
      const match = source.match(pattern)
      if (!match) continue
      const candidate = {
        categoryId: category.id,
        categoryLabel: category.label,
        matched: match[0],
        priority: category.priority,
      }
      if (!best || candidate.priority > best.priority) {
        best = candidate
      }
    }
  }
  return best
}

/**
 * 중요 공시 여부 (공시 제목)
 * @param {string} title
 */
export function isImportantDisclosureTitle(title) {
  const hit = classifyAttentionText(title)
  if (!hit) return false
  return [
    'legal',
    'listing',
    'audit',
    'dilution',
    'governance',
    'operations',
  ].includes(hit.categoryId)
}
