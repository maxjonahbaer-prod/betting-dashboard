import React, { useState, useEffect, useMemo } from 'react'
import {
  Card,
  Field,
  TextInput,
  NumberInput,
  OddsInput,
  OddsFormatToggle,
  Button,
} from '../components.jsx'
import { oddsInputToDecimal, calcFreeBet, formatUSD, formatPercent, formatOdds } from '../utils'

export default function FreeBetCalculator({ sportsbookNames, prefill, clearPrefill, saveToLog }) {
  const [mode, setMode] = useState('free') // 'free' | 'riskfree'
  const [format, setFormat] = useState('american')

  // Mode 1 inputs
  const [freeBetAmount, setFreeBetAmount] = useState('')
  const [freeBetOdds, setFreeBetOdds] = useState('')
  const [hedgeOdds, setHedgeOdds] = useState('')
  const [sbFree, setSbFree] = useState('')
  const [sbHedge, setSbHedge] = useState('')

  // Mode 2 input
  const [refundAmount, setRefundAmount] = useState('')

  const [promoId, setPromoId] = useState(null)

  useEffect(() => {
    if (!prefill) return
    if (prefill.mode === 'riskfree') setMode('riskfree')
    else setMode('free')
    if (prefill.sportsbook) setSbFree(prefill.sportsbook)
    if (prefill.freeBetAmount) {
      if (prefill.mode === 'riskfree') setRefundAmount(String(prefill.freeBetAmount))
      else setFreeBetAmount(String(prefill.freeBetAmount))
    }
    if (prefill.promoId) setPromoId(prefill.promoId)
    clearPrefill()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill])

  const fbDecimal = oddsInputToDecimal(freeBetOdds, format)
  const hDecimal = oddsInputToDecimal(hedgeOdds, format)

  const result = useMemo(() => {
    const F = Number(freeBetAmount)
    if (!(F > 0) || Number.isNaN(fbDecimal) || Number.isNaN(hDecimal) || fbDecimal <= 1 || hDecimal <= 1)
      return null
    return calcFreeBet({ freeBetAmount: F, freeBetDecimal: fbDecimal, hedgeDecimal: hDecimal })
  }, [freeBetAmount, fbDecimal, hDecimal])

  function handleSave() {
    if (!result) return
    saveToLog({
      type: 'Free Bet',
      sportMarket: '',
      sideA: { sportsbook: sbFree, odds: formatOdds(fbDecimal, format), stake: `0.00 (free $${Number(freeBetAmount).toFixed(2)})` },
      sideB: { sportsbook: sbHedge, odds: formatOdds(hDecimal, format), stake: result.hedgeStake.toFixed(2) },
      expectedProfit: result.guaranteedProfit.toFixed(2),
      promoId: promoId || '',
      notes: `Free bet ${formatUSD(Number(freeBetAmount))} · extraction ${formatPercent(result.extractionRatePercent)}`,
    })
  }

  // Switch a credited refund into Mode 1 as the free bet amount.
  function hedgeBonusBet() {
    setFreeBetAmount(refundAmount)
    setMode('free')
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-100">Free Bet Calculator</h2>
          <p className="text-sm text-slate-400">Convert free/bonus bets into guaranteed cash by hedging.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Odds format</span>
          <OddsFormatToggle format={format} onChange={setFormat} />
        </div>
      </div>

      {/* Mode switch */}
      <div className="inline-flex overflow-hidden rounded-lg border border-slate-600 text-sm">
        <button
          onClick={() => setMode('free')}
          className={`px-4 py-2 font-medium transition ${mode === 'free' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
        >
          Free / Bonus Bet
        </button>
        <button
          onClick={() => setMode('riskfree')}
          className={`px-4 py-2 font-medium transition ${mode === 'riskfree' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
        >
          Risk-Free Bet
        </button>
      </div>

      {mode === 'free' ? (
        <>
          <Card className="p-4">
            <h3 className="mb-1 text-sm font-semibold text-emerald-400">Mode 1 — Free / Bonus Bet</h3>
            <p className="mb-4 text-xs text-slate-400">
              A free bet pays <span className="text-slate-200">profit only</span> if it wins ($0 if it
              loses). Place it at high odds, then hedge the opposite side with your own cash.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Free Bet Amount ($)" required>
                <NumberInput value={freeBetAmount} onChange={(e) => setFreeBetAmount(e.target.value)} min="0" step="5" />
              </Field>
              <Field label="Free Bet placed at sportsbook (optional)">
                <TextInput list="sb-names-fb" value={sbFree} onChange={(e) => setSbFree(e.target.value)} placeholder="Sportsbook" />
              </Field>
              <Field label={`Free Bet Odds (${format})`} required hint="The odds the free-bet token is placed on">
                <OddsInput value={freeBetOdds} onChange={setFreeBetOdds} format={format} />
                {!Number.isNaN(fbDecimal) && fbDecimal > 1 && (
                  <span className="mt-1 block text-[11px] text-slate-500">decimal {fbDecimal.toFixed(4)}</span>
                )}
              </Field>
              <Field label={`Hedge Odds (${format})`} required hint="Opposing side at another sportsbook">
                <OddsInput value={hedgeOdds} onChange={setHedgeOdds} format={format} />
                {!Number.isNaN(hDecimal) && hDecimal > 1 && (
                  <span className="mt-1 block text-[11px] text-slate-500">decimal {hDecimal.toFixed(4)}</span>
                )}
              </Field>
              <Field label="Hedge placed at sportsbook (optional)">
                <TextInput value={sbHedge} onChange={(e) => setSbHedge(e.target.value)} placeholder="Sportsbook" />
              </Field>
            </div>
            <datalist id="sb-names-fb">
              {sportsbookNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </Card>

          {result ? (
            <Card className="p-5">
              <h3 className="mb-4 text-sm font-semibold text-slate-200">Results</h3>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg bg-slate-900/50 p-3 text-center">
                  <div className="text-xs text-slate-400">Hedge Stake (your money)</div>
                  <div className="text-xl font-bold text-slate-100">{formatUSD(result.hedgeStake)}</div>
                </div>
                <div className="rounded-lg bg-slate-900/50 p-3 text-center">
                  <div className="text-xs text-slate-400">Guaranteed Profit</div>
                  <div className="text-xl font-bold text-profit">{formatUSD(result.guaranteedProfit)}</div>
                </div>
                <div className="rounded-lg bg-slate-900/50 p-3 text-center">
                  <div className="text-xs text-slate-400">Extraction Rate</div>
                  <div className="text-xl font-bold text-emerald-400">{formatPercent(result.extractionRatePercent)}</div>
                </div>
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Profit is identical whether the free bet or the hedge wins.
              </p>
              <div className="mt-4 flex justify-end">
                <Button onClick={handleSave}>💾 Save to Opportunity Log</Button>
              </div>
            </Card>
          ) : (
            <Card className="p-6 text-center text-sm text-slate-500">
              Enter the free bet amount and both sets of odds to see the hedge.
            </Card>
          )}
        </>
      ) : (
        <Card className="p-5">
          <h3 className="mb-2 text-sm font-semibold text-amber-400">Mode 2 — Risk-Free Bet (two-step)</h3>
          <div className="rounded-lg border border-amber-700/50 bg-amber-950/20 p-4 text-sm text-amber-100/90">
            Since your stake is refunded as a bonus bet if this loses, this initial bet carries minimal
            risk on its own — heavy hedging isn't required and would just lock in a small guaranteed loss
            equal to the vig. Common approach: place the qualifying bet on the side you think is most
            likely to win, OR place it on a near-even-money market to maximize the chance of either
            winning outright or receiving the refund.
          </div>

          <div className="mt-5 max-w-md space-y-3">
            <Field
              label="If this bet loses, you'll receive ($) as a bonus bet"
              hint="Once that bonus bet is actually credited, hedge it as a free bet (Mode 1)."
            >
              <NumberInput value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} min="0" step="5" />
            </Field>
            <Button
              variant="primary"
              disabled={!(Number(refundAmount) > 0)}
              onClick={hedgeBonusBet}
            >
              ↪ Hedge this bonus bet
            </Button>
            <p className="text-xs text-slate-500">
              This switches to Mode 1 with the Free Bet Amount pre-filled as {formatUSD(Number(refundAmount) || 0)}.
            </p>
          </div>
        </Card>
      )}
    </div>
  )
}
