import React, { useState, useMemo } from 'react'
import {
  Card, Button, Field, TextInput, NumberInput, Select, EmptyState, OddsInput, OddsFormatToggle,
} from '../components.jsx'
import {
  uid, oddsInputToDecimal, calcArb, formatUSD, formatPercent, formatOdds, effectiveStatus,
} from '../utils'

const BOOST_TYPES = ['Profit Boost', 'Odds Boost']

function boostPromosForBook(promos, book) {
  return promos.filter(
    (p) => p.sportsbook === book && BOOST_TYPES.includes(p.promoType) && effectiveStatus(p) === 'Active',
  )
}

function emptyQuote() {
  return { event: '', market: '', outcome: '', sportsbook: '', odds: '', boostPct: '0', promoId: '' }
}

export default function ArbFinder({ sportsbookNames, promos, quotes, setQuotes, saveToLog }) {
  const [format, setFormat] = useState('american')
  const [totalStake, setTotalStake] = useState('100')
  const [showNonArb, setShowNonArb] = useState(false)
  const [draft, setDraft] = useState(emptyQuote())
  const [error, setError] = useState('')

  const setD = (k, v) => setDraft((p) => ({ ...p, [k]: v }))

  const draftBoostPromos = useMemo(
    () => boostPromosForBook(promos, draft.sportsbook),
    [promos, draft.sportsbook],
  )

  function addQuote() {
    if (!draft.event.trim()) return setError('Event is required.')
    if (!draft.market.trim()) return setError('Market is required.')
    if (!draft.outcome.trim()) return setError('Outcome is required.')
    if (!draft.sportsbook.trim()) return setError('Sportsbook is required.')
    const dec = oddsInputToDecimal(draft.odds, format)
    if (Number.isNaN(dec) || dec <= 1) return setError('Enter valid odds.')
    setQuotes((prev) => [...prev, { ...draft, id: uid(), oddsFormat: format }])
    setDraft((p) => ({ ...emptyQuote(), event: p.event, market: p.market, sportsbook: '' }))
    setError('')
  }

  function removeQuote(id) {
    setQuotes((prev) => prev.filter((q) => q.id !== id))
  }

  // ---- Core arb scan -------------------------------------------------------
  const opportunities = useMemo(() => {
    const stake = Number(totalStake) > 0 ? Number(totalStake) : 100
    const groups = {}
    quotes.forEach((q) => {
      const dec = oddsInputToDecimal(q.odds, q.oddsFormat || 'american')
      if (Number.isNaN(dec) || dec <= 1) return
      const boost = Number(q.boostPct) || 0
      const boostedDecimal = 1 + (dec - 1) * (1 + boost / 100)
      const key = `${q.event.trim().toLowerCase()}||${q.market.trim().toLowerCase()}`
      if (!groups[key]) groups[key] = { event: q.event.trim(), market: q.market.trim(), outcomes: {} }
      const ok = q.outcome.trim().toLowerCase()
      const entry = { ...q, decimal: dec, boost, boostedDecimal }
      // Keep the best (highest boosted decimal) quote per outcome.
      if (!groups[key].outcomes[ok] || boostedDecimal > groups[key].outcomes[ok].boostedDecimal) {
        groups[key].outcomes[ok] = entry
      }
    })

    const results = []
    Object.values(groups).forEach((g) => {
      const outcomes = Object.values(g.outcomes)
      if (outcomes.length !== 2) {
        results.push({ ...g, status: 'incomplete', outcomeCount: outcomes.length })
        return
      }
      const [A, B] = outcomes
      const r = calcArb({
        decimalA: A.decimal, boostA: A.boost,
        decimalB: B.decimal, boostB: B.boost,
        totalStake: stake,
      })
      results.push({
        ...g,
        status: r.isArb ? 'arb' : 'noarb',
        A, B, calc: r,
        sameBook: A.sportsbook === B.sportsbook,
      })
    })

    // Profitable first, by margin desc; then no-arb by hold asc; incomplete last.
    results.sort((a, b) => {
      const rank = (x) => (x.status === 'arb' ? 0 : x.status === 'noarb' ? 1 : 2)
      if (rank(a) !== rank(b)) return rank(a) - rank(b)
      if (a.status === 'arb') return b.calc.profitMarginPercent - a.calc.profitMarginPercent
      if (a.status === 'noarb') return a.calc.bookHoldPercent - b.calc.bookHoldPercent
      return 0
    })
    return results
  }, [quotes, totalStake])

  const arbs = opportunities.filter((o) => o.status === 'arb')
  const visible = showNonArb ? opportunities : arbs

  function saveOpp(o) {
    saveToLog({
      type: 'Arb/Boost',
      sportMarket: `${o.event} — ${o.market}`,
      sideA: { sportsbook: o.A.sportsbook, odds: formatOdds(o.A.boostedDecimal, format), stake: o.calc.stakeA.toFixed(2) },
      sideB: { sportsbook: o.B.sportsbook, odds: formatOdds(o.B.boostedDecimal, format), stake: o.calc.stakeB.toFixed(2) },
      expectedProfit: o.calc.guaranteedProfit.toFixed(2),
      promoId: o.A.promoId || o.B.promoId || '',
      notes: `Auto-found arb · ${o.A.outcome} vs ${o.B.outcome} · margin ${formatPercent(o.calc.profitMarginPercent)}`,
    })
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-100">Arb Finder</h2>
          <p className="text-sm text-slate-400">
            Enter the odds you see for each side of a market. The finder auto-pairs opposing outcomes
            across books, applies your boosts, and surfaces every guaranteed-profit opportunity.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Odds format</span>
          <OddsFormatToggle format={format} onChange={setFormat} />
        </div>
      </div>

      {/* Add quote */}
      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold text-emerald-400">Add a market quote</h3>
        {error && <div className="mb-2 rounded bg-red-950/50 px-3 py-2 text-xs text-red-300">{error}</div>}
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <Field label="Event" hint="Group quotes by the same event + market">
            <TextInput value={draft.event} onChange={(e) => setD('event', e.target.value)} placeholder="e.g. Lakers vs Celtics" />
          </Field>
          <Field label="Market">
            <TextInput value={draft.market} onChange={(e) => setD('market', e.target.value)} placeholder="e.g. Moneyline" />
          </Field>
          <Field label="Outcome / Side" hint="The specific side this quote is for">
            <TextInput value={draft.outcome} onChange={(e) => setD('outcome', e.target.value)} placeholder="e.g. Lakers" />
          </Field>
          <Field label="Sportsbook">
            <TextInput list="finder-sb" value={draft.sportsbook} onChange={(e) => { setD('sportsbook', e.target.value); setD('promoId', ''); }} placeholder="Sportsbook" />
            <datalist id="finder-sb">{sportsbookNames.map((n) => (<option key={n} value={n} />))}</datalist>
          </Field>
          <Field label={`Odds (${format})`}>
            <OddsInput value={draft.odds} onChange={(v) => setD('odds', v)} format={format} />
          </Field>
          <Field label="Boost % (optional)">
            <div className="space-y-1">
              {draftBoostPromos.length > 0 && (
                <Select
                  value={draft.promoId}
                  onChange={(e) => {
                    const p = draftBoostPromos.find((x) => x.id === e.target.value)
                    setD('promoId', e.target.value)
                    if (p) setD('boostPct', String(p.boostPct || 0))
                  }}
                >
                  <option value="">Manual / no promo</option>
                  {draftBoostPromos.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.boostPct}%)</option>
                  ))}
                </Select>
              )}
              <NumberInput value={draft.boostPct} onChange={(e) => { setD('boostPct', e.target.value); setD('promoId', ''); }} min="0" step="1" />
            </div>
          </Field>
        </div>
        <div className="mt-3 flex justify-end">
          <Button onClick={addQuote}>＋ Add Quote</Button>
        </div>
      </Card>

      {/* Quotes table */}
      {quotes.length > 0 && (
        <Card className="overflow-x-auto">
          <div className="flex items-center justify-between px-4 py-2">
            <h3 className="text-sm font-semibold text-slate-200">Quotes ({quotes.length})</h3>
            <Button variant="ghost" className="text-xs text-red-400" onClick={() => { if (window.confirm('Clear all quotes?')) setQuotes([]) }}>Clear all</Button>
          </div>
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-y border-slate-700">
              <tr>
                {['Event', 'Market', 'Outcome', 'Sportsbook', 'Odds', 'Boost', ''].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {quotes.map((q) => {
                const dec = oddsInputToDecimal(q.odds, q.oddsFormat || 'american')
                return (
                  <tr key={q.id} className="border-b border-slate-800">
                    <td className="px-3 py-2 text-slate-300">{q.event}</td>
                    <td className="px-3 py-2 text-slate-300">{q.market}</td>
                    <td className="px-3 py-2 text-slate-200">{q.outcome}</td>
                    <td className="px-3 py-2 text-slate-300">{q.sportsbook}</td>
                    <td className="px-3 py-2 text-slate-300">{formatOdds(dec, format)}</td>
                    <td className="px-3 py-2 text-slate-300">{Number(q.boostPct) ? `${q.boostPct}%` : '—'}</td>
                    <td className="px-3 py-2 text-right">
                      <button className="text-red-400 hover:text-red-300" onClick={() => removeQuote(q.id)}>✕</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}

      {/* Controls */}
      <Card className="flex flex-wrap items-end justify-between gap-3 p-4">
        <Field label="Total Stake per opportunity ($)" className="w-48">
          <NumberInput value={totalStake} onChange={(e) => setTotalStake(e.target.value)} min="0" step="10" />
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={showNonArb} onChange={(e) => setShowNonArb(e.target.checked)} className="h-4 w-4 rounded border-slate-600 bg-slate-900" />
          Also show non-profitable / incomplete markets
        </label>
      </Card>

      {/* Results */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-200">
          {arbs.length > 0 ? `${arbs.length} guaranteed-profit opportunit${arbs.length === 1 ? 'y' : 'ies'} found` : 'Opportunities'}
        </h3>

        {quotes.length === 0 ? (
          <EmptyState message="Add at least two opposing quotes for the same event + market to scan for arbitrage." />
        ) : visible.length === 0 ? (
          <EmptyState message="No guaranteed-profit arbitrage in your current quotes. Toggle the checkbox above to inspect near-misses." />
        ) : (
          <div className="space-y-3">
            {visible.map((o, i) => {
              if (o.status === 'incomplete') {
                return (
                  <Card key={i} className="border-slate-700 p-4">
                    <div className="text-sm font-semibold text-slate-200">{o.event} — {o.market}</div>
                    <div className="mt-1 text-xs text-amber-400">
                      Needs exactly 2 distinct outcomes to evaluate (currently {o.outcomeCount}). Add the opposing side.
                    </div>
                  </Card>
                )
              }
              const arb = o.status === 'arb'
              return (
                <Card key={i} className={`p-4 ${arb ? 'border-emerald-600 bg-emerald-950/10' : 'border-slate-700'}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-slate-100">{o.event} — {o.market}</div>
                      {arb ? (
                        <div className="text-xs text-emerald-400">
                          Guaranteed profit {formatUSD(o.calc.guaranteedProfit)} · margin {formatPercent(o.calc.profitMarginPercent)}
                        </div>
                      ) : (
                        <div className="text-xs text-red-400">No arb — book hold {formatPercent(o.calc.bookHoldPercent)}</div>
                      )}
                    </div>
                    {arb && <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white">ARB</span>}
                  </div>

                  {o.sameBook && (
                    <div className="mt-2 rounded bg-amber-950/30 px-2 py-1 text-[11px] text-amber-300">
                      ⚠ Both best prices are at {o.A.sportsbook} — a real arb normally needs two different books.
                    </div>
                  )}

                  {arb && (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {[o.A, o.B].map((leg, idx) => {
                        const stake = idx === 0 ? o.calc.stakeA : o.calc.stakeB
                        const payout = idx === 0 ? o.calc.payoutIfA : o.calc.payoutIfB
                        return (
                          <div key={idx} className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
                            <div className="text-xs font-semibold uppercase text-slate-400">{leg.outcome}</div>
                            <div className="mt-1 text-sm text-slate-200">
                              Place <span className="font-bold text-emerald-300">{formatUSD(stake)}</span> at{' '}
                              <span className="font-semibold">{leg.sportsbook}</span>
                            </div>
                            <div className="mt-1 text-xs text-slate-400">
                              Odds {formatOdds(leg.boostedDecimal, format)}
                              {leg.boost > 0 && <span className="text-emerald-400"> (incl. {leg.boost}% boost)</span>}
                              {' '}· returns {formatUSD(payout)} if it wins
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {arb && (
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <div className="text-xs text-slate-400">
                        Stake {formatUSD(Number(totalStake) || 100)} total → keep {formatUSD(o.calc.guaranteedPayout)} guaranteed.
                      </div>
                      <Button onClick={() => saveOpp(o)}>💾 Save to Log</Button>
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
