import React, { useState, useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend,
} from 'recharts'
import {
  Card, Button, Field, TextInput, NumberInput, Select, TextArea, Modal, EmptyState,
} from '../components.jsx'
import { uid, TXN_TYPES, txnSign, formatUSD } from '../utils'

// Recompute a sportsbook's balance from its transaction history.
function computeBalance(transactions) {
  return transactions.reduce((acc, t) => acc + txnSign(t.type) * Number(t.amount || 0), 0)
}

const CHART_COLORS = ['#22c55e', '#38bdf8', '#f59e0b', '#a78bfa', '#f472b6', '#facc15', '#34d399', '#fb7185']

export default function BankrollLedger({ sportsbooks, setSportsbooks }) {
  const [addSbOpen, setAddSbOpen] = useState(false)
  const [newSbName, setNewSbName] = useState('')
  const [newSbBalance, setNewSbBalance] = useState('')
  const [txnFor, setTxnFor] = useState(null) // sportsbook name
  const [editSb, setEditSb] = useState(null)
  const [error, setError] = useState('')

  // Transaction form state
  const [txnType, setTxnType] = useState('Deposit')
  const [txnAmount, setTxnAmount] = useState('')
  const [txnDate, setTxnDate] = useState(() => new Date().toISOString().slice(0, 16))
  const [txnNote, setTxnNote] = useState('')

  const withBalances = useMemo(
    () =>
      sportsbooks
        .map((s) => ({ ...s, balance: computeBalance(s.transactions || []) }))
        .sort((a, b) => b.balance - a.balance),
    [sportsbooks],
  )

  const totalBankroll = useMemo(() => withBalances.reduce((a, s) => a + s.balance, 0), [withBalances])

  function addSportsbook() {
    const name = newSbName.trim()
    if (!name) return setError('Name required.')
    if (sportsbooks.some((s) => s.name.toLowerCase() === name.toLowerCase())) return setError('That sportsbook already exists.')
    const transactions = []
    if (Number(newSbBalance) !== 0 && newSbBalance !== '') {
      transactions.push({
        id: uid(),
        date: new Date().toISOString().slice(0, 16),
        type: 'Manual Adjustment',
        amount: Number(newSbBalance),
        note: 'Initial balance',
      })
    }
    setSportsbooks((prev) => [...prev, { name, balance: Number(newSbBalance) || 0, transactions }])
    setNewSbName(''); setNewSbBalance(''); setError(''); setAddSbOpen(false)
  }

  function removeSportsbook(name) {
    if (window.confirm(`Remove ${name} and its transaction history?`))
      setSportsbooks((prev) => prev.filter((s) => s.name !== name))
  }

  function renameSportsbook(oldName, nextName) {
    const name = nextName.trim()
    if (!name) return
    if (name !== oldName && sportsbooks.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      setError('That name is taken.'); return
    }
    setSportsbooks((prev) => prev.map((s) => (s.name === oldName ? { ...s, name } : s)))
    setEditSb(null); setError('')
  }

  function openTxn(name) {
    setTxnFor(name); setTxnType('Deposit'); setTxnAmount(''); setTxnNote('')
    setTxnDate(new Date().toISOString().slice(0, 16)); setError('')
  }

  function submitTxn() {
    const amt = Number(txnAmount)
    if (txnType !== 'Manual Adjustment' && !(amt > 0)) return setError('Enter a positive amount.')
    if (txnType === 'Manual Adjustment' && !txnNote.trim()) return setError('A note is required for manual adjustments.')
    if (txnType === 'Manual Adjustment' && Number.isNaN(amt)) return setError('Enter an amount (may be negative).')
    const txn = { id: uid(), date: txnDate, type: txnType, amount: amt, note: txnNote.trim() }
    setSportsbooks((prev) =>
      prev.map((s) => (s.name === txnFor ? { ...s, transactions: [...(s.transactions || []), txn] } : s)),
    )
    setTxnFor(null); setError('')
  }

  function removeTxn(sbName, txnId) {
    setSportsbooks((prev) =>
      prev.map((s) =>
        s.name === sbName ? { ...s, transactions: s.transactions.filter((t) => t.id !== txnId) } : s,
      ),
    )
  }

  // Build chart data: union of all transaction timestamps; each sportsbook's
  // running balance carried forward at each point.
  const chartData = useMemo(() => {
    const events = []
    sportsbooks.forEach((s) => (s.transactions || []).forEach((t) => events.push({ ...t, sb: s.name })))
    events.sort((a, b) => new Date(a.date) - new Date(b.date))
    if (events.length === 0) return []
    const running = {}
    sportsbooks.forEach((s) => (running[s.name] = 0))
    const points = []
    events.forEach((e) => {
      running[e.sb] += txnSign(e.type) * Number(e.amount || 0)
      points.push({ date: new Date(e.date).toLocaleDateString(), ...running })
    })
    return points
  }, [sportsbooks])

  const [chartUnavailable] = useState(typeof ResponsiveContainer !== 'function')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-100">Bankroll Ledger</h2>
          <p className="text-sm text-slate-400">Track balances and transactions across sportsbooks.</p>
        </div>
        <Button onClick={() => { setAddSbOpen(true); setError('') }}>＋ Add Sportsbook</Button>
      </div>

      <Card className="flex flex-wrap items-center justify-between gap-2 p-5">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-400">Total Bankroll</div>
          <div className="text-3xl font-bold text-emerald-400">{formatUSD(totalBankroll)}</div>
        </div>
        <div className="text-right text-xs text-slate-500">
          {withBalances.length} sportsbook{withBalances.length === 1 ? '' : 's'}
        </div>
      </Card>

      {withBalances.length === 0 ? (
        <EmptyState
          message='No sportsbooks added yet — click "Add Sportsbook" to start tracking your bankroll.'
          action={<Button onClick={() => setAddSbOpen(true)}>＋ Add Sportsbook</Button>}
        />
      ) : (
        <>
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-slate-700">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Sportsbook</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">Balance</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">Txns</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {withBalances.map((s) => (
                  <tr key={s.name} className="border-b border-slate-800">
                    <td className="px-3 py-2 font-medium text-slate-200">{s.name}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${s.balance >= 0 ? 'text-profit' : 'text-loss'}`}>{formatUSD(s.balance)}</td>
                    <td className="px-3 py-2 text-right text-slate-400">{(s.transactions || []).length}</td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => openTxn(s.name)}>＋ Txn</Button>
                        <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => { setEditSb(s.name); setNewSbName(s.name) }} title="Rename">✏️</Button>
                        <Button variant="ghost" className="px-2 py-1 text-xs text-red-400" onClick={() => removeSportsbook(s.name)} title="Remove">🗑</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Balance over time */}
          <Card className="p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-200">Balance Over Time</h3>
            {chartData.length === 0 ? (
              <p className="text-sm text-slate-500">Add transactions to see the balance history.</p>
            ) : chartUnavailable ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr>
                      <th className="px-2 py-1 text-left text-slate-400">Date</th>
                      {sportsbooks.map((s) => (<th key={s.name} className="px-2 py-1 text-right text-slate-400">{s.name}</th>))}
                    </tr>
                  </thead>
                  <tbody>
                    {chartData.map((row, i) => (
                      <tr key={i} className="border-t border-slate-800">
                        <td className="px-2 py-1 text-slate-300">{row.date}</td>
                        {sportsbooks.map((s) => (<td key={s.name} className="px-2 py-1 text-right text-slate-300">{formatUSD(row[s.name] || 0)}</td>))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ width: '100%', height: 300 }}>
                <ResponsiveContainer>
                  <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="date" stroke="#64748b" fontSize={11} />
                    <YAxis stroke="#64748b" fontSize={11} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                      formatter={(v) => formatUSD(v)}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {sportsbooks.map((s, i) => (
                      <Line key={s.name} type="monotone" dataKey={s.name} stroke={CHART_COLORS[i % CHART_COLORS.length]} dot={false} strokeWidth={2} connectNulls />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          {/* Transaction histories */}
          {withBalances.map((s) => (
            (s.transactions || []).length > 0 && (
              <Card key={s.name} className="overflow-hidden">
                <div className="border-b border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200">{s.name} — Transactions</div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-xs">
                    <thead className="border-b border-slate-800">
                      <tr>
                        <th className="px-3 py-2 text-left text-slate-400">Date</th>
                        <th className="px-3 py-2 text-left text-slate-400">Type</th>
                        <th className="px-3 py-2 text-right text-slate-400">Amount</th>
                        <th className="px-3 py-2 text-left text-slate-400">Note</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...s.transactions].sort((a, b) => new Date(b.date) - new Date(a.date)).map((t) => (
                        <tr key={t.id} className="border-b border-slate-800/60">
                          <td className="px-3 py-1.5 text-slate-400">{new Date(t.date).toLocaleString()}</td>
                          <td className="px-3 py-1.5 text-slate-300">{t.type}</td>
                          <td className={`px-3 py-1.5 text-right font-medium ${txnSign(t.type) * Number(t.amount) >= 0 ? 'text-profit' : 'text-loss'}`}>
                            {txnSign(t.type) * Number(t.amount) >= 0 ? '+' : '−'}{formatUSD(Math.abs(Number(t.amount))).replace('$', '$')}
                          </td>
                          <td className="px-3 py-1.5 text-slate-400">{t.note}</td>
                          <td className="px-3 py-1.5 text-right">
                            <button className="text-red-400 hover:text-red-300" onClick={() => removeTxn(s.name, t.id)}>✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )
          ))}
        </>
      )}

      {/* Add sportsbook modal */}
      <Modal open={addSbOpen} onClose={() => setAddSbOpen(false)} title="Add Sportsbook">
        {error && <div className="mb-2 rounded bg-red-950/50 px-3 py-2 text-xs text-red-300">{error}</div>}
        <div className="space-y-3">
          <Field label="Sportsbook Name" required>
            <TextInput value={newSbName} onChange={(e) => setNewSbName(e.target.value)} placeholder="e.g. DraftKings" />
          </Field>
          <Field label="Starting Balance ($)" hint="Optional — recorded as an initial adjustment">
            <NumberInput value={newSbBalance} onChange={(e) => setNewSbBalance(e.target.value)} step="10" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAddSbOpen(false)}>Cancel</Button>
            <Button onClick={addSportsbook}>Add</Button>
          </div>
        </div>
      </Modal>

      {/* Rename modal */}
      <Modal open={!!editSb} onClose={() => { setEditSb(null); setError('') }} title="Rename Sportsbook">
        {error && <div className="mb-2 rounded bg-red-950/50 px-3 py-2 text-xs text-red-300">{error}</div>}
        <Field label="Name" required>
          <TextInput value={newSbName} onChange={(e) => setNewSbName(e.target.value)} />
        </Field>
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => { setEditSb(null); setError('') }}>Cancel</Button>
          <Button onClick={() => renameSportsbook(editSb, newSbName)}>Save</Button>
        </div>
      </Modal>

      {/* Add transaction modal */}
      <Modal open={!!txnFor} onClose={() => setTxnFor(null)} title={`Add Transaction — ${txnFor || ''}`}>
        {error && <div className="mb-2 rounded bg-red-950/50 px-3 py-2 text-xs text-red-300">{error}</div>}
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Type" required>
              <Select value={txnType} onChange={(e) => setTxnType(e.target.value)}>
                {TXN_TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
              </Select>
            </Field>
            <Field label={txnType === 'Manual Adjustment' ? 'Amount ($, may be negative)' : 'Amount ($)'} required>
              <NumberInput value={txnAmount} onChange={(e) => setTxnAmount(e.target.value)} step="5" />
            </Field>
          </div>
          <Field label="Date">
            <TextInput type="datetime-local" value={txnDate} onChange={(e) => setTxnDate(e.target.value)} />
          </Field>
          <Field label="Note" required={txnType === 'Manual Adjustment'}>
            <TextArea value={txnNote} onChange={(e) => setTxnNote(e.target.value)} rows={2} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setTxnFor(null)}>Cancel</Button>
            <Button onClick={submitTxn}>Add Transaction</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
