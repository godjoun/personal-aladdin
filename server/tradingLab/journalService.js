import { getDb } from '../db.js'
import { insertShadowTrade, upsertShadowTradeOutcome } from './shadowTradeRepository.js'
import { getStrategyCheckByShadowTradeId } from './strategyCheckRepository.js'
import { captureIndicatorSnapshot, historicalIndicatorSnapshot } from './indicatorSnapshot.js'
import { findJournalRequest, getJournalDetail, insertJournal, updateJournal } from './journalRepository.js'

export async function createTradeJournal(input, { db = getDb(), capture = captureIndicatorSnapshot } = {}) {
  const previous = findJournalRequest(input.requestId, db)
  if (previous) return { ok: true, ...getJournalDetail(previous, db) }
  const snapshot = await capture(input.symbol, input.timeframe, { db })
  const automaticPrice = !snapshot.marketStale && snapshot.marketStatus === 'OK' ? snapshot.referencePrice : null
  const entryPrice = input.entryPrice ?? automaticPrice
  if (!(entryPrice > 0)) return { ok: false, field: 'entryPrice' }
  return db.transaction(() => {
    // Recheck after the asynchronous capture: retry/double click creates only one trade.
    const duplicate = findJournalRequest(input.requestId, db)
    if (duplicate) return { ok: true, ...getJournalDetail(duplicate, db) }
    const trade = insertShadowTrade({
      symbol: input.symbol, direction: input.direction, entryPrice,
      source: 'MANUAL_USER', status: 'OPEN', strategyVersion: 'journal-v1', recordType: input.recordType,
      entryReason: input.entryReasonText || input.scenarioText, userNote: input.scenarioText,
      userTags: input.fomo ? ['fomo'] : [], primaryState: snapshot.marketState?.primaryState,
      cvdNotional: snapshot.orderFlow?.cvdNotional, buySharePct: snapshot.orderFlow?.buySharePct,
      sellSharePct: snapshot.orderFlow?.sellSharePct, oiChangePct: snapshot.openInterest?.changePct,
      fundingRate: snapshot.funding?.rate, volumeRatio: snapshot.indicators?.volumeRatio,
      longLiquidationNotional: snapshot.liquidations?.long?.estimatedNotional,
      shortLiquidationNotional: snapshot.liquidations?.short?.estimatedNotional,
    }, db)
    insertJournal(trade.id, { ...input, entryPrice }, { ...snapshot, entryPriceSource: input.entryPrice == null ? 'PUBLIC_TICKER' : 'USER_ENTERED' }, db)
    upsertShadowTradeOutcome(trade.id, { evaluatedAt: null, result: 'UNRESOLVED' }, db)
    return { ok: true, ...getJournalDetail(trade.id, db) }
  })()
}

export function saveTradeJournal(shadowTradeId, input, { db = getDb() } = {}) {
  return db.transaction(() => {
    const detail = getJournalDetail(shadowTradeId, db)
    if (!detail) return { notFound: true }
    if (detail.journal) {
      // The immutable snapshot and initial plan are deliberately excluded from updates.
      if (!updateJournal(shadowTradeId, input, db)) return { conflict: true }
    } else {
      if (input.revision !== 0) return { conflict: true }
      const check = getStrategyCheckByShadowTradeId(shadowTradeId, db)
      insertJournal(shadowTradeId, input, historicalIndicatorSnapshot(detail.trade, check), db)
    }
    return { ok: true, ...getJournalDetail(shadowTradeId, db) }
  })()
}
