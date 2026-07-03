/**
 * server/reconcile.js — 업로드 포지션 vs 서버 시세 대조
 * 블랙록 Reconciliation 의 개인용 축소판
 */

function getDefaultBasDt() {
  const date = new Date()
  date.setDate(date.getDate() - 1)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

async function fetchPublicData(baseUrl, apiKey, queryParams, label) {
  if (!baseUrl || !apiKey) {
    return null
  }

  const url = new URL(baseUrl)
  url.searchParams.set('serviceKey', apiKey)
  url.searchParams.set('resultType', 'json')
  url.searchParams.set('numOfRows', '10')
  url.searchParams.set('pageNo', '1')
  url.searchParams.set('basDt', getDefaultBasDt())

  Object.entries(queryParams).forEach(([key, value]) => {
    url.searchParams.set(key, String(value))
  })

  const response = await fetch(url.toString())

  if (!response.ok) {
    console.warn(`[reconcile] ${label} HTTP ${response.status}`)
    return null
  }

  return response.json()
}

function parsePrices(json) {
  const items = json?.response?.body?.items?.item
  if (!items) return []

  const list = Array.isArray(items) ? items : [items]

  return list.map((item) => ({
    symbol: item.srtnCd,
    closePrice: Number(item.clpr) || 0,
    name: item.itmsNm,
    date: item.basDt,
  }))
}

async function fetchMarkForSymbol(symbol, env) {
  const stockJson = await fetchPublicData(
    env.STOCK_BASE_URL,
    env.API_KEY,
    { likeSrtnCd: symbol },
    'stock',
  )

  if (stockJson) {
    const match = parsePrices(stockJson).find((p) => p.symbol === symbol)
    if (match) return match
  }

  const etfJson = await fetchPublicData(
    env.BASE_URL,
    env.API_KEY,
    { likeSrtnCd: symbol },
    'etf',
  )

  if (etfJson) {
    return parsePrices(etfJson).find((p) => p.symbol === symbol) ?? null
  }

  return null
}

/**
 * 클라이언트가 올린 최신 스냅샷 포지션 vs 서버가 조회한 시세를 비교합니다.
 */
export async function reconcilePayload(payload, env) {
  const latestSnapshot = payload.snapshots?.[0] ?? payload.snapshots?.at(-1)

  if (!latestSnapshot?.positions?.length) {
    return {
      checkedAt: new Date().toISOString(),
      status: 'no_positions',
      items: [],
    }
  }

  const items = []

  for (const position of latestSnapshot.positions) {
    const clientMark = Number(position.markPrice) || 0
    const serverQuote = await fetchMarkForSymbol(position.symbol, env)
    const serverMark = serverQuote ? Number(serverQuote.closePrice) : null

    let status = 'ok'
    let diffPercent = null

    if (serverMark === null || serverMark <= 0) {
      status = 'no_server_quote'
    } else if (clientMark <= 0) {
      status = 'no_client_mark'
    } else {
      diffPercent = ((clientMark - serverMark) / serverMark) * 100
      if (Math.abs(diffPercent) > 5) {
        status = 'mismatch'
      }
    }

    items.push({
      symbol: position.symbol,
      name: position.name,
      clientMark,
      serverMark,
      diffPercent,
      status,
      serverDate: serverQuote?.date ?? null,
    })
  }

  const mismatchCount = items.filter((item) => item.status === 'mismatch').length

  return {
    checkedAt: new Date().toISOString(),
    status: mismatchCount > 0 ? 'review_needed' : 'ok',
    mismatchCount,
    items,
  }
}
