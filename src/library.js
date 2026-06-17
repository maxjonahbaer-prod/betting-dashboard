// ============================================================================
// Built-in promo template library.
// These are TYPICAL / RECURRING promo types each book tends to run — NOT live
// offers. Users add the books they have, the templates populate, and they edit
// the specifics (boost %, amount, expiration) to match the current real offer.
// ============================================================================

export const KNOWN_SPORTSBOOKS = [
  'DraftKings',
  'FanDuel',
  'BetMGM',
  'Caesars',
  'ESPN BET',
  'Fanatics Sportsbook',
  'bet365',
  'BetRivers',
  'Hard Rock Bet',
]

// Each template is a partial promo. boostPct for boost types, bonusAmount for
// bonus types. Everything is editable after import.
export const PROMO_TEMPLATES = {
  DraftKings: [
    { name: 'Profit Boost Token', promoType: 'Profit Boost', boostPct: 50, notes: 'Recurring profit boost token (often 25–100%). Confirm current % and eligible markets.' },
    { name: 'No Sweat Bet', promoType: 'Risk-Free Bet', bonusAmount: 25, notes: 'Stake refunded as a bonus bet if it loses. Verify max refund.' },
    { name: 'Bonus Bet', promoType: 'Free Bet', bonusAmount: 5, notes: 'Free/bonus bet token — pays profit only if it wins.' },
  ],
  FanDuel: [
    { name: 'No Sweat Bet', promoType: 'Risk-Free Bet', bonusAmount: 25, notes: 'Bonus-bet refund if your first bet loses.' },
    { name: 'Profit Boost', promoType: 'Profit Boost', boostPct: 30, notes: 'Recurring profit boost. Confirm current %.' },
    { name: 'Bonus Bet', promoType: 'Free Bet', bonusAmount: 5, notes: 'Bonus bet token — profit only.' },
  ],
  BetMGM: [
    { name: 'Profit Boost Token', promoType: 'Profit Boost', boostPct: 30, notes: 'Recurring boost token. Confirm current %.' },
    { name: 'Risk-Free Bet', promoType: 'Risk-Free Bet', bonusAmount: 50, notes: 'Stake back as bonus bet if it loses.' },
    { name: 'Bonus Bet', promoType: 'Free Bet', bonusAmount: 10, notes: 'Bonus bet — profit only.' },
  ],
  Caesars: [
    { name: 'Profit Boost', promoType: 'Profit Boost', boostPct: 40, notes: 'Recurring profit boost. Confirm current %.' },
    { name: 'Bonus Bet', promoType: 'Free Bet', bonusAmount: 10, notes: 'Bonus bet token — profit only.' },
  ],
  'ESPN BET': [
    { name: 'Profit Boost', promoType: 'Profit Boost', boostPct: 25, notes: 'Daily/spin profit boost. Confirm current %.' },
    { name: 'Bonus Bet', promoType: 'Free Bet', bonusAmount: 10, notes: 'Bonus bet — profit only.' },
  ],
  'Fanatics Sportsbook': [
    { name: 'No Sweat Bet', promoType: 'Risk-Free Bet', bonusAmount: 50, notes: 'Bonus-bet refund if it loses.' },
    { name: 'Profit Boost', promoType: 'Profit Boost', boostPct: 25, notes: 'Recurring profit boost. Confirm current %.' },
  ],
  bet365: [
    { name: 'Bet Boost', promoType: 'Odds Boost', boostPct: 20, notes: 'Odds boost on selected markets. Confirm current %.' },
    { name: 'Bonus Bet', promoType: 'Free Bet', bonusAmount: 10, notes: 'Bonus bet — profit only.' },
  ],
  BetRivers: [
    { name: 'Profit Boost', promoType: 'Profit Boost', boostPct: 30, notes: 'Recurring profit boost. Confirm current %.' },
    { name: 'Bonus Bet', promoType: 'Free Bet', bonusAmount: 10, notes: 'Bonus bet — profit only.' },
  ],
  'Hard Rock Bet': [
    { name: 'Profit Boost', promoType: 'Profit Boost', boostPct: 25, notes: 'Recurring profit boost. Confirm current %.' },
    { name: 'Bonus Bet', promoType: 'Free Bet', bonusAmount: 10, notes: 'Bonus bet — profit only.' },
  ],
}

// Build a full promo object from a template + sportsbook, matching the shape
// used in Promo Inventory.
export function templateToPromo(book, tpl, uid) {
  return {
    id: uid(),
    sportsbook: book,
    name: tpl.name,
    promoType: tpl.promoType,
    boostPct: tpl.boostPct != null ? String(tpl.boostPct) : '',
    bonusAmount: tpl.bonusAmount != null ? String(tpl.bonusAmount) : '',
    sport: 'Other',
    sportOther: 'Any',
    market: '',
    minOdds: '',
    minOddsFormat: 'american',
    maxStake: '',
    expiration: '',
    notes: `[Template — verify current terms] ${tpl.notes || ''}`.trim(),
    status: 'Active',
    fromTemplate: true,
  }
}
