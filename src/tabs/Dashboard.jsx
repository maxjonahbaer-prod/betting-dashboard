import React, { useMemo } from 'react'
import { Card, StatCard, EmptyState, Button } from '../components.jsx'
import { txnSign, formatUSD, hoursUntil, countdownString } from '../utils'
import { effectiveTokenStatus, tokenDisplayName, tokenEstimatedValue } from './PromotionsTokens.jsx'

export default function Dashboard({ promos, tokens, sportsbooks, log, goTo }) {
  const totalBankroll = useMemo(
    () =>
      sportsbooks.reduce(
        (acc, s) => acc + (s.transactions || []).reduce((a, t) => a + txnSign(t.type) * Number(t.amount || 0), 0),
        0,
      ),
    [sportsbooks],
  )

  const realizedProfit = useMemo(
    () =>
      log
        .filter((x) => x.status === 'Settled' && x.actualProfit !== '')
        .reduce((a, x) => a + (Number(x.actualProfit) || 0), 0),
    [log],
  )

  const activePromos = useMemo(() => promos.filter((p) => p.status === 'active'), [promos])
  const tokenRows = useMemo(() => tokens.map((t) => ({ ...t, effectiveStatus: effectiveTokenStatus(t) })), [tokens])
  const usedTokens = useMemo(() => tokenRows.filter((t) => t.effectiveStatus === 'used').length, [tokenRows])
  const remainingPromoValue = useMemo(
    () => tokenRows.reduce((sum, t) => ['available', 'partially_used'].includes(t.effectiveStatus) ? sum + tokenEstimatedValue(t) * Number(t.remainingQuantity || 0) : sum, 0),
    [tokenRows],
  )

  const expiring48 = useMemo(
    () =>
      tokenRows
        .filter((t) => {
          if (!['available', 'partially_used'].includes(t.effectiveStatus)) return false
          const hrs = hoursUntil(t.expirationDate)
          return hrs > 0 && hrs <= 48
        })
        .sort((a, b) => new Date(a.expirationDate) - new Date(b.expirationDate)),
    [tokenRows],
  )

  const recentLog = useMemo(
    () => [...log].filter((x) => x.tokenId || x.promoId).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5),
    [log],
  )

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Bankroll" value={formatUSD(totalBankroll)} accent={totalBankroll >= 0 ? 'profit' : 'loss'} />
        <StatCard label="Total Realized Profit" value={formatUSD(realizedProfit)} accent={realizedProfit >= 0 ? 'profit' : 'loss'} sub="All-time, settled entries" />
        <StatCard label="Active Promos/Tokens" value={activePromos.length + tokenRows.filter((t) => ['available', 'partially_used'].includes(t.effectiveStatus)).length} />
        <StatCard label="Expiring ≤ 48h" value={expiring48.length} accent={expiring48.length > 0 ? 'warn' : 'default'} />
        <StatCard label="Used Tokens" value={usedTokens} />
        <StatCard label="Remaining Promo Value" value={formatUSD(remainingPromoValue)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Expiring soon */}
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-200">Tokens expiring within 48 hours</h3>
          {expiring48.length === 0 ? (
            <p className="text-sm text-slate-500">No tokens expiring soon.</p>
          ) : (
            <ul className="space-y-2">
              {expiring48.map((p) => {
                const hrs = hoursUntil(p.expirationDate)
                return (
                  <li key={p.id} className={`flex items-center justify-between rounded-lg border px-3 py-2 ${hrs <= 24 ? 'border-red-800 bg-red-950/30' : 'border-amber-800/60 bg-amber-950/20'}`}>
                    <div>
                      <div className="text-sm text-slate-200">{tokenDisplayName(p)}</div>
                      <div className="text-[11px] text-slate-500">{p.remainingQuantity} remaining</div>
                    </div>
                    <div className={`text-xs font-semibold ${hrs <= 24 ? 'text-red-400' : 'text-amber-400'}`}>
                      expires in {countdownString(p.expirationDate)}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        {/* Recent log */}
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200">Recent Bets Using Promos/Tokens</h3>
            <button className="text-xs text-emerald-400 hover:underline" onClick={() => goTo('log')}>View all →</button>
          </div>
          {recentLog.length === 0 ? (
            <p className="text-sm text-slate-500">No bets using promos or tokens yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b border-slate-800 text-slate-400">
                  <tr>
                    <th className="px-2 py-1.5 text-left">Date</th>
                    <th className="px-2 py-1.5 text-left">Sportsbooks</th>
                    <th className="px-2 py-1.5 text-right">Expected</th>
                    <th className="px-2 py-1.5 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentLog.map((x) => (
                    <tr key={x.id} className="border-b border-slate-800/60">
                      <td className="px-2 py-1.5 text-slate-300">{x.date}</td>
                      <td className="px-2 py-1.5 text-slate-400">
                        {[x.sideA?.sportsbook, x.sideB?.sportsbook].filter(Boolean).join(' / ')}
                      </td>
                      <td className="px-2 py-1.5 text-right text-slate-200">{x.expectedProfit !== '' ? formatUSD(x.expectedProfit) : '—'}</td>
                      <td className="px-2 py-1.5">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${x.status === 'Settled' ? 'bg-emerald-900/60 text-emerald-300' : 'bg-amber-900/50 text-amber-300'}`}>{x.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {promos.length === 0 && sportsbooks.length === 0 && log.length === 0 && (
        <EmptyState
          message="Welcome! Start by adding a sportsbook in the Bankroll Ledger and a promotion or token in Promotions & Tokens."
          action={
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => goTo('ledger')}>Add Sportsbook</Button>
              <Button onClick={() => goTo('promos')}>Add Promotion/Token</Button>
            </div>
          }
        />
      )}
    </div>
  )
}
