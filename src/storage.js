import { useState, useEffect, useRef } from 'react'

// Detect whether localStorage is usable.
export function storageAvailable() {
  try {
    const k = '__promo_arb_test__'
    window.localStorage.setItem(k, '1')
    window.localStorage.removeItem(k)
    return true
  } catch {
    return false
  }
}

export const STORAGE_OK = typeof window !== 'undefined' && storageAvailable()

// A useState that mirrors to localStorage (when available).
export function usePersistentState(key, initialValue) {
  const [value, setValue] = useState(() => {
    if (!STORAGE_OK) return initialValue
    try {
      const raw = window.localStorage.getItem(key)
      if (raw == null) return initialValue
      return JSON.parse(raw)
    } catch {
      return initialValue
    }
  })

  const firstRun = useRef(true)
  useEffect(() => {
    if (!STORAGE_OK) return
    // Skip writing on the very first render to avoid clobbering before load.
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    try {
      window.localStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* ignore quota / serialization errors */
    }
  }, [key, value])

  return [value, setValue]
}

export function clearAllData() {
  if (!STORAGE_OK) return
  ;['promoInventory', 'promoTokens', 'sportsbooks', 'opportunityLog', 'marketQuotes', 'promo_token_library_v1'].forEach((k) => {
    try {
      window.localStorage.removeItem(k)
    } catch {
      /* ignore */
    }
  })
}


export const PROMO_TOKEN_IMPORT_COLUMNS = [
  'date',
  'sportsbook',
  'betType',
  'event',
  'market',
  'selection',
  'odds',
  'stake',
  'payout',
  'profitLoss',
  'promotionId',
  'tokenId',
  'notes',
]

export function migratePromotions(rawPromos = []) {
  return rawPromos.map((p) => ({
    id: p.id,
    sportsbook: p.sportsbook || '',
    promotionName: p.promotionName || p.name || '',
    promotionType: p.promotionType || p.promoType || 'other',
    description: p.description || p.name || '',
    startDate: p.startDate || '',
    expirationDate: p.expirationDate || p.expiration || '',
    terms: p.terms || p.notes || '',
    status: normalizePromotionStatus(p.status),
    estimatedValue: p.estimatedValue ?? p.expectedValue ?? p.bonusAmount ?? '',
    boostPct: p.boostPct ?? '',
    bonusAmount: p.bonusAmount ?? '',
    maxStake: p.maxStake ?? '',
    notes: p.notes || '',
  }))
}

export function migrateTokens(rawTokens = [], promotions = []) {
  const parentByName = new Map(
    promotions.map((p) => [`${p.sportsbook}::${p.promotionName}`.toLowerCase(), p.id]),
  )
  return rawTokens.map((t) => {
    const tokenType = normalizeTokenType(t.tokenType || t.promo_type || t.promoType)
    const quantity = Number(t.quantity ?? t.max_uses_per_account ?? 1) || 1
    const linkedIds = t.usedOnBetIds || t.linked_bet_ids || []
    const matchedPromotionId =
      t.promotionId ||
      parentByName.get(`${t.sportsbook || ''}::${t.promo_name || t.promotionName || ''}`.toLowerCase()) ||
      ''
    const remainingQuantity =
      t.remainingQuantity != null
        ? Number(t.remainingQuantity)
        : Math.max(0, quantity - linkedIds.length)
    return {
      id: t.id,
      promotionId: matchedPromotionId,
      sportsbook: t.sportsbook || '',
      tokenName: t.tokenName || t.promo_name || t.promotionName || '',
      tokenType,
      quantity,
      remainingQuantity,
      value: t.value ?? t.free_bet_amount ?? t.protection_amount ?? t.deposit_match_max ?? '',
      maxStake: t.maxStake ?? t.max_wager_amount ?? '',
      boostPercent: t.boostPercent ?? t.boost_percentage ?? '',
      bonusAmount: t.bonusAmount ?? t.free_bet_amount ?? '',
      expirationDate: t.expirationDate || t.expiry_date || '',
      status: normalizeTokenStatus(t.status, remainingQuantity, quantity),
      usedOnBetIds: Array.isArray(linkedIds) ? linkedIds : [],
      notes: t.notes || t.hedge_math_notes || '',
    }
  })
}

export function normalizePromotionStatus(status) {
  const s = String(status || '').toLowerCase()
  if (s === 'used') return 'completed'
  if (['active', 'expired', 'completed', 'cancelled'].includes(s)) return s
  return 'active'
}

export function normalizeTokenStatus(status, remainingQuantity = 1, quantity = 1) {
  const s = String(status || '').toLowerCase()
  if (s === 'voided') return 'expired'
  if (['available', 'partially_used', 'used', 'expired'].includes(s)) return s
  if (remainingQuantity <= 0) return 'used'
  if (remainingQuantity < quantity) return 'partially_used'
  return 'available'
}

export function normalizeTokenType(type) {
  const s = String(type || '').toLowerCase().replace(/[\s-]+/g, '_')
  if (['profit_boost', 'free_bet', 'bonus_bet', 'sweat_free', 'deposit_match', 'odds_boost', 'parlay_boost'].includes(s)) return s
  if (s === 'risk_free_bet' || s === 'bet_protection') return 'sweat_free'
  return 'other'
}


export function loadLegacyPromoTokens() {
  if (!STORAGE_OK) return []
  try {
    const raw = window.localStorage.getItem('promo_token_library_v1')
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return migrateTokens(Array.isArray(parsed) ? parsed : [])
  } catch {
    return []
  }
}
