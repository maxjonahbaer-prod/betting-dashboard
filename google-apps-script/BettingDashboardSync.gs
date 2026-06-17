const BETS_SHEET_NAME = 'Bets';
const HEADERS = [
  'id', 'date', 'type', 'sportMarket', 'event', 'market', 'selection',
  'sportsbookA', 'oddsA', 'stakeA', 'sportsbookB', 'oddsB', 'stakeB',
  'promoId', 'tokenId', 'expectedProfit', 'status', 'actualProfit',
  'payout', 'notes', 'updatedAt'
];

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
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getBetsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(BETS_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(BETS_SHEET_NAME);
  ensureHeaders(sheet);
  return sheet;
}

function ensureHeaders(sheet) {
  const current = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), HEADERS.length)).getValues()[0];
  const hasAnyHeader = current.some(Boolean);
  if (!hasAnyHeader) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    return;
  }
  const currentHeaders = current.map(String);
  const missing = HEADERS.filter((h) => !currentHeaders.includes(h));
  if (missing.length) {
    sheet.getRange(1, currentHeaders.filter(Boolean).length + 1, 1, missing.length).setValues([missing]);
  }
}

function headerMap(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const map = {};
  headers.forEach((h, i) => { if (h) map[h] = i; });
  return { headers, map };
}

function readBets() {
  const sheet = getBetsSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const { headers } = headerMap(sheet);
  return sheet.getRange(2, 1, lastRow - 1, headers.length).getValues()
    .map((row) => rowToBet(headers, row))
    .filter((bet) => bet.id || bet.date || bet.event || bet.selection);
}

function rowToBet(headers, row) {
  const obj = {};
  headers.forEach((header, i) => { obj[header] = row[i] == null ? '' : row[i]; });
  obj.id = String(obj.id || Utilities.getUuid());
  obj.date = normalizeDate(obj.date);
  obj.updatedAt = obj.updatedAt ? new Date(obj.updatedAt).toISOString() : new Date().toISOString();
  return obj;
}

function upsertBets(bets) {
  const sheet = getBetsSheet();
  const { headers, map } = headerMap(sheet);
  const existing = readBets();
  const rowById = {};
  existing.forEach((bet, index) => { rowById[bet.id] = index + 2; });

  let count = 0;
  bets.forEach((bet) => {
    const normalized = normalizeIncomingBet(bet);
    const row = headers.map((header) => normalized[header] == null ? '' : normalized[header]);
    const rowNumber = rowById[normalized.id];
    if (rowNumber) sheet.getRange(rowNumber, 1, 1, headers.length).setValues([row]);
    else sheet.appendRow(row);
    count += 1;
  });
  return count;
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
