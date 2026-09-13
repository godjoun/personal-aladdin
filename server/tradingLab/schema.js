/**
 * schema.js — Trading Lab SQLite 테이블
 *
 * 기존 자산/배당/세션 테이블과 분리된 Trading Lab 전용 스키마.
 * db.js migrate() 에서 호출된다.
 *
 * 설계 메모
 * - 시장 지표는 provider 미연결/부분 실패가 정상 상황이므로 전부 nullable.
 * - 조건별 통계(예: OI 증가 + funding 음수 조합의 결과)를 SQL 로 집계할 수 있도록
 *   snapshot 을 JSON blob 이 아닌 개별 컬럼으로 저장한다.
 */

/**
 * @param {import('better-sqlite3').Database} db
 */
import { migrateTradeJournal } from './journalSchema.js'

export function migrateTradingLab(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS trade_analysis (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      referencePrice REAL,

      bias TEXT NOT NULL,
      confidence INTEGER,

      timeframe15m TEXT,
      timeframe1h TEXT,
      timeframe4h TEXT,

      reasoningJson TEXT,
      cautionsJson TEXT,
      invalidationPrice REAL,
      notes TEXT,

      volume REAL,
      volumeZScore REAL,
      openInterest REAL,
      openInterestChange REAL,
      fundingRate REAL,
      cvd REAL,
      liquidationAbove REAL,
      liquidationBelow REAL,

      marketDataStatus TEXT,
      marketDataSource TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_trade_analysis_symbol_created
      ON trade_analysis(symbol, createdAt DESC);

    CREATE INDEX IF NOT EXISTS idx_trade_analysis_bias
      ON trade_analysis(bias);

    CREATE TABLE IF NOT EXISTS trade_analysis_outcomes (
      id TEXT PRIMARY KEY,
      analysisId TEXT NOT NULL UNIQUE
        REFERENCES trade_analysis(id) ON DELETE CASCADE,
      evaluatedAt TEXT,

      price1h REAL,
      price4h REAL,
      price12h REAL,
      price24h REAL,

      maxFavorableMove REAL,
      maxAdverseMove REAL,

      result TEXT NOT NULL DEFAULT 'UNRESOLVED',
      notes TEXT,

      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_trade_analysis_outcomes_result
      ON trade_analysis_outcomes(result);

    CREATE TABLE IF NOT EXISTS liquidation_snapshot (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      referencePrice REAL,

      side TEXT NOT NULL,
      priceLevel REAL,
      estimatedValue REAL,

      source TEXT,
      sourceType TEXT NOT NULL,
      note TEXT,

      createdAt TEXT NOT NULL,
      receivedAt TEXT,
      quantity REAL,
      rawSide TEXT,
      sourceKey TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_liquidation_snapshot_symbol_ts
      ON liquidation_snapshot(symbol, timestamp DESC);

    CREATE INDEX IF NOT EXISTS idx_liquidation_snapshot_level
      ON liquidation_snapshot(symbol, priceLevel);

    CREATE TABLE IF NOT EXISTS trade_analysis_screenshot (
      id TEXT PRIMARY KEY,
      analysisId TEXT
        REFERENCES trade_analysis(id) ON DELETE CASCADE,
      symbol TEXT NOT NULL,
      timeframe TEXT NOT NULL,
      capturedAt TEXT,
      note TEXT,
      imageRef TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_trade_analysis_screenshot_analysis
      ON trade_analysis_screenshot(analysisId);
  `)

  addColumnIfMissing(db, 'liquidation_snapshot', 'receivedAt', 'TEXT')
  addColumnIfMissing(db, 'liquidation_snapshot', 'quantity', 'REAL')
  addColumnIfMissing(db, 'liquidation_snapshot', 'rawSide', 'TEXT')
  addColumnIfMissing(db, 'liquidation_snapshot', 'sourceKey', 'TEXT')

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_liquidation_snapshot_symbol_type_ts
      ON liquidation_snapshot(symbol, sourceType, timestamp DESC);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_liquidation_snapshot_source_key
      ON liquidation_snapshot(sourceKey)
      WHERE sourceKey IS NOT NULL;

    CREATE TABLE IF NOT EXISTS trade_flow_bucket (
      symbol TEXT NOT NULL,
      bucketStart TEXT NOT NULL,
      intervalSeconds INTEGER NOT NULL,
      buyVolume REAL NOT NULL DEFAULT 0,
      sellVolume REAL NOT NULL DEFAULT 0,
      buyNotional REAL NOT NULL DEFAULT 0,
      sellNotional REAL NOT NULL DEFAULT 0,
      tradeCount INTEGER NOT NULL DEFAULT 0,
      deltaVolume REAL NOT NULL DEFAULT 0,
      deltaNotional REAL NOT NULL DEFAULT 0,
      updatedAt TEXT NOT NULL,
      PRIMARY KEY (symbol, bucketStart, intervalSeconds)
    );

    CREATE INDEX IF NOT EXISTS idx_trade_flow_bucket_symbol_start
      ON trade_flow_bucket(symbol, bucketStart);

    CREATE TABLE IF NOT EXISTS trade_flow_aggregate (
      symbol TEXT NOT NULL,
      bucketStart TEXT NOT NULL,
      intervalSeconds INTEGER NOT NULL,
      buyVolume REAL NOT NULL DEFAULT 0,
      sellVolume REAL NOT NULL DEFAULT 0,
      buyNotional REAL NOT NULL DEFAULT 0,
      sellNotional REAL NOT NULL DEFAULT 0,
      tradeCount INTEGER NOT NULL DEFAULT 0,
      deltaVolume REAL NOT NULL DEFAULT 0,
      deltaNotional REAL NOT NULL DEFAULT 0,
      updatedAt TEXT NOT NULL,
      PRIMARY KEY (symbol, bucketStart, intervalSeconds)
    );

    CREATE INDEX IF NOT EXISTS idx_trade_flow_aggregate_symbol_start
      ON trade_flow_aggregate(symbol, bucketStart);

    CREATE TABLE IF NOT EXISTS market_state_observation (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      evaluatedAt TEXT NOT NULL,
      bucketStart TEXT NOT NULL,
      primaryState TEXT NOT NULL,
      secondaryStatesJson TEXT,
      strengthScore INTEGER NOT NULL,
      referencePrice REAL,
      priceChange15m REAL,
      priceChange1h REAL,
      priceChange4h REAL,
      volumeRatio REAL,
      oiChangePct REAL,
      fundingRate REAL,
      cvdNotional REAL,
      buySharePct REAL,
      sellSharePct REAL,
      longLiquidationNotional REAL,
      shortLiquidationNotional REAL,
      evidenceJson TEXT,
      counterEvidenceJson TEXT,
      contextJson TEXT,
      UNIQUE (symbol, bucketStart)
    );

    CREATE INDEX IF NOT EXISTS idx_market_state_obs_symbol_eval
      ON market_state_observation(symbol, evaluatedAt DESC);

    CREATE TABLE IF NOT EXISTS shadow_trade (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      direction TEXT NOT NULL,
      source TEXT NOT NULL,
      status TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      entryPrice REAL NOT NULL,
      entryReason TEXT,
      strategyVersion TEXT NOT NULL,
      marketStateObservationId TEXT,
      strengthScore INTEGER,
      primaryState TEXT,
      secondaryStatesJson TEXT,
      timeframe15m TEXT,
      timeframe1h TEXT,
      timeframe4h TEXT,
      cvdNotional REAL,
      buySharePct REAL,
      sellSharePct REAL,
      oiChangePct REAL,
      fundingRate REAL,
      volumeRatio REAL,
      longLiquidationNotional REAL,
      shortLiquidationNotional REAL,
      userTagsJson TEXT,
      userNote TEXT,
      recordType TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_shadow_trade_symbol_created
      ON shadow_trade(symbol, createdAt DESC);

    CREATE INDEX IF NOT EXISTS idx_shadow_trade_status
      ON shadow_trade(status, createdAt DESC);

    CREATE TABLE IF NOT EXISTS shadow_trade_outcome (
      shadowTradeId TEXT NOT NULL UNIQUE
        REFERENCES shadow_trade(id) ON DELETE CASCADE,
      evaluatedAt TEXT,
      price1h REAL,
      price4h REAL,
      price12h REAL,
      price24h REAL,
      return1hPct REAL,
      return4hPct REAL,
      return12hPct REAL,
      return24hPct REAL,
      maxFavorableMovePct REAL,
      maxAdverseMovePct REAL,
      result TEXT NOT NULL DEFAULT 'UNRESOLVED',
      feeAdjustedReturnPct REAL,
      assumedFeeBps INTEGER,
      assumedSlippageBps INTEGER,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS shadow_trade_candidate (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      direction TEXT NOT NULL,
      primaryState TEXT NOT NULL,
      strengthScore INTEGER,
      evaluatedAt TEXT NOT NULL,
      bucketStart TEXT NOT NULL,
      reason TEXT,
      UNIQUE (symbol, direction, bucketStart)
    );

    CREATE TABLE IF NOT EXISTS shadow_trade_setting (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS strategy_check (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      direction TEXT NOT NULL,
      checkedAt TEXT NOT NULL,
      strategyVersion TEXT NOT NULL,
      score REAL NOT NULL,
      result TEXT NOT NULL,
      selectedTagsJson TEXT,
      autoEvidenceJson TEXT,
      missingItemsJson TEXT,
      riskWarningsJson TEXT,
      marketStateSnapshotJson TEXT,
      shadowTradeId TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_strategy_check_symbol_checked
      ON strategy_check(symbol, checkedAt DESC);

    CREATE TABLE IF NOT EXISTS chart_annotation (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      timeframe TEXT NOT NULL,
      annotationType TEXT NOT NULL,
      startTime TEXT,
      endTime TEXT,
      price REAL,
      topPrice REAL,
      bottomPrice REAL,
      memo TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      deletedAt TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_chart_annotation_symbol_tf
      ON chart_annotation(symbol, timeframe, createdAt DESC);
  `)

  addColumnIfMissing(db, 'shadow_trade', 'recordType', 'TEXT')
  migrateTradeJournal(db)
}

/**
 * 기존 DB 에 additive column 만 추가한다.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} table
 * @param {string} column
 * @param {string} sqlType
 */
function addColumnIfMissing(db, table, column, sqlType) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all()
  if (rows.some((row) => row.name === column)) return
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${sqlType}`)
}
