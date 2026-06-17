export const BET_SHEET_HEADERS = [
  'id',
  'date',
  'type',
  'sportMarket',
  'event',
  'market',
  'selection',
  'sportsbookA',
  'oddsA',
  'stakeA',
  'sportsbookB',
  'oddsB',
  'stakeB',
  'promoId',
  'tokenId',
  'expectedProfit',
  'status',
  'actualProfit',
  'payout',
  'notes',
  'updatedAt',
]

export function normalizeBetEntry(entry) {
  return {
    id: entry.id || '',
    date: entry.date || '',
    type: entry.type || 'Manual Bet',
    sportMarket: entry.sportMarket || '',
    event: entry.event || '',
    market: entry.market || '',
    selection: entry.selection || '',
    sideA: {
      sportsbook: entry.sideA?.sportsbook || entry.sportsbookA || entry.sportsbook || '',
      odds: entry.sideA?.odds ?? entry.oddsA ?? entry.odds ?? '',
      stake: entry.sideA?.stake ?? entry.stakeA ?? entry.stake ?? '',
    },
    sideB: {
      sportsbook: entry.sideB?.sportsbook || entry.sportsbookB || '',
      odds: entry.sideB?.odds ?? entry.oddsB ?? '',
      stake: entry.sideB?.stake ?? entry.stakeB ?? '',
    },
    promoId: entry.promoId || entry.promotionId || '',
    tokenId: entry.tokenId || '',
    expectedProfit: entry.expectedProfit ?? '',
    status: entry.status || 'Pending',
    actualProfit: entry.actualProfit ?? entry.profitLoss ?? '',
    payout: entry.payout ?? entry.winnings ?? '',
    notes: entry.notes || '',
    updatedAt: entry.updatedAt || new Date().toISOString(),
  }
}

export function flattenBetEntry(entry) {
  const x = normalizeBetEntry(entry)
  return {
    id: x.id,
    date: x.date,
    type: x.type,
    sportMarket: x.sportMarket,
    event: x.event,
    market: x.market,
    selection: x.selection,
    sportsbookA: x.sideA.sportsbook,
    oddsA: x.sideA.odds,
    stakeA: x.sideA.stake,
    sportsbookB: x.sideB.sportsbook,
    oddsB: x.sideB.odds,
    stakeB: x.sideB.stake,
    promoId: x.promoId,
    tokenId: x.tokenId,
    expectedProfit: x.expectedProfit,
    status: x.status,
    actualProfit: x.actualProfit,
    payout: x.payout,
    notes: x.notes,
    updatedAt: x.updatedAt,
  }
}

function mergeByUpdatedAt(localRows, remoteRows) {
  const byId = new Map()
  localRows.forEach((row) => byId.set(row.id, normalizeBetEntry(row)))
  remoteRows.forEach((row) => {
    const next = normalizeBetEntry(row)
    if (!next.id) return
    const current = byId.get(next.id)
    if (!current || new Date(next.updatedAt || 0) >= new Date(current.updatedAt || 0)) {
      byId.set(next.id, next)
    }
  })
  return Array.from(byId.values()).sort((a, b) => String(b.date).localeCompare(String(a.date)))
}

async function syncRequest(scriptUrl, payload) {
  if (!scriptUrl) throw new Error('Add your Google Apps Script Web App URL first.')
  const res = await fetch('/api/sheets-sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scriptUrl, payload }),
  })
  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(text || `Google Sheets sync failed with HTTP ${res.status}.`)
  }
  if (!res.ok || data.ok === false) throw new Error(data.error || `Google Sheets sync failed with HTTP ${res.status}.`)
  return data
}

export async function pullBetsFromSheet(scriptUrl, currentLog = []) {
  const data = await syncRequest(scriptUrl, { action: 'pullBets' })
  const remoteRows = Array.isArray(data.bets) ? data.bets : []
  return mergeByUpdatedAt(currentLog, remoteRows)
}

export async function pushBetsToSheet(scriptUrl, log = []) {
  const bets = log.map((entry) => flattenBetEntry(entry))
  return syncRequest(scriptUrl, { action: 'pushBets', bets })
}

export async function syncBetsWithSheet(scriptUrl, currentLog = []) {
  const merged = await pullBetsFromSheet(scriptUrl, currentLog)
  await pushBetsToSheet(scriptUrl, merged)
  return merged
}
