import React, { useState, useEffect, useMemo } from 'react'
import {
  Card, Button, Field, TextInput, NumberInput, Select, TextArea, Modal, EmptyState, SortHeader, sortRows,
} from '../components.jsx'
import { uid, formatUSD, formatPercent } from '../utils'
import { effectiveTokenStatus, tokenDisplayName } from './PromotionsTokens.jsx'

function emptyEntry() {
  return {
    id: uid(),
    date: new Date().toISOString().slice(0, 10),
    type: 'Arb/Boost',
    sportMarket: '',
    event: '',
    market: '',
    selection: '',
    sideA: { sportsbook: '', odds: '', stake: '' },
    sideB: { sportsbook: '', odds: '', stake: '' },
    promoId: '',
    tokenId: '',
    expectedProfit: '',
    status: 'Pending',
    actualProfit: '',
    notes: '',
  }
}

function EntryForm({ initial, onSave, onCancel, sportsbookNames, promos, tokens }) {
  const [e, setE] = useState(initial)
  const set = (k, v) => setE((p) => ({ ...p, [k]: v }))
  const setSide = (side, k, v) => setE((p) => ({ ...p, [side]: { ...p[side], [k]: v } }))
  const availableTokens = tokens.filter((token) => ['available', 'partially_used'].includes(effectiveTokenStatus(token)) || token.id === e.tokenId)

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Date">
          <TextInput type="date" value={e.date} onChange={(ev) => set('date', ev.target.value)} />
        </Field>
        <Field label="Type">
          <Select value={e.type} onChange={(ev) => set('type', ev.target.value)}>
            <option value="Arb/Boost">Arb/Boost</option>
            <option value="Free Bet">Free Bet</option>
            <option value="Manual Bet">Manual Bet</option>
          </Select>
        </Field>
        <Field label="Sport / Market">
          <TextInput value={e.sportMarket} onChange={(ev) => set('sportMarket', ev.target.value)} placeholder="e.g. NBA Moneyline" />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Event / Game">
          <TextInput value={e.event} onChange={(ev) => set('event', ev.target.value)} placeholder="e.g. Yankees at Red Sox" />
        </Field>
        <Field label="Market">
          <TextInput value={e.market} onChange={(ev) => set('market', ev.target.value)} placeholder="Moneyline, total, spread" />
        </Field>
        <Field label="Selection">
          <TextInput value={e.selection} onChange={(ev) => set('selection', ev.target.value)} placeholder="Team / side / prop" />
        </Field>
        <Field label="Payout / Winnings ($)">
          <NumberInput value={e.payout} onChange={(ev) => set('payout', ev.target.value)} step="0.01" />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {['sideA', 'sideB'].map((side) => (
          <div key={side} className="rounded-lg border border-slate-700 p-3">
            <div className="mb-2 text-xs font-semibold uppercase text-slate-400">{side === 'sideA' ? 'Side A' : 'Side B'}</div>
            <div className="space-y-2">
              <TextInput list="log-sb" placeholder="Sportsbook" value={e[side].sportsbook} onChange={(ev) => setSide(side, 'sportsbook', ev.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <TextInput placeholder="Odds" value={e[side].odds} onChange={(ev) => setSide(side, 'odds', ev.target.value)} />
                <TextInput placeholder="Stake" value={e[side].stake} onChange={(ev) => setSide(side, 'stake', ev.target.value)} />
              </div>
            </div>
          </div>
        ))}
      </div>
      <datalist id="log-sb">{sportsbookNames.map((n) => (<option key={n} value={n} />))}</datalist>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Linked Promotion (optional)">
          <Select value={e.promoId} onChange={(ev) => set('promoId', ev.target.value)}>
            <option value="">None</option>
            {promos.map((p) => (<option key={p.id} value={p.id}>{p.sportsbook} - {p.promotionName || p.name}</option>))}
          </Select>
        </Field>
        <Field label="Token Used (optional)">
          <Select value={e.tokenId || ''} onChange={(ev) => {
            const token = tokens.find((t) => t.id === ev.target.value)
            setE((prev) => ({ ...prev, tokenId: ev.target.value, promoId: token?.promotionId || prev.promoId }))
          }}>
            <option value="">No token used</option>
            {availableTokens.map((token) => (<option key={token.id} value={token.id}>{tokenDisplayName(token)} ({token.remainingQuantity} left)</option>))}
          </Select>
        </Field>
        <Field label="Expected Profit ($)">
          <NumberInput value={e.expectedProfit} onChange={(ev) => set('expectedProfit', ev.target.value)} step="0.01" />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Status">
          <Select value={e.status} onChange={(ev) => set('status', ev.target.value)}>
            <option value="Pending">Pending</option>
            <option value="Settled">Settled</option>
          </Select>
        </Field>
        <Field label="Actual Profit ($)" hint={e.status !== 'Settled' ? 'Enabled once status is Settled' : ''}>
          <NumberInput value={e.actualProfit} onChange={(ev) => set('actualProfit', ev.target.value)} step="0.01" disabled={e.status !== 'Settled'} />
        </Field>
      </div>

      <Field label="Notes">
        <TextArea value={e.notes} onChange={(ev) => set('notes', ev.target.value)} rows={2} />
      </Field>

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onSave(e)}>Save Entry</Button>
      </div>
    </div>
  )
}

export default function OpportunityLog({ log, setLog, promos, tokens, setTokens, sportsbookNames, prefill, clearPrefill }) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [sort, setSort] = useState({ key: 'date', dir: 'desc' })

  // filters
  const [fStatus, setFStatus] = useState('')
  const [fType, setFType] = useState('')
  const [fSportsbook, setFSportsbook] = useState('')
  const [fFrom, setFFrom] = useState('')
  const [fTo, setFTo] = useState('')

  // Open the form pre-filled from a calculator handoff.
  useEffect(() => {
    if (!prefill) return
    setEditing({ ...emptyEntry(), ...prefill, id: uid() })
    setModalOpen(true)
    clearPrefill()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill])

  function save(entry) {
    const previous = log.find((x) => x.id === entry.id)
    setLog((prev) => {
      const exists = prev.some((x) => x.id === entry.id)
      return exists ? prev.map((x) => (x.id === entry.id ? entry : x)) : [...prev, entry]
    })
    if (entry.tokenId || previous?.tokenId) {
      setTokens((prevTokens) => prevTokens.map((token) => {
        let next = { ...token, usedOnBetIds: Array.isArray(token.usedOnBetIds) ? token.usedOnBetIds : [] }
        if (previous?.tokenId === token.id && previous.tokenId !== entry.tokenId) {
          next.usedOnBetIds = next.usedOnBetIds.filter((id) => id !== entry.id)
          next.remainingQuantity = Math.min(Number(next.quantity || 1), Number(next.remainingQuantity || 0) + 1)
        }
        if (entry.tokenId === token.id && !next.usedOnBetIds.includes(entry.id)) {
          next.usedOnBetIds = [...next.usedOnBetIds, entry.id]
          next.remainingQuantity = Math.max(0, Number(next.remainingQuantity || 0) - 1)
        }
        if (next.remainingQuantity <= 0) next.status = 'used'
        else if (next.usedOnBetIds.length > 0) next.status = 'partially_used'
        else if (next.status === 'used' || next.status === 'partially_used') next.status = 'available'
        return next
      }))
    }
    setModalOpen(false); setEditing(null)
  }

  function remove(id) {
    if (window.confirm('Delete this log entry?')) {
      const entry = log.find((x) => x.id === id)
      setLog((prev) => prev.filter((x) => x.id !== id))
      if (entry?.tokenId) {
        setTokens((prevTokens) => prevTokens.map((token) => {
          if (token.id !== entry.tokenId) return token
          const usedOnBetIds = (token.usedOnBetIds || []).filter((betId) => betId !== id)
          const remainingQuantity = Math.min(Number(token.quantity || 1), Number(token.remainingQuantity || 0) + 1)
          return { ...token, usedOnBetIds, remainingQuantity, status: usedOnBetIds.length ? 'partially_used' : 'available' }
        }))
      }
    }
  }

  const filtered = useMemo(() => {
    return log.filter((x) => {
      if (fStatus && x.status !== fStatus) return false
      if (fType && x.type !== fType) return false
      if (fSportsbook && x.sideA?.sportsbook !== fSportsbook && x.sideB?.sportsbook !== fSportsbook) return false
      if (fFrom && x.date < fFrom) return false
      if (fTo && x.date > fTo) return false
      return true
    })
  }, [log, fStatus, fType, fSportsbook, fFrom, fTo])

  const sorted = useMemo(
    () => sortRows(filtered, sort, {
      date: (x) => new Date(x.date).getTime(),
      expectedProfit: (x) => Number(x.expectedProfit) || 0,
      actualProfit: (x) => Number(x.actualProfit) || 0,
    }),
    [filtered, sort],
  )

  const totals = useMemo(() => {
    const sumExpected = filtered.reduce((a, x) => a + (Number(x.expectedProfit) || 0), 0)
    const settled = filtered.filter((x) => x.status === 'Settled')
    const sumActual = settled.reduce((a, x) => a + (Number(x.actualProfit) || 0), 0)
    const sumExpectedSettled = settled.reduce((a, x) => a + (Number(x.expectedProfit) || 0), 0)
    const accuracy = sumExpectedSettled !== 0 ? (sumActual / sumExpectedSettled) * 100 : 0
    return { count: filtered.length, sumExpected, sumActual, accuracy, settledCount: settled.length }
  }, [filtered])

  const promoLabel = (id) => {
    const p = promos.find((x) => x.id === id)
    return p ? `${p.sportsbook} - ${p.promotionName || p.name}` : ''
  }

  const tokenLabel = (id) => {
    const token = tokens.find((x) => x.id === id)
    return token ? tokenDisplayName(token) : ''
  }

  function exportCSV() {
    const headers = ['Date', 'Type', 'Sport/Market', 'Event', 'Market', 'Selection', 'A Sportsbook', 'A Odds', 'A Stake', 'B Sportsbook', 'B Odds', 'B Stake', 'Linked Promo', 'Token Used', 'Expected Profit', 'Status', 'Actual Profit', 'Payout', 'Notes']
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const rows = log.map((x) => [
      x.date, x.type, x.sportMarket, x.event, x.market, x.selection,
      x.sideA?.sportsbook, x.sideA?.odds, x.sideA?.stake,
      x.sideB?.sportsbook, x.sideB?.odds, x.sideB?.stake,
      promoLabel(x.promoId), tokenLabel(x.tokenId), x.expectedProfit, x.status, x.actualProfit, x.payout, x.notes,
    ].map(esc).join(','))
    const csv = [headers.map(esc).join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `opportunity-log-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-100">Opportunity Log</h2>
          <p className="text-sm text-slate-400">Track placed bets and reconcile expected vs actual profit.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={exportCSV} disabled={log.length === 0}>⬇ Export CSV</Button>
          <Button onClick={() => { setEditing(emptyEntry()); setModalOpen(true) }}>＋ Add Entry</Button>
        </div>
      </div>

      <Card className="p-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <Select value={fType} onChange={(e) => setFType(e.target.value)}>
            <option value="">All types</option>
            <option value="Arb/Boost">Arb/Boost</option>
            <option value="Free Bet">Free Bet</option>
            <option value="Manual Bet">Manual Bet</option>
          </Select>
          <Select value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="Pending">Pending</option>
            <option value="Settled">Settled</option>
          </Select>
          <Select value={fSportsbook} onChange={(e) => setFSportsbook(e.target.value)}>
            <option value="">All sportsbooks</option>
            {sportsbookNames.map((n) => (<option key={n} value={n}>{n}</option>))}
          </Select>
          <TextInput type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} title="From date" />
          <TextInput type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} title="To date" />
        </div>
      </Card>

      {sorted.length === 0 ? (
        <EmptyState
          message={log.length === 0 ? 'No opportunities logged yet — save one from a calculator or add manually.' : 'No entries match your filters.'}
          action={log.length === 0 && <Button onClick={() => { setEditing(emptyEntry()); setModalOpen(true) }}>＋ Add Entry</Button>}
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-sm">
            <thead className="border-b border-slate-700">
              <tr>
                <SortHeader label="Date" sortKey="date" sort={sort} setSort={setSort} />
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Type</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Sport/Market</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Side A</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Side B</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Promo / Token</th>
                <SortHeader label="Expected" sortKey="expectedProfit" sort={sort} setSort={setSort} className="text-right" />
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Status</th>
                <SortHeader label="Actual" sortKey="actualProfit" sort={sort} setSort={setSort} className="text-right" />
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((x) => (
                <tr key={x.id} className="border-b border-slate-800">
                  <td className="px-3 py-2 text-slate-300">{x.date}</td>
                  <td className="px-3 py-2 text-slate-300">{x.type}</td>
                  <td className="px-3 py-2 text-slate-400">{x.sportMarket}</td>
                  <td className="px-3 py-2 text-slate-300">
                    <div className="text-xs">{x.sideA?.sportsbook}</div>
                    <div className="text-[11px] text-slate-500">{x.sideA?.odds} · {formatUSD(Number(x.sideA?.stake) || 0)}</div>
                  </td>
                  <td className="px-3 py-2 text-slate-300">
                    <div className="text-xs">{x.sideB?.sportsbook}</div>
                    <div className="text-[11px] text-slate-500">{x.sideB?.odds} · {x.sideB?.stake ? formatUSD(Number(x.sideB.stake) || 0) : ''}</div>
                  </td>
                  <td className="px-3 py-2 text-[11px] text-slate-400"><div>{promoLabel(x.promoId)}</div>{x.tokenId && <div className="text-emerald-300">{tokenLabel(x.tokenId)}</div>}</td>
                  <td className="px-3 py-2 text-right font-medium text-slate-200">{x.expectedProfit !== '' ? formatUSD(x.expectedProfit) : '—'}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${x.status === 'Settled' ? 'bg-emerald-900/60 text-emerald-300' : 'bg-amber-900/50 text-amber-300'}`}>{x.status}</span>
                  </td>
                  <td className={`px-3 py-2 text-right font-medium ${x.status === 'Settled' && x.actualProfit !== '' ? (Number(x.actualProfit) >= 0 ? 'text-profit' : 'text-loss') : 'text-slate-500'}`}>
                    {x.status === 'Settled' && x.actualProfit !== '' ? formatUSD(x.actualProfit) : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => { setEditing(x); setModalOpen(true) }}>✏️</Button>
                      <Button variant="ghost" className="px-2 py-1 text-xs text-red-400" onClick={() => remove(x.id)}>🗑</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-700 bg-slate-900/40 font-semibold">
                <td className="px-3 py-2 text-slate-300" colSpan={6}>
                  {totals.count} entr{totals.count === 1 ? 'y' : 'ies'} · {totals.settledCount} settled
                </td>
                <td className="px-3 py-2 text-right text-slate-200">{formatUSD(totals.sumExpected)}</td>
                <td className="px-3 py-2 text-right text-xs text-slate-400">
                  Accuracy<br />{totals.settledCount > 0 ? formatPercent(totals.accuracy) : '—'}
                </td>
                <td className={`px-3 py-2 text-right ${totals.sumActual >= 0 ? 'text-profit' : 'text-loss'}`}>{formatUSD(totals.sumActual)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </Card>
      )}

      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setEditing(null) }} title={editing && log.some((x) => x.id === editing.id) ? 'Edit Entry' : 'Add Entry'} wide>
        {editing && (
          <EntryForm
            initial={editing}
            onSave={save}
            onCancel={() => { setModalOpen(false); setEditing(null) }}
            sportsbookNames={sportsbookNames}
            promos={promos}
            tokens={tokens}
          />
        )}
      </Modal>
    </div>
  )
}
