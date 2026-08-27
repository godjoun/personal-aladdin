/**
 * dividendForm.js — 배당 입력 폼 검증·페이로드 생성
 * DividendForm UI 와 storage 사이의 순수 로직입니다.
 */

import { getDividendEventAmount } from './dividendCalculator.js'

export const DIVIDEND_STATUSES = ['ESTIMATED', 'CONFIRMED', 'PAID']

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function parseOptionalNonNegativeNumber(value) {
  if (value === '' || value === null || value === undefined) {
    return null
  }

  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) {
    return Number.NaN
  }

  return number
}

/**
 * 폼 입력값을 검증하고 storage 에 넣을 payload 를 만듭니다.
 *
 * @param {Object} input
 * @returns {{ ok: true, payload: Object, displayAmount: number } | { ok: false, error: string }}
 */
export function validateAndBuildDividendPayload(input = {}) {
  const fundName = String(input.fundName ?? '').trim()
  const symbol = String(input.symbol ?? '').trim()
  const paymentDate = String(input.paymentDate ?? '').trim()
  const status = String(input.status ?? '').trim()
  const sourceRaw = String(input.source ?? '').trim()
  const recordDateRaw = String(input.recordDate ?? '').trim()
  const exDateRaw = String(input.exDate ?? '').trim()

  if (!fundName) {
    return { ok: false, error: '종목명을 입력해 주세요.' }
  }

  if (!symbol) {
    return { ok: false, error: '종목코드를 입력해 주세요.' }
  }

  if (!paymentDate) {
    return { ok: false, error: '지급일을 입력해 주세요.' }
  }

  if (!DIVIDEND_STATUSES.includes(status)) {
    return { ok: false, error: '상태는 예정/확정/지급완료 중 하나여야 합니다.' }
  }

  const quantity = parseOptionalNonNegativeNumber(input.quantity)
  if (!Number.isFinite(quantity) || quantity === null) {
    return { ok: false, error: '보유수량은 0 이상의 숫자여야 합니다.' }
  }
  if (quantity < 0) {
    return { ok: false, error: '보유수량은 음수일 수 없습니다.' }
  }

  const distributionPerShare = parseOptionalNonNegativeNumber(
    input.distributionPerShare,
  )
  if (!Number.isFinite(distributionPerShare) || distributionPerShare === null) {
    return { ok: false, error: '주당 분배금은 0 이상의 숫자여야 합니다.' }
  }
  if (distributionPerShare < 0) {
    return { ok: false, error: '주당 분배금은 음수일 수 없습니다.' }
  }

  const expectedAmount = parseOptionalNonNegativeNumber(input.expectedAmount)
  if (Number.isNaN(expectedAmount)) {
    return { ok: false, error: '예상금액은 숫자여야 합니다.' }
  }
  if (expectedAmount !== null && expectedAmount < 0) {
    return { ok: false, error: '예상금액은 음수일 수 없습니다.' }
  }

  const confirmedAmount = parseOptionalNonNegativeNumber(input.confirmedAmount)
  if (Number.isNaN(confirmedAmount)) {
    return { ok: false, error: '확정금액은 숫자여야 합니다.' }
  }
  if (confirmedAmount !== null && confirmedAmount < 0) {
    return { ok: false, error: '확정금액은 음수일 수 없습니다.' }
  }

  const payload = {
    fundName,
    symbol,
    paymentDate,
    quantity,
    distributionPerShare,
    status,
    expectedAmount,
    confirmedAmount,
    source: sourceRaw || null,
    recordDate: recordDateRaw || null,
    exDate: exDateRaw || null,
  }

  const displayAmount = getDividendEventAmount(payload)

  return {
    ok: true,
    payload,
    displayAmount,
  }
}

/**
 * 기존 DividendEvent → 폼 초기값
 *
 * @param {Object | null | undefined} event
 * @returns {Object}
 */
export function dividendEventToFormValues(event) {
  if (!event) {
    return {
      assetId: '',
      fundName: '',
      symbol: '',
      paymentDate: '',
      quantity: '',
      distributionPerShare: '',
      status: 'ESTIMATED',
      expectedAmount: '',
      confirmedAmount: '',
      source: '',
      recordDate: '',
      exDate: '',
    }
  }

  return {
    assetId: '',
    fundName: event.fundName ?? '',
    symbol: event.symbol ?? '',
    paymentDate: event.paymentDate ?? '',
    quantity: event.quantity ?? '',
    distributionPerShare: event.distributionPerShare ?? '',
    status: event.status ?? 'ESTIMATED',
    expectedAmount: event.expectedAmount ?? '',
    confirmedAmount: event.confirmedAmount ?? '',
    source: event.source ?? '',
    recordDate: event.recordDate ?? '',
    exDate: event.exDate ?? '',
  }
}
