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
import { oddsInputToDecimal, calcArb, formatUSD, formatPercent, formatOdds } from '../utils'

function SportsbookField({ label, value, onChange, names }) {
  return (
    <Field label={label}>
      <TextInput
        list="sb-names"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Sportsbook"
      />
      <datalist id="sb-names">
        {names.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
    </Field>
  )
}

export default function ArbCalculator({ sportsbookNames, prefill, clearPrefill, saveToLog }) {
  const [format, setFormat] = useState('american')
  const [sbA, setSbA] = useState('')
  const [oddsA, setOddsA] = useState('')
  const [boostA, setBoostA] = useState('0')
  const [sbB, setSbB] = useState('')
  const [oddsB, setOddsB] = useState('')
  const [boostB, setBoostB] = useState('0')
  const [totalStake, setTotalStake] = useState('100')
  const [sportMarket, setSportMarket] = useState('')
  const [promoId, setPromoId] = useState(null)

  // Apply prefill from a promo "Use in Calculator" action.
  useEffect(() => {
    if (!prefill) return
    if (prefill.sportsbookA) setSbA(prefill.sportsbookA)
    if (prefill.boostA != null) setBoostA(String(prefill.boostA))
    if (prefill.promoId) setPromoId(prefill.promoId)
    clearPrefill()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill])

  const decimalA = oddsInputToDecimal(oddsA, format)
  const decimalB = oddsInputToDecimal(oddsB, format)

  const result = useMemo(() => {
    if (
      Number.isNaN(decimalA) ||
      Number.isNaN(decimalB) ||
      decimalA <= 1 ||
      decimalB <= 1 ||
      !(Number(totalStake) > 0)
    )
      return null
    return calcArb({
      decimalA,
      boostA: Number(boostA) || 0,
      decimalB,
      boostB: Number(boostB) || 0,
      totalStake: Number(totalStake),
    })
  }, [decimalA, decimalB, boostA, boostB, totalStake])

  function handleSave() {
    if (!result || !result.isArb) return
    saveToLog({
      type: 'Arb/Boost',
      sportMarket,
      sideA: { sportsbook: sbA, odds: formatOdds(result.boostedDecimalA, format), stake: result.stakeA.toFixed(2) },
      sideB: { sportsbook: sbB, odds: formatOdds(result.boostedDecimalB, format), stake: result.stakeB.toFixed(2) },
      expectedProfit: result.guaranteedProfit.toFixed(2),
      promoId: promoId || '',
      notes: `Boost A ${boostA}% / Boost B ${boostB}% · total stake ${formatUSD(Number(totalStake))} · margin ${formatPercent(result.profitMarginPercent)}`,
    })
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-100">Arb & Boost Calculator</h2>
          <p className="text-sm text-slate-400">
            Two-outcome guaranteed-profit stake split, with optional promo boosts on either side.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Odds format</span>
          <OddsFormatToggle format={format} onChange={setFormat} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Side A */}
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-emerald-400">Side A</h3>
          <div className="space-y-3">
            <SportsbookField label="Sportsbook" value={sbA} onChange={setSbA} names={sportsbookNames} />
            <Field label={`Odds (${format})`}>
              <OddsInput value={oddsA} onChange={setOddsA} format={format} />
              {!Number.isNaN(decimalA) && decimalA > 1 && (
                <span className="mt-1 block text-[11px] text-slate-500">
                  decimal {decimalA.toFixed(4)}
                </span>
              )}
            </Field>
            <Field label="Boost %" hint="Profit/odds boost applied to this side (0 if none)">
              <NumberInput value={boostA} onChange={(e) => setBoostA(e.target.value)} min="0" step="1" />
            </Field>
          </div>
        </Card>

        {/* Side B */}
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-sky-400">Side B</h3>
          <div className="space-y-3">
            <SportsbookField label="Sportsbook" value={sbB} onChange={setSbB} names={sportsbookNames} />
            <Field label={`Odds (${format})`}>
              <OddsInput value={oddsB} onChange={setOddsB} format={format} />
              {!Number.isNaN(decimalB) && decimalB > 1 && (
                <span className="mt-1 block text-[11px] text-slate-500">
                  decimal {decimalB.toFixed(4)}
                </span>
              )}
            </Field>
            <Field label="Boost %" hint="Profit/odds boost applied to this side (0 if none)">
              <NumberInput value={boostB} onChange={(e) => setBoostB(e.target.value)} min="0" step="1" />
            </Field>
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Total Stake ($)">
            <NumberInput
              value={totalStake}
              onChange={(e) => setTotalStake(e.target.value)}
              min="0"
              step="10"
            />
          </Field>
          <Field label="Sport / Market (optional, for logging)">
            <TextInput value={sportMarket} onChange={(e) => setSportMarket(e.target.value)} placeholder="e.g. NBA Moneyline" />
          </Field>
        </div>
      </Card>

      {/* Results */}
      {result && (
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-semibold text-slate-200">Results</h3>

          {!result.isArb ? (
            <div className="rounded-lg border border-red-700 bg-red-950/40 px-4 py-6 text-center">
              <p className="text-base font-semibold text-red-300">
                No arbitrage — implied book hold is {formatPercent(result.bookHoldPercent)}
              </p>
              <p className="mt-1 text-xs text-red-400/80">
                The combined implied probability exceeds 100%, so no stake split guarantees a profit.
              </p>
            </div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4">
                  <div className="text-xs font-semibold uppercase text-emerald-400">Side A</div>
                  <div className="mt-1 text-2xl font-bold text-slate-100">{formatUSD(result.stakeA)}</div>
                  <div className="mt-2 space-y-1 text-xs text-slate-400">
                    <div>Boosted odds: {formatOdds(result.boostedDecimalA, format)} ({result.boostedDecimalA.toFixed(4)})</div>
                    <div>Payout if A wins: <span className="text-emerald-300">{formatUSD(result.payoutIfA)}</span></div>
                  </div>
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4">
                  <div className="text-xs font-semibold uppercase text-sky-400">Side B</div>
                  <div className="mt-1 text-2xl font-bold text-slate-100">{formatUSD(result.stakeB)}</div>
                  <div className="mt-2 space-y-1 text-xs text-slate-400">
                    <div>Boosted odds: {formatOdds(result.boostedDecimalB, format)} ({result.boostedDecimalB.toFixed(4)})</div>
                    <div>Payout if B wins: <span className="text-emerald-300">{formatUSD(result.payoutIfB)}</span></div>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg bg-slate-900/50 p-3 text-center">
                  <div className="text-xs text-slate-400">Guaranteed Profit</div>
                  <div className={`text-xl font-bold ${result.guaranteedProfit >= 0 ? 'text-profit' : 'text-loss'}`}>
                    {formatUSD(result.guaranteedProfit)}
                  </div>
                </div>
                <div className="rounded-lg bg-slate-900/50 p-3 text-center">
                  <div className="text-xs text-slate-400">Profit Margin</div>
                  <div className={`text-xl font-bold ${result.profitMarginPercent >= 0 ? 'text-profit' : 'text-loss'}`}>
                    {formatPercent(result.profitMarginPercent)}
                  </div>
                </div>
                <div className="rounded-lg bg-slate-900/50 p-3 text-center">
                  <div className="text-xs text-slate-400">Guaranteed Payout</div>
                  <div className="text-xl font-bold text-slate-100">{formatUSD(result.guaranteedPayout)}</div>
                </div>
              </div>

              <div className="mt-4 flex justify-end">
                <Button onClick={handleSave}>💾 Save to Opportunity Log</Button>
              </div>
            </>
          )}
        </Card>
      )}

      {!result && (
        <Card className="p-6 text-center text-sm text-slate-500">
          Enter valid odds for both sides and a total stake to see the guaranteed-profit split.
        </Card>
      )}
    </div>
  )
}
