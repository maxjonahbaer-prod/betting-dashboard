// ============================================================================
// tokenStore — standalone data layer for the Promo Token Library.
//
// This module is the SINGLE source of truth for the token schema and is
// intentionally decoupled from React/UI. Today it persists to localStorage;
// to move to a backend later, swap the body of loadTokens/saveTokens for API
// calls and nothing in the UI needs to change.
//
// The stored schema is the snake_case JSON shape described in the project
// spec. A future AI agent reads these records verbatim, so field names and
// nullability are kept precise.
// ============================================================================

import { useState, useCallback } from 'react'

export const STORAGE_KEY = 'promo_token_library_v1'

// ---------------------------------------------------------------------------
// Enums — the canonical allowed values for constrained fields.
// ---------------------------------------------------------------------------
export const PROMO_TYPES = [
  'profit_boost',
  'odds_boost',
  'parlay_boost',
  'sgp_boost',
  'free_bet',
  'bonus_bet',
  'bet_protection',
  'risk_free_bet',
  'early_win',
  'draw_refund',
  'deposit_match',
  'reload_bonus',
  'predictions_bonus',
  'other',
]

export const STATUSES = ['available', 'used', 'expired', 'voided']

export const BOOST_APPLIES_TO = ['net_winnings', 'gross_payout']

export const PROTECTION_TYPES = ['cash', 'bonus_bet']

// Canonical bet-type values used by eligible_bet_types. excluded_bet_types is a
// free tag input because sportsbook fine print uses many ad-hoc exclusions
// (odds_boosts, bonus_bets, cashed_out, live, progressive_parlay, …).
export const BET_TYPES = ['straight', 'parlay', 'sgp', 'sgpx']

export const BET_TYPE_LABELS = {
  straight: 'Straight',
  parlay: 'Parlay',
  sgp: 'SGP',
  sgpx: 'SGPx',
}

// Suggestions only — these fields accept free text / arbitrary values too.
export const COMMON_SPORTS = [
  'Soccer', 'Baseball', 'Basketball', 'Golf', 'NFL', 'NHL', 'Tennis', 'MMA',
]
export const COMMON_LEAGUES = [
  'World Cup', 'MLB', 'WNBA', 'US Open Championship', 'NBA', 'NFL', 'NHL',
]
export const COMMON_MARKETS = [
  'Moneyline', '3-way moneyline', 'Spread', 'Over/Under', 'Total', 'SGP', 'SGPx', 'Make the Cut', 'First Round Leader',
]

// Human-friendly labels for enum values (UI display only — stored value stays canonical).
export const PROMO_TYPE_LABELS = {
  profit_boost: 'Profit Boost',
  odds_boost: 'Odds Boost',
  parlay_boost: 'Parlay Boost',
  sgp_boost: 'SGP Boost',
  free_bet: 'Free Bet',
  bonus_bet: 'Bonus Bet',
  bet_protection: 'Bet Protection',
  risk_free_bet: 'Risk-Free Bet',
  early_win: 'Early Win',
  draw_refund: 'Draw Refund',
  deposit_match: 'Deposit Match',
  reload_bonus: 'Reload Bonus',
  predictions_bonus: 'Predictions Bonus',
  other: 'Other',
}

export const STATUS_LABELS = {
  available: 'Available',
  used: 'Used',
  expired: 'Expired',
  voided: 'Voided',
}

export const BOOST_APPLIES_TO_LABELS = {
  net_winnings: 'Net winnings',
  gross_payout: 'Gross payout',
}

export const PROTECTION_TYPE_LABELS = {
  cash: 'Cash',
  bonus_bet: 'Bonus bet',
}

export function promoTypeLabel(v) {
  return PROMO_TYPE_LABELS[v] || v || '—'
}

// ---------------------------------------------------------------------------
// Which optional rule sections apply to which promo types. Used by the form
// to collapse irrelevant sections, and elsewhere for display decisions.
// ---------------------------------------------------------------------------
export const BOOST_PROMO_TYPES = ['profit_boost', 'odds_boost', 'parlay_boost', 'sgp_boost']
export const FREE_BET_PROMO_TYPES = ['free_bet', 'bonus_bet', 'predictions_bonus']
export const PROTECTION_PROMO_TYPES = ['bet_protection', 'risk_free_bet', 'draw_refund']
export const DEPOSIT_MATCH_PROMO_TYPES = ['deposit_match', 'reload_bonus']
export const EARLY_WIN_PROMO_TYPES = ['early_win']

export function sectionsForType(promoType) {
  return {
    boost: BOOST_PROMO_TYPES.includes(promoType),
    freeBet: FREE_BET_PROMO_TYPES.includes(promoType),
    protection: PROTECTION_PROMO_TYPES.includes(promoType),
    depositMatch: DEPOSIT_MATCH_PROMO_TYPES.includes(promoType),
    earlyWin: EARLY_WIN_PROMO_TYPES.includes(promoType),
  }
}

// ---------------------------------------------------------------------------
// id + timestamps
// ---------------------------------------------------------------------------
export function uuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // RFC4122-ish fallback for environments without crypto.randomUUID.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export function nowISO() {
  return new Date().toISOString()
}

export function todayISODate() {
  return new Date().toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// Schema factory — a fully-populated, valid empty token. Every field present
// so the form and the AI context block never read `undefined`.
// ---------------------------------------------------------------------------
export function emptyToken() {
  const ts = nowISO()
  return {
    id: uuid(),
    template_id: null,
    created_at: ts,
    updated_at: ts,

    sportsbook: '',
    promo_name: '',
    promo_type: 'profit_boost',
    token_id: '',

    status: 'available',
    expiry_date: null,
    received_date: todayISODate(),
    used_date: null,

    boost_percentage: null,
    max_wager_amount: null,
    min_odds: null,
    max_odds: null,
    boost_applies_to: null,

    free_bet_amount: null,
    stake_returned_on_free_bet: false,

    protection_amount: null,
    protection_type: null,
    protection_max_refund: null,

    deposit_match_percentage: null,
    deposit_match_max: null,
    deposit_match_rollover: null,

    eligible_sports: [],
    eligible_leagues: [],
    eligible_markets: [],
    eligible_bet_types: [],
    min_legs: null,
    excluded_bet_types: [],
    excluded_markets: [],

    early_win_trigger: null,

    combinable_with_other_promos: false,
    one_time_use: true,
    requires_cash_funds: false,
    max_uses_per_account: null,

    hedge_math_notes: '',
    ai_extraction_formula: '',
    notes: '',

    linked_bet_ids: [],
  }
}

// ---------------------------------------------------------------------------
// Normalization — coerce an arbitrary object (e.g. from an imported file or
// a legacy record) into the current schema shape, filling missing fields with
// defaults so the rest of the app can trust the shape.
// ---------------------------------------------------------------------------
const NUMBER_OR_NULL_FIELDS = [
  'boost_percentage', 'max_wager_amount', 'protection_amount', 'protection_max_refund',
  'deposit_match_percentage', 'deposit_match_max', 'deposit_match_rollover', 'max_uses_per_account',
  'min_legs',
]
const ARRAY_FIELDS = [
  'eligible_sports', 'eligible_leagues', 'eligible_markets', 'eligible_bet_types',
  'excluded_bet_types', 'excluded_markets', 'linked_bet_ids',
]

function toNumberOrNull(v) {
  if (v === '' || v == null) return null
  const n = Number(v)
  return Number.isNaN(n) ? null : n
}

export function normalizeToken(raw) {
  const base = emptyToken()
  if (!raw || typeof raw !== 'object') return base
  const t = { ...base, ...raw }

  // Preserve a real id/timestamps if present, otherwise keep the generated ones.
  t.id = raw.id || base.id
  t.created_at = raw.created_at || base.created_at
  t.updated_at = raw.updated_at || base.updated_at

  // Enforce enum membership; fall back to defaults if out of range.
  if (!PROMO_TYPES.includes(t.promo_type)) t.promo_type = 'other'
  if (!STATUSES.includes(t.status)) t.status = 'available'
  if (t.boost_applies_to != null && !BOOST_APPLIES_TO.includes(t.boost_applies_to)) t.boost_applies_to = null
  if (t.protection_type != null && !PROTECTION_TYPES.includes(t.protection_type)) t.protection_type = null

  NUMBER_OR_NULL_FIELDS.forEach((f) => { t[f] = toNumberOrNull(t[f]) })
  ARRAY_FIELDS.forEach((f) => { if (!Array.isArray(t[f])) t[f] = [] })

  t.stake_returned_on_free_bet = Boolean(t.stake_returned_on_free_bet)
  t.combinable_with_other_promos = Boolean(t.combinable_with_other_promos)
  t.one_time_use = Boolean(t.one_time_use)
  t.requires_cash_funds = Boolean(t.requires_cash_funds)

  t.template_id = raw.template_id || null

  // Optional string fields normalized to '' / null appropriately.
  ;['sportsbook', 'promo_name', 'token_id', 'hedge_math_notes', 'ai_extraction_formula', 'notes'].forEach((f) => {
    if (t[f] == null) t[f] = ''
  })
  ;['expiry_date', 'used_date', 'min_odds', 'max_odds', 'early_win_trigger'].forEach((f) => {
    if (t[f] === '') t[f] = null
  })
  if (!t.received_date) t.received_date = todayISODate()

  return t
}

// ---------------------------------------------------------------------------
// Persistence — swap these two functions to move off localStorage.
// ---------------------------------------------------------------------------
function storageAvailable() {
  try {
    const k = '__token_store_test__'
    window.localStorage.setItem(k, '1')
    window.localStorage.removeItem(k)
    return true
  } catch {
    return false
  }
}

export const STORAGE_OK = typeof window !== 'undefined' && storageAvailable()

export function loadTokens() {
  if (!STORAGE_OK) return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map(normalizeToken)
  } catch {
    // Corrupt data — fail soft to an empty library rather than crashing the UI.
    return []
  }
}

export function saveTokens(tokens) {
  if (!STORAGE_OK) return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens))
  } catch {
    /* ignore quota / serialization errors */
  }
}

// ---------------------------------------------------------------------------
// Derived status — a token past its expiry while still "available" reads as
// expired without mutating the stored record.
// ---------------------------------------------------------------------------
export function effectiveTokenStatus(token) {
  if (token.status === 'available' && token.expiry_date) {
    const end = new Date(token.expiry_date).getTime()
    if (!Number.isNaN(end) && end < Date.now()) return 'expired'
  }
  return token.status
}

// ---------------------------------------------------------------------------
// useTokens — React binding over the data layer. Components only ever touch
// this; they never read/write localStorage directly.
// ---------------------------------------------------------------------------
export function useTokens() {
  const [tokens, setTokens] = useState(() => loadTokens())

  const persist = useCallback((updater) => {
    setTokens((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      saveTokens(next)
      return next
    })
  }, [])

  // Insert or update by id, stamping updated_at.
  const saveToken = useCallback((token) => {
    const stamped = { ...token, updated_at: nowISO() }
    persist((prev) => {
      const exists = prev.some((t) => t.id === stamped.id)
      return exists ? prev.map((t) => (t.id === stamped.id ? stamped : t)) : [stamped, ...prev]
    })
    return stamped
  }, [persist])

  const setStatus = useCallback((id, status) => {
    persist((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t
        const next = { ...t, status, updated_at: nowISO() }
        if (status === 'used' && !next.used_date) next.used_date = todayISODate()
        return next
      }),
    )
  }, [persist])

  // Copy a token as a fresh available record (new id/timestamps, status reset).
  const duplicateToken = useCallback((id) => {
    let created = null
    persist((prev) => {
      const src = prev.find((t) => t.id === id)
      if (!src) return prev
      const ts = nowISO()
      created = {
        ...src,
        id: uuid(),
        created_at: ts,
        updated_at: ts,
        status: 'available',
        used_date: null,
        promo_name: src.promo_name ? `${src.promo_name} (copy)` : src.promo_name,
        linked_bet_ids: [],
      }
      return [created, ...prev]
    })
    return created
  }, [persist])

  // Merge imported tokens by id (upsert). Returns counts for user feedback.
  const importTokens = useCallback((incoming) => {
    const normalized = incoming.map(normalizeToken)
    let added = 0
    let updated = 0
    persist((prev) => {
      const byId = new Map(prev.map((t) => [t.id, t]))
      normalized.forEach((t) => {
        if (byId.has(t.id)) updated += 1
        else added += 1
        byId.set(t.id, t)
      })
      return Array.from(byId.values())
    })
    return { added, updated, total: normalized.length }
  }, [persist])

  return { tokens, saveToken, setStatus, duplicateToken, importTokens }
}

// ---------------------------------------------------------------------------
// Import parsing — accepts the export file shape ({ tokens: [...] }) or a bare
// array. Throws a friendly error on anything else.
// ---------------------------------------------------------------------------
export function parseImport(text) {
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('File is not valid JSON.')
  }
  const arr = Array.isArray(data) ? data : Array.isArray(data?.tokens) ? data.tokens : null
  if (!arr) throw new Error('Expected a JSON array of tokens or an object with a "tokens" array.')
  return arr
}

export function exportPayload(tokens) {
  return {
    library: 'promo_token_library',
    version: 1,
    exported_at: nowISO(),
    count: tokens.length,
    tokens,
  }
}

// ---------------------------------------------------------------------------
// AI Agent Context Block — the canonical plain-text representation of a token,
// formatted exactly to the spec so it can be pasted into an AI prompt.
// ---------------------------------------------------------------------------
function fmtMoney(v) {
  return v == null || v === '' ? '—' : `$${v}`
}
function fmtList(arr, allLabel = 'all') {
  return arr && arr.length ? arr.join(', ') : allLabel
}
function fmtBool(v) {
  return v ? 'yes' : 'no'
}

export function buildAIContextBlock(token) {
  const t = token
  const boostLine =
    t.boost_percentage != null
      ? `${t.boost_percentage}% on ${t.boost_applies_to ? BOOST_APPLIES_TO_LABELS[t.boost_applies_to] : 'unspecified basis'}`
      : '—'

  const lines = [
    'PROMO TOKEN RECORD',
    '==================',
    `Sportsbook: ${t.sportsbook || '—'}`,
    `Promo Name: ${t.promo_name || '—'}`,
    `Token ID: ${t.token_id || '—'}`,
    `Promo Type: ${promoTypeLabel(t.promo_type)}`,
    `Status: ${STATUS_LABELS[effectiveTokenStatus(t)] || t.status}`,
    `Received: ${t.received_date || '—'}  |  Expires: ${t.expiry_date || 'no expiry'}`,
    '',
    'RULES',
    '-----',
    `Boost: ${boostLine}`,
    `Max wager: ${fmtMoney(t.max_wager_amount)}`,
    `Min odds: ${t.min_odds || '—'}`,
  ]

  if (t.max_odds) lines.push(`Max odds: ${t.max_odds}`)
  if (t.free_bet_amount != null) {
    lines.push(
      `Free/bonus bet: ${fmtMoney(t.free_bet_amount)} (stake ${t.stake_returned_on_free_bet ? 'returned' : 'NOT returned — profit only'})`,
    )
  }
  if (t.protection_amount != null) {
    lines.push(
      `Protection: up to ${fmtMoney(t.protection_max_refund ?? t.protection_amount)} refunded as ${t.protection_type ? PROTECTION_TYPE_LABELS[t.protection_type] : 'unspecified'}`,
    )
  }
  if (t.deposit_match_percentage != null) {
    lines.push(
      `Deposit match: ${t.deposit_match_percentage}% up to ${fmtMoney(t.deposit_match_max)}${t.deposit_match_rollover != null ? `, ${t.deposit_match_rollover}x rollover` : ''}`,
    )
  }

  lines.push(
    `Eligible sports: ${fmtList(t.eligible_sports)}`,
    `Eligible leagues: ${fmtList(t.eligible_leagues)}`,
    `Eligible markets: ${fmtList(t.eligible_markets)}`,
    `Eligible bet types: ${fmtList(t.eligible_bet_types)}`,
    `Min legs required: ${t.min_legs ?? '—'}`,
    `Excluded bet types: ${fmtList(t.excluded_bet_types, 'none')}`,
    `Excluded markets: ${fmtList(t.excluded_markets, 'none')}`,
    `Requires cash funds: ${fmtBool(t.requires_cash_funds)}`,
    `One-time use: ${fmtBool(t.one_time_use)}`,
    `Combinable with other promos: ${fmtBool(t.combinable_with_other_promos)}`,
    `Early win trigger: ${t.early_win_trigger || '—'}`,
    '',
    'STRATEGY NOTES',
    '--------------',
    t.hedge_math_notes || '(none)',
    '',
    'AI EXTRACTION FORMULA',
    '---------------------',
    t.ai_extraction_formula || '(none)',
    '',
    'ADDITIONAL NOTES',
    '----------------',
    t.notes || '(none)',
  )

  return lines.join('\n')
}
