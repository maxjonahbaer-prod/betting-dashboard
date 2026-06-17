// ============================================================================
// Odds conversion utilities (implemented once, reused everywhere)
// ============================================================================

export function americanToDecimal(american) {
  const a = Number(american)
  if (Number.isNaN(a) || a === 0) return NaN
  if (a >= 0) return 1 + a / 100
  return 1 + 100 / Math.abs(a)
}

export function decimalToAmerican(decimal) {
  const d = Number(decimal)
  if (Number.isNaN(d) || d <= 1) return NaN
  if (d >= 2.0) return (d - 1) * 100
  return -100 / (d - 1)
}

// Convert a raw odds input (in the given format) to a decimal number.
export function oddsInputToDecimal(value, format) {
  const n = Number(value)
  if (Number.isNaN(n)) return NaN
  if (format === 'american') return americanToDecimal(n)
  return n // already decimal
}

// Format a decimal odds value for display in the chosen format.
export function formatOdds(decimal, format) {
  if (decimal == null || Number.isNaN(decimal)) return '—'
  if (format === 'american') {
    const a = decimalToAmerican(decimal)
    if (Number.isNaN(a)) return '—'
    const rounded = Math.round(a)
    return rounded >= 0 ? `+${rounded}` : `${rounded}`
  }
  return decimal.toFixed(2)
}

// ============================================================================
// Formatting helpers
// ============================================================================

export function formatUSD(value) {
  const n = Number(value)
  if (Number.isNaN(n)) return '$0.00'
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function formatPercent(value) {
  const n = Number(value)
  if (Number.isNaN(n)) return '0.00%'
  return `${n.toFixed(2)}%`
}

// ============================================================================
// Arb & Boost calculator (EXACT formulas from spec)
// ============================================================================

export function calcArb({ decimalA, boostA = 0, decimalB, boostB = 0, totalStake = 100 }) {
  const boostedDecimalA = 1 + (decimalA - 1) * (1 + boostA / 100)
  const boostedDecimalB = 1 + (decimalB - 1) * (1 + boostB / 100)

  const impliedProbA = 1 / boostedDecimalA
  const impliedProbB = 1 / boostedDecimalB
  const sumImplied = impliedProbA + impliedProbB

  const stakeA = totalStake * (impliedProbA / sumImplied)
  const stakeB = totalStake * (impliedProbB / sumImplied)

  const guaranteedPayout = totalStake / sumImplied
  const guaranteedProfit = guaranteedPayout - totalStake
  const profitMarginPercent = ((1 - sumImplied) / sumImplied) * 100

  const payoutIfA = stakeA * boostedDecimalA
  const payoutIfB = stakeB * boostedDecimalB

  const isArb = sumImplied < 1
  const bookHoldPercent = (sumImplied - 1) * 100

  return {
    boostedDecimalA,
    boostedDecimalB,
    impliedProbA,
    impliedProbB,
    sumImplied,
    stakeA,
    stakeB,
    guaranteedPayout,
    guaranteedProfit,
    profitMarginPercent,
    payoutIfA,
    payoutIfB,
    isArb,
    bookHoldPercent,
  }
}

// ============================================================================
// Free Bet calculator — Mode 1 (free/bonus bet: pays profit only if it wins)
// ============================================================================

export function calcFreeBet({ freeBetAmount, freeBetDecimal, hedgeDecimal }) {
  const F = Number(freeBetAmount)
  const O_fb = Number(freeBetDecimal)
  const O_h = Number(hedgeDecimal)

  const hedgeStake = (F * (O_fb - 1)) / O_h
  const guaranteedProfit = hedgeStake * (O_h - 1)
  const extractionRatePercent = (guaranteedProfit / F) * 100

  return { hedgeStake, guaranteedProfit, extractionRatePercent }
}

// ============================================================================
// Misc helpers
// ============================================================================

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

// Returns countdown string like "6h 32m" or "expired" / "2d 4h"
export function countdownString(targetISO) {
  if (!targetISO) return ''
  const target = new Date(targetISO).getTime()
  const now = Date.now()
  let diff = target - now
  if (diff <= 0) return 'expired'
  const days = Math.floor(diff / 86400000)
  diff -= days * 86400000
  const hours = Math.floor(diff / 3600000)
  diff -= hours * 3600000
  const minutes = Math.floor(diff / 60000)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export function hoursUntil(targetISO) {
  if (!targetISO) return Infinity
  return (new Date(targetISO).getTime() - Date.now()) / 3600000
}

// Compute effective status: auto-Expired if past expiration, unless manually Used.
export function effectiveStatus(promo) {
  if (promo.status === 'Used') return 'Used'
  if (promo.expiration && hoursUntil(promo.expiration) <= 0) return 'Expired'
  return promo.status || 'Active'
}

export const MARKET_TAXONOMY = {
  NFL: ['Moneyline', 'Spread', 'Total', 'Anytime TD', 'Passing Yards', 'Rushing Yards', 'Receptions'],
  NBA: ['Moneyline', 'Spread', 'Total', 'Points', 'Rebounds', 'Assists', '3-Pointers Made'],
  MLB: ['Moneyline', 'Run Line', 'Total', 'Home Run', 'Hits', 'Stolen Base', 'Total Bases', 'Strikeouts'],
  NHL: ['Moneyline', 'Puck Line', 'Total', 'Goals', 'Shots on Goal', 'Points'],
  Tennis: ['Match Winner', 'Set Winner', 'Total Sets', 'Total Games', 'Aces'],
  Soccer: ['Match Result', 'Total Goals', 'Both Teams to Score', 'Anytime Goalscorer', 'Shots on Target'],
  MMA: [],
  Golf: [],
  Other: [],
}

export const SPORTS = ['NFL', 'NBA', 'MLB', 'NHL', 'Tennis', 'Soccer', 'MMA', 'Golf', 'Other']

export const PROMO_TYPES = [
  'Profit Boost',
  'Odds Boost',
  'Free Bet',
  'Risk-Free Bet',
  'Deposit Match',
  'Parlay Insurance',
  'Other',
]

export const TXN_TYPES = [
  'Deposit',
  'Withdrawal',
  'Bet Placed',
  'Bet Settled - Win',
  'Bet Settled - Loss',
  'Bonus Credit',
  'Manual Adjustment',
]

// Effect of a transaction type on the running balance, given a positive amount.
export function txnSign(type) {
  switch (type) {
    case 'Deposit':
    case 'Bet Settled - Win':
    case 'Bonus Credit':
      return 1
    case 'Withdrawal':
    case 'Bet Placed':
    case 'Bet Settled - Loss':
      return -1
    case 'Manual Adjustment':
      return 1 // amount may be entered as signed value
    default:
      return 1
  }
}
