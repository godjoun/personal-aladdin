/**
 * Additive journal tables. Existing asset / shadow / annotation tables stay untouched.
 * Column names stay camelCase to match shadow_trade and the rest of this SQLite schema.
 * recordedAt is not a column — it lives only inside entryPlanSnapshotJson.
 */
export const TRADE_JOURNAL_COLUMNS = Object.freeze([
  ['id', 'TEXT'],
  ['shadowTradeId', 'TEXT'],
  ['requestId', 'TEXT'],
  ['timeframe', 'TEXT'],
  ['journalTitle', 'TEXT'],
  ['scenarioText', 'TEXT'],
  ['entryReasonText', 'TEXT'],
  ['reasonTagsJson', 'TEXT'],
  ['invalidationPrice', 'REAL'],
  ['hasStopPlan', 'INTEGER'],
  ['hasTargetPlan', 'INTEGER'],
  ['fomo', 'INTEGER'],
  ['riskPlanText', 'TEXT'],
  ['avoidReasonText', 'TEXT'],
  ['reviewText', 'TEXT'],
  ['mistakeText', 'TEXT'],
  ['lessonText', 'TEXT'],
  ['emotionTag', 'TEXT'],
  ['reviewedAt', 'TEXT'],
  ['indicatorSnapshotJson', 'TEXT'],
  ['entryPlanSnapshotJson', 'TEXT'],
  ['revision', 'INTEGER'],
  ['createdAt', 'TEXT'],
  ['updatedAt', 'TEXT'],
])

export const TRADE_JOURNAL_IMAGE_COLUMNS = Object.freeze([
  ['id', 'TEXT'],
  ['journalId', 'TEXT'],
  ['storageName', 'TEXT'],
  ['mimeType', 'TEXT'],
  ['byteSize', 'INTEGER'],
  ['createdAt', 'TEXT'],
])

function addColumnIfMissing(db, table, column, sqlType) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all()
  if (rows.some((row) => row.name === column)) return
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${sqlType}`)
}

export function migrateTradeJournal(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS trade_journal (
      id TEXT PRIMARY KEY,
      shadowTradeId TEXT NOT NULL UNIQUE REFERENCES shadow_trade(id) ON DELETE CASCADE,
      requestId TEXT UNIQUE,
      timeframe TEXT NOT NULL CHECK(timeframe IN ('15m', '1h', '4h')),
      journalTitle TEXT,
      scenarioText TEXT,
      entryReasonText TEXT,
      reasonTagsJson TEXT NOT NULL DEFAULT '[]',
      invalidationPrice REAL CHECK(invalidationPrice IS NULL OR invalidationPrice > 0),
      hasStopPlan INTEGER CHECK(hasStopPlan IS NULL OR hasStopPlan IN (0, 1)),
      hasTargetPlan INTEGER CHECK(hasTargetPlan IS NULL OR hasTargetPlan IN (0, 1)),
      fomo INTEGER CHECK(fomo IS NULL OR fomo IN (0, 1)),
      riskPlanText TEXT,
      avoidReasonText TEXT,
      reviewText TEXT,
      mistakeText TEXT,
      lessonText TEXT,
      emotionTag TEXT,
      reviewedAt TEXT,
      indicatorSnapshotJson TEXT NOT NULL,
      entryPlanSnapshotJson TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS trade_journal_image (
      id TEXT PRIMARY KEY,
      journalId TEXT NOT NULL REFERENCES trade_journal(id) ON DELETE CASCADE,
      storageName TEXT NOT NULL UNIQUE,
      mimeType TEXT NOT NULL,
      byteSize INTEGER NOT NULL,
      createdAt TEXT NOT NULL
    );
  `)

  for (const [column, sqlType] of TRADE_JOURNAL_COLUMNS) {
    addColumnIfMissing(db, 'trade_journal', column, sqlType)
  }
  for (const [column, sqlType] of TRADE_JOURNAL_IMAGE_COLUMNS) {
    addColumnIfMissing(db, 'trade_journal_image', column, sqlType)
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_trade_journal_review ON trade_journal(reviewedAt, createdAt DESC);
    CREATE INDEX IF NOT EXISTS idx_trade_journal_image_journal ON trade_journal_image(journalId);
  `)
}
