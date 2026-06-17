const BETS_SHEET_CANDIDATES = ['Bet Log', 'Bets'];
const HEADER_ROW_CANDIDATES = [3, 1];
const CANONICAL_HEADERS = [
  'id', 'date', 'type', 'sportMarket', 'event', 'market', 'selection',
  'sportsbookA', 'oddsA', 'stakeA', 'sportsbookB', 'oddsB', 'stakeB',
  'promoId', 'tokenId', 'expectedProfit', 'status', 'actualProfit',
  'payout', 'notes', 'updatedAt'
];
const HEADER_ALIASES = {
  id: ['id'],
  date: ['date'],
  sportMarket: ['sportMarket', 'sport'],
  event: ['event', 'event / match', 'event/match', 'match'],
  market: ['market', 'market / bet type', 'market/bet type', 'bet type'],
  status: ['status'],
  sportsbookA: ['sportsbookA', 'leg 1 book', 'book 1', 'sportsbook', 'book'],
  selection: ['selection', 'leg 1 side', 'side', 'leg 1 selection'],
  oddsA: ['oddsA', 'leg 1 odds (dec)', 'leg 1 odds', 'odds'],
  stakeA: ['stakeA', 'leg 1 stake ($)', 'leg 1 stake', 'stake'],
  payout: ['payout', 'leg 1 payout ($)', 'winnings'],
  sportsbookB: ['sportsbookB', 'leg 2 book', 'book 2'],
  oddsB: ['oddsB', 'leg 2 odds', 'leg 2 odds (dec)'],
  stakeB: ['stakeB', 'leg 2 stake ($)', 'leg 2 stake'],
  expectedProfit: ['expectedProfit', 'guaranteed profit ($)', 'guaranteed profit'],
  actualProfit: ['actualProfit', 'profit/loss', 'profit loss'],
  notes: ['notes'],
  tokenId: ['tokenId', 'token used'],
  promoId: ['promoId', 'promotion used', 'promo used'],
  type: ['type'],
  updatedAt: ['updatedAt'],
};

function doGet() {
  return jsonResponse({ ok: true, message: 'Betting Dashboard Sync is running.' });
}

function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (payload.action === 'pullBets') return jsonResponse({ ok: true, bets: readBets() });
    if (payload.action === 'pushBets') {
      const count = upsertBets(payload.bets || []);
      return jsonResponse({ ok: true, count });
    }
    return jsonResponse({ ok: false, error: 'Unknown action.' });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function getTargetSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  for (const name of BETS_SHEET_CANDIDATES) {
    const sheet = ss.getSheetByName(name);
    if (sheet) return sheet;
  }
  const sheet = ss.insertSheet('Bets');
  sheet.getRange(1, 1, 1, CANONICAL_HEADERS.length).setValues([CANONICAL_HEADERS]);
  return sheet;
}

function getHeaderInfo(sheet) {
  for (const row of HEADER_ROW_CANDIDATES) {
    if (sheet.getLastRow() < row) continue;
    const values = sheet.getRange(row, 1, 1, Math.max(sheet.getLastColumn(), CANONICAL_HEADERS.length)).getValues()[0];
    if (values.filter(Boolean).length >= 3) return buildHeaderInfo(values, row);
  }
  sheet.getRange(1, 1, 1, CANONICAL_HEADERS.length).setValues([CANONICAL_HEADERS]);
  return buildHeaderInfo(CANONICAL_HEADERS, 1);
}

function buildHeaderInfo(headers, headerRow) {
  const normalized = headers.map((h) => normalizeHeader(h));
  const canonicalToColumn = {};
  Object.keys(HEADER_ALIASES).forEach((canonical) => {
    const aliases = HEADER_ALIASES[canonical].map(normalizeHeader);
    const index = normalized.findIndex((h) => aliases.includes(h));
    if (index >= 0) canonicalToColumn[canonical] = index;
  });
  return { headers, headerRow, canonicalToColumn };
}

function normalizeHeader(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function readBets() {
  const sheet = getTargetSheet();
  const info = getHeaderInfo(sheet);
  const firstDataRow = info.headerRow + 1;
  const lastRow = sheet.getLastRow();
  if (lastRow < firstDataRow) return [];
  return sheet.getRange(firstDataRow, 1, lastRow - info.headerRow, sheet.getLastColumn()).getValues()
    .map((row) => rowToBet(info, row))
    .filter((bet) => bet.id || bet.date || bet.event || bet.selection || bet.sideA?.sportsbook);
}

function rowToBet(info, row) {
  const pick = (canonical) => {
    const col = info.canonicalToColumn[canonical];
    return col == null ? '' : row[col];
  };
  const id = String(pick('id') || Utilities.getUuid());
  const type = pick('type') || 'Arb/Boost';
  return {
    id,
    date: normalizeDate(pick('date')),
    type,
    sportMarket: String(pick('sportMarket') || ''),
    event: String(pick('event') || ''),
    market: String(pick('market') || ''),
    selection: String(pick('selection') || ''),
    sportsbookA: String(pick('sportsbookA') || ''),
    oddsA: pick('oddsA') || '',
    stakeA: pick('stakeA') || '',
    sportsbookB: String(pick('sportsbookB') || ''),
    oddsB: pick('oddsB') || '',
    stakeB: pick('stakeB') || '',
    promoId: String(pick('promoId') || ''),
    tokenId: String(pick('tokenId') || ''),
    expectedProfit: pick('expectedProfit') || '',
    status: String(pick('status') || 'Pending'),
    actualProfit: pick('actualProfit') || '',
    payout: pick('payout') || '',
    notes: String(pick('notes') || ''),
    updatedAt: pick('updatedAt') ? new Date(pick('updatedAt')).toISOString() : new Date().toISOString(),
  };
}

function upsertBets(bets) {
  const sheet = getTargetSheet();
  const info = getHeaderInfo(sheet);
  ensureWritableColumns(sheet, info);
  const refreshed = getHeaderInfo(sheet);
  const existing = readBets();
  const rowById = {};
  existing.forEach((bet, index) => { rowById[bet.id] = refreshed.headerRow + 1 + index; });

  let count = 0;
  bets.forEach((bet) => {
    const normalized = normalizeIncomingBet(bet);
    const rowNumber = rowById[normalized.id] || sheet.getLastRow() + 1;
    writeBet(sheet, refreshed, rowNumber, normalized);
    count += 1;
  });
  return count;
}

function ensureWritableColumns(sheet, info) {
  const missing = CANONICAL_HEADERS.filter((h) => info.canonicalToColumn[h] == null);
  if (!missing.length) return;
  const start = sheet.getLastColumn() + 1;
  sheet.getRange(info.headerRow, start, 1, missing.length).setValues([missing]);
}

function writeBet(sheet, info, rowNumber, bet) {
  Object.keys(bet).forEach((key) => {
    const col = info.canonicalToColumn[key];
    if (col != null) sheet.getRange(rowNumber, col + 1).setValue(bet[key]);
  });
}

function normalizeIncomingBet(bet) {
  const now = new Date().toISOString();
  return {
    id: String(bet.id || Utilities.getUuid()),
    date: normalizeDate(bet.date),
    type: bet.type || 'Manual Bet',
    sportMarket: bet.sportMarket || '',
    event: bet.event || '',
    market: bet.market || '',
    selection: bet.selection || '',
    sportsbookA: bet.sportsbookA || bet.sportsbook || '',
    oddsA: bet.oddsA || bet.odds || '',
    stakeA: bet.stakeA || bet.stake || '',
    sportsbookB: bet.sportsbookB || '',
    oddsB: bet.oddsB || '',
    stakeB: bet.stakeB || '',
    promoId: bet.promoId || bet.promotionId || '',
    tokenId: bet.tokenId || '',
    expectedProfit: bet.expectedProfit || '',
    status: bet.status || 'Pending',
    actualProfit: bet.actualProfit || bet.profitLoss || '',
    payout: bet.payout || bet.winnings || '',
    notes: bet.notes || '',
    updatedAt: bet.updatedAt || now,
  };
}

function normalizeDate(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(value).slice(0, 10);
}
