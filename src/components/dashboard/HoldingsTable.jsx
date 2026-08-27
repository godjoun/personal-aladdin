import { useMemo, useState } from 'react'
import {
  formatCurrency,
  formatPercent,
  formatProfitLoss,
  getPnlClass,
} from '../../utils/formatters.js'

function formatQuantity(value) {
  if (value === null || value === undefined || value === '') return '—'
  const num = Number(value)
  if (!Number.isFinite(num)) return '—'
  return new Intl.NumberFormat('ko-KR').format(num)
}

const SORT_KEYS = {
  holdingValue: 'holdingValue',
  profitLoss: 'profitLoss',
  profitRate: 'profitRate',
}

function HoldingsTable({
  assetRows,
  onDeleteAsset,
  hideTitle = false,
  accountFilter = 'all',
  searchQuery = '',
  onSearchQueryChange,
}) {
  const [sortKey, setSortKey] = useState('holdingValue')
  const [sortDir, setSortDir] = useState('desc')

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'))
      return
    }
    setSortKey(key)
    setSortDir('desc')
  }

  const filteredRows = useMemo(() => {
    let rows = Array.isArray(assetRows) ? [...assetRows] : []

    if (accountFilter === 'isa') {
      rows = rows.filter((row) => row.accountType === 'isa')
    } else if (accountFilter === 'general') {
      rows = rows.filter((row) => row.accountType === 'general')
    }

    const q = String(searchQuery || '')
      .trim()
      .toLowerCase()
    if (q) {
      rows = rows.filter((row) => {
        const name = String(row.name || '').toLowerCase()
        const symbol = String(row.symbol || '').toLowerCase()
        return name.includes(q) || symbol.includes(q)
      })
    }

    rows.sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      const aNull = av == null || !Number.isFinite(Number(av))
      const bNull = bv == null || !Number.isFinite(Number(bv))
      if (aNull && bNull) return 0
      if (aNull) return 1
      if (bNull) return -1
      const diff = Number(av) - Number(bv)
      return sortDir === 'asc' ? diff : -diff
    })

    return rows
  }, [assetRows, accountFilter, searchQuery, sortKey, sortDir])

  function sortLabel(key) {
    if (sortKey !== key) return ''
    return sortDir === 'asc' ? ' ↑' : ' ↓'
  }

  return (
    <div className="simple-dash__table-section">
      {!hideTitle && <h2 className="simple-dash__section-title">보유 종목</h2>}

      <div className="simple-dash__holdings-tools">
        <input
          className="simple-dash__search"
          type="search"
          value={searchQuery}
          onChange={(event) => onSearchQueryChange?.(event.target.value)}
          placeholder="종목 검색..."
          aria-label="종목 검색"
        />
        <p className="simple-dash__holdings-count">
          {filteredRows.length}종목
        </p>
      </div>

      <div className="simple-dash__table-wrap simple-dash__table-wrap--scroll">
        <table className="simple-dash__table">
          <thead>
            <tr>
              <th>계좌</th>
              <th>종목명</th>
              <th>수량</th>
              <th>평균매수가</th>
              <th>현재가</th>
              <th>
                <button
                  type="button"
                  className="simple-dash__sort-btn"
                  onClick={() => toggleSort(SORT_KEYS.holdingValue)}
                >
                  평가금액{sortLabel(SORT_KEYS.holdingValue)}
                </button>
              </th>
              <th>
                <button
                  type="button"
                  className="simple-dash__sort-btn"
                  onClick={() => toggleSort(SORT_KEYS.profitLoss)}
                >
                  평가손익{sortLabel(SORT_KEYS.profitLoss)}
                </button>
              </th>
              <th>
                <button
                  type="button"
                  className="simple-dash__sort-btn"
                  onClick={() => toggleSort(SORT_KEYS.profitRate)}
                >
                  수익률{sortLabel(SORT_KEYS.profitRate)}
                </button>
              </th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => (
              <tr key={row.id}>
                <td data-label="계좌">
                  <span className="simple-dash__account">
                    {row.accountLabel || '—'}
                  </span>
                </td>
                <td data-label="종목명">
                  <span className="simple-dash__asset-name">{row.name}</span>
                  <span className="simple-dash__asset-symbol">{row.symbol || '—'}</span>
                </td>
                <td data-label="수량" className="simple-dash__mono">
                  {formatQuantity(row.quantity)}
                </td>
                <td data-label="평균매수가" className="simple-dash__mono">
                  {formatCurrency(row.averageBuyPrice)}
                </td>
                <td data-label="현재가" className="simple-dash__mono">
                  {row.latestPrice != null ? formatCurrency(row.latestPrice) : '—'}
                </td>
                <td data-label="평가금액" className="simple-dash__mono">
                  {row.holdingValue != null ? formatCurrency(row.holdingValue) : '—'}
                </td>
                <td
                  data-label="평가손익"
                  className={`simple-dash__mono ${getPnlClass(row.profitLoss)}`}
                >
                  {row.profitLoss != null ? formatProfitLoss(row.profitLoss) : '—'}
                </td>
                <td
                  data-label="수익률"
                  className={`simple-dash__mono ${getPnlClass(row.profitRate)}`}
                >
                  {row.profitRate != null ? formatPercent(row.profitRate) : '—'}
                </td>
                <td data-label="삭제">
                  {row.canDelete ? (
                    <button
                      type="button"
                      className="simple-dash__delete-btn"
                      onClick={() => onDeleteAsset(row.id)}
                      aria-label={`${row.name} 삭제`}
                    >
                      삭제
                    </button>
                  ) : (
                    <span className="simple-dash__cell-muted">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default HoldingsTable
