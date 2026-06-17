import React, { useState, useMemo, useRef } from 'react'
import {
  Card,
  Button,
  Field,
  TextInput,
  NumberInput,
  Select,
  TextArea,
  Modal,
  EmptyState,
  SortHeader,
  sortRows,
  OddsInput,
  OddsFormatToggle,
} from '../components.jsx'
import {
  uid,
  SPORTS,
  PROMO_TYPES,
  MARKET_TAXONOMY,
  effectiveStatus,
  hoursUntil,
  countdownString,
  oddsInputToDecimal,
  formatUSD,
} from '../utils'
import { KNOWN_SPORTSBOOKS, PROMO_TEMPLATES, templateToPromo } from '../library'
import { isSupportedImage, scanPromoImage } from '../lib/scanPromo'

const BOOST_TYPES = ['Profit Boost', 'Odds Boost']
const BONUS_TYPES = ['Free Bet', 'Risk-Free Bet', 'Deposit Match']

// ---------------------------------------------------------------------------
// Promo library: pick your sportsbooks, typical promos auto-populate.
// ---------------------------------------------------------------------------
function PromoLibrary({ onAdd, onCancel, existingBooks }) {
  // Pre-select books the user already has, if they're in the known list.
  const [books, setBooks] = useState(() => {
    const init = {}
    KNOWN_SPORTSBOOKS.forEach((b) => { init[b] = existingBooks.includes(b) })
    return init
  })
  // Excluded template keys (everything included by default for selected books).
  const [excluded, setExcluded] = useState({})

  const toggleBook = (b) => setBooks((prev) => ({ ...prev, [b]: !prev[b] }))
  const toggleTpl = (key) => setExcluded((prev) => ({ ...prev, [key]: !prev[key] }))

  const selectedBooks = KNOWN_SPORTSBOOKS.filter((b) => books[b])

  const chosen = []
  selectedBooks.forEach((b) => {
    ;(PROMO_TEMPLATES[b] || []).forEach((tpl, idx) => {
      const key = `${b}::${idx}`
      if (!excluded[key]) chosen.push({ book: b, tpl })
    })
  })

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">
        Select the sportsbooks you have access to — their typical recurring promos populate below. These
        are editable <span className="text-amber-300">templates, not live offers</span>; adjust the boost
        %, amount, and expiration to match the real current promo.
      </p>

      <div>
        <div className="mb-2 text-xs font-semibold uppercase text-slate-400">Your sportsbooks</div>
        <div className="flex flex-wrap gap-2">
          {KNOWN_SPORTSBOOKS.map((b) => (
            <button
              key={b}
              onClick={() => toggleBook(b)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                books[b]
                  ? 'border-emerald-500 bg-emerald-600/20 text-emerald-300'
                  : 'border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {books[b] ? '✓ ' : ''}{b}
            </button>
          ))}
        </div>
      </div>

      {selectedBooks.length > 0 && (
        <div className="space-y-3">
          <div className="text-xs font-semibold uppercase text-slate-400">Promos to add</div>
          {selectedBooks.map((b) => (
            <div key={b} className="rounded-lg border border-slate-700 p-3">
              <div className="mb-2 text-sm font-semibold text-slate-200">{b}</div>
              <div className="space-y-1.5">
                {(PROMO_TEMPLATES[b] || []).map((tpl, idx) => {
                  const key = `${b}::${idx}`
                  const on = !excluded[key]
                  return (
                    <label key={key} className="flex cursor-pointer items-start gap-2 text-sm">
                      <input type="checkbox" checked={on} onChange={() => toggleTpl(key)} className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-900" />
                      <span>
                        <span className="text-slate-200">{tpl.name}</span>{' '}
                        <span className="text-xs text-slate-500">
                          · {tpl.promoType}
                          {tpl.boostPct != null ? ` ${tpl.boostPct}%` : ''}
                          {tpl.bonusAmount != null ? ` $${tpl.bonusAmount}` : ''}
                        </span>
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between pt-1">
        <span className="text-xs text-slate-500">{chosen.length} promo{chosen.length === 1 ? '' : 's'} selected</span>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button disabled={chosen.length === 0} onClick={() => onAdd(selectedBooks, chosen)}>
            Add {chosen.length} promo{chosen.length === 1 ? '' : 's'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function emptyPromo() {
  return {
    id: uid(),
    sportsbook: '',
    name: '',
    promoType: 'Profit Boost',
    boostPct: '',
    bonusAmount: '',
    sport: 'NFL',
    sportOther: '',
    market: '',
    minOdds: '',
    minOddsFormat: 'american',
    maxStake: '',
    expiration: '',
    notes: '',
    status: 'Active',
  }
}

// Convert a screenshot date/datetime into the form's datetime-local format.
function toDatetimeLocal(value) {
  const s = String(value).trim()
  if (!s) return ''
  // Date-only → default to end of day, since promos usually expire then.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T23:59`
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Map the AI-extracted promo fields onto the Promo Inventory form schema,
// coercing enums and odds format so the form renders a clean, reviewable draft.
function promoDraftFromScan(x) {
  const p = emptyPromo()
  if (x.sportsbook) p.sportsbook = String(x.sportsbook)
  if (x.name) p.name = String(x.name)
  if (x.promoType && PROMO_TYPES.includes(x.promoType)) p.promoType = x.promoType
  if (x.boostPct != null) p.boostPct = x.boostPct
  if (x.bonusAmount != null) p.bonusAmount = x.bonusAmount

  if (x.sport && SPORTS.includes(x.sport) && x.sport !== 'Other') {
    p.sport = x.sport
  } else if (x.sportOther || x.sport) {
    p.sport = 'Other'
    p.sportOther = String(x.sportOther || x.sport || '')
  }

  if (x.market) p.market = String(x.market)
  if (x.minOdds != null && x.minOdds !== '') {
    const s = String(x.minOdds).trim()
    p.minOdds = s
    // Signed or |value| >= 100 reads as American; otherwise decimal (e.g. 1.91).
    p.minOddsFormat = /[+-]/.test(s) || Math.abs(Number(s)) >= 100 ? 'american' : 'decimal'
  }
  if (x.maxStake != null) p.maxStake = x.maxStake
  if (x.expiration) p.expiration = toDatetimeLocal(x.expiration)
  if (x.notes) p.notes = String(x.notes)
  return p
}

function PromoForm({ initial, onSave, onCancel, sportsbookNames, onAddSportsbook }) {
  const [p, setP] = useState(initial)
  const [error, setError] = useState('')
  const set = (k, v) => setP((prev) => ({ ...prev, [k]: v }))

  const showBoost = BOOST_TYPES.includes(p.promoType)
  const showBonus = BONUS_TYPES.includes(p.promoType)
  const marketSuggestions = MARKET_TAXONOMY[p.sport] || []

  function submit() {
    if (!p.sportsbook.trim()) return setError('Sportsbook is required.')
    if (!p.name.trim()) return setError('Promo name is required.')
    if (showBoost && !(Number(p.boostPct) >= 0 && p.boostPct !== '')) return setError('Boost % is required for this promo type.')
    if (showBonus && !(Number(p.bonusAmount) >= 0 && p.bonusAmount !== '')) return setError('Bonus/Free Bet amount is required for this promo type.')
    if (p.sport === 'Other' && !p.sportOther.trim()) return setError('Please specify the sport.')
    setError('')
    onSave(p)
  }

  return (
    <div className="space-y-3">
      {error && <div className="rounded bg-red-950/50 px-3 py-2 text-xs text-red-300">{error}</div>}

      <Field label="Sportsbook" required>
        <div className="flex gap-2">
          <Select value={p.sportsbook} onChange={(e) => {
            if (e.target.value === '__add__') {
              const name = window.prompt('New sportsbook name:')
              if (name && name.trim()) {
                onAddSportsbook(name.trim())
                set('sportsbook', name.trim())
              }
            } else set('sportsbook', e.target.value)
          }}>
            <option value="">Select…</option>
            {sportsbookNames.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
            {p.sportsbook && !sportsbookNames.includes(p.sportsbook) && (
              <option value={p.sportsbook}>{p.sportsbook}</option>
            )}
            <option value="__add__">＋ Add new sportsbook…</option>
          </Select>
        </div>
      </Field>

      <Field label="Promo Name / Description" required>
        <TextInput value={p.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. 30% Profit Boost on any NBA parlay" />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Promo Type" required>
          <Select value={p.promoType} onChange={(e) => set('promoType', e.target.value)}>
            {PROMO_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </Select>
        </Field>
        {showBoost && (
          <Field label="Boost %" required>
            <NumberInput value={p.boostPct} onChange={(e) => set('boostPct', e.target.value)} min="0" step="1" placeholder="e.g. 30" />
          </Field>
        )}
        {showBonus && (
          <Field label="Bonus / Free Bet Amount ($)" required>
            <NumberInput value={p.bonusAmount} onChange={(e) => set('bonusAmount', e.target.value)} min="0" step="5" />
          </Field>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Sport">
          <Select value={p.sport} onChange={(e) => set('sport', e.target.value)}>
            {SPORTS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
        </Field>
        {p.sport === 'Other' ? (
          <Field label="Specify Sport" required>
            <TextInput value={p.sportOther} onChange={(e) => set('sportOther', e.target.value)} />
          </Field>
        ) : (
          <Field label="Market / Sub-Category">
            <TextInput list="market-suggest" value={p.market} onChange={(e) => set('market', e.target.value)} placeholder="e.g. Moneyline" />
            <datalist id="market-suggest">
              {marketSuggestions.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </Field>
        )}
      </div>

      {p.sport === 'Other' && (
        <Field label="Market / Sub-Category">
          <TextInput value={p.market} onChange={(e) => set('market', e.target.value)} placeholder="Custom market" />
        </Field>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Minimum Odds Requirement (optional)">
          <div className="flex items-center gap-2">
            <OddsInput value={p.minOdds} onChange={(v) => set('minOdds', v)} format={p.minOddsFormat} />
            <OddsFormatToggle format={p.minOddsFormat} onChange={(f) => set('minOddsFormat', f)} />
          </div>
        </Field>
        <Field label="Maximum Stake promo applies to (optional, $)">
          <NumberInput value={p.maxStake} onChange={(e) => set('maxStake', e.target.value)} min="0" step="5" />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Expiration Date/Time">
          <TextInput type="datetime-local" value={p.expiration} onChange={(e) => set('expiration', e.target.value)} />
        </Field>
        <Field label="Status">
          <Select value={p.status} onChange={(e) => set('status', e.target.value)}>
            <option value="Active">Active</option>
            <option value="Used">Used</option>
            <option value="Expired">Expired</option>
          </Select>
        </Field>
      </div>

      <Field label="Restrictions / Fine Print Notes">
        <TextArea value={p.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Min odds, eligible markets, wagering requirements…" />
      </Field>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button onClick={submit}>Save Promo</Button>
      </div>
    </div>
  )
}

function statusBadge(status) {
  const cls =
    status === 'Active'
      ? 'bg-emerald-900/60 text-emerald-300'
      : status === 'Used'
      ? 'bg-slate-700 text-slate-300'
      : 'bg-red-900/60 text-red-300'
  return <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${cls}`}>{status}</span>
}

export default function PromoInventory({ promos, setPromos, sportsbookNames, setSportsbooks, sportsbooks, useInCalculator }) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [libOpen, setLibOpen] = useState(false)
  const [scanState, setScanState] = useState({ status: 'idle', message: '' }) // idle | loading | error
  const [scanReview, setScanReview] = useState(false) // reviewing an AI-extracted draft
  const scanRef = useRef(null)
  const [sort, setSort] = useState({ key: 'expiration', dir: 'asc' })
  const [fSportsbook, setFSportsbook] = useState('')
  const [fSport, setFSport] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [search, setSearch] = useState('')

  function addSportsbookIfMissing(name) {
    setSportsbooks((prev) =>
      prev.some((s) => s.name === name) ? prev : [...prev, { name, balance: 0, transactions: [] }],
    )
  }

  function save(promo) {
    addSportsbookIfMissing(promo.sportsbook)
    setPromos((prev) => {
      const exists = prev.some((x) => x.id === promo.id)
      return exists ? prev.map((x) => (x.id === promo.id ? promo : x)) : [...prev, promo]
    })
    closeForm()
  }

  function closeForm() {
    setModalOpen(false)
    setEditing(null)
    setScanReview(false)
  }

  // Screenshot → Claude vision extraction → prefilled form for review.
  async function onScanPicked(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-scanning the same file
    if (!file) return
    if (!isSupportedImage(file)) {
      setScanState({ status: 'error', message: 'Please choose a PNG, JPEG, GIF, or WebP image.' })
      return
    }
    setScanState({ status: 'loading', message: 'Reading screenshot with Claude…' })
    try {
      const extracted = await scanPromoImage(file, 'promo')
      setEditing(promoDraftFromScan(extracted))
      setScanReview(true)
      setModalOpen(true)
      setScanState({ status: 'idle', message: '' })
    } catch (err) {
      setScanState({ status: 'error', message: err.message })
    }
  }

  // Bulk-add promos from the template library; create any missing sportsbooks.
  function addFromLibrary(books, chosen) {
    books.forEach((b) => addSportsbookIfMissing(b))
    const newPromos = chosen.map(({ book, tpl }) => templateToPromo(book, tpl, uid))
    setPromos((prev) => [...prev, ...newPromos])
    setLibOpen(false)
  }

  function remove(id) {
    if (window.confirm('Delete this promo?')) setPromos((prev) => prev.filter((p) => p.id !== id))
  }

  const sportLabel = (p) => (p.sport === 'Other' ? p.sportOther || 'Other' : p.sport)

  const filtered = useMemo(() => {
    return promos.filter((p) => {
      const st = effectiveStatus(p)
      if (fSportsbook && p.sportsbook !== fSportsbook) return false
      if (fSport && sportLabel(p) !== fSport) return false
      if (fStatus && st !== fStatus) return false
      if (search) {
        const q = search.toLowerCase()
        if (!(`${p.name} ${p.notes}`.toLowerCase().includes(q))) return false
      }
      return true
    })
  }, [promos, fSportsbook, fSport, fStatus, search])

  const sorted = useMemo(
    () =>
      sortRows(filtered, sort, {
        expiration: (p) => (p.expiration ? new Date(p.expiration).getTime() : Infinity),
        sportsbook: (p) => p.sportsbook,
        sport: (p) => sportLabel(p),
        status: (p) => effectiveStatus(p),
      }),
    [filtered, sort],
  )

  const allSportsbooks = useMemo(
    () => [...new Set([...sportsbookNames, ...promos.map((p) => p.sportsbook)])].filter(Boolean),
    [sportsbookNames, promos],
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-100">Promo Inventory</h2>
          <p className="text-sm text-slate-400">{promos.length} promo{promos.length === 1 ? '' : 's'} tracked</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input ref={scanRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={onScanPicked} />
          <Button variant="secondary" onClick={() => setLibOpen(true)}>📚 Add from Library</Button>
          <Button
            variant="secondary"
            onClick={() => { setScanState({ status: 'idle', message: '' }); scanRef.current?.click() }}
            disabled={scanState.status === 'loading'}
          >
            {scanState.status === 'loading' ? '⏳ Reading…' : '📷 Scan Screenshot'}
          </Button>
          <Button onClick={() => { setEditing(emptyPromo()); setModalOpen(true) }}>＋ Add Promo</Button>
        </div>
      </div>

      {scanState.status === 'loading' && (
        <div className="rounded bg-sky-950/50 px-3 py-2 text-xs text-sky-200">⏳ {scanState.message}</div>
      )}
      {scanState.status === 'error' && (
        <div className="flex items-start justify-between gap-3 rounded bg-red-950/50 px-3 py-2 text-xs text-red-200">
          <span>⚠ {scanState.message}</span>
          <button className="text-red-300 hover:text-white" onClick={() => setScanState({ status: 'idle', message: '' })}>✕</button>
        </div>
      )}

      {/* Filters */}
      <Card className="p-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <TextInput placeholder="🔎 Search name / notes" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select value={fSportsbook} onChange={(e) => setFSportsbook(e.target.value)}>
            <option value="">All sportsbooks</option>
            {allSportsbooks.map((n) => (<option key={n} value={n}>{n}</option>))}
          </Select>
          <Select value={fSport} onChange={(e) => setFSport(e.target.value)}>
            <option value="">All sports</option>
            {SPORTS.map((s) => (<option key={s} value={s}>{s}</option>))}
          </Select>
          <Select value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="Active">Active</option>
            <option value="Used">Used</option>
            <option value="Expired">Expired</option>
          </Select>
        </div>
      </Card>

      {sorted.length === 0 ? (
        <EmptyState
          message={promos.length === 0 ? 'No promos added yet — add your sportsbooks from the library to auto-populate typical promos, or add one manually.' : 'No promos match your filters.'}
          action={promos.length === 0 && (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setLibOpen(true)}>📚 Add from Library</Button>
              <Button onClick={() => { setEditing(emptyPromo()); setModalOpen(true) }}>＋ Add Promo</Button>
            </div>
          )}
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="border-b border-slate-700">
              <tr>
                <SortHeader label="Sportsbook" sortKey="sportsbook" sort={sort} setSort={setSort} />
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Promo</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Type</th>
                <SortHeader label="Sport" sortKey="sport" sort={sort} setSort={setSort} />
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Value</th>
                <SortHeader label="Expires" sortKey="expiration" sort={sort} setSort={setSort} />
                <SortHeader label="Status" sortKey="status" sort={sort} setSort={setSort} />
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => {
                const st = effectiveStatus(p)
                const hrs = hoursUntil(p.expiration)
                const rowClass =
                  st !== 'Expired' && hrs <= 24
                    ? 'bg-red-950/30'
                    : st !== 'Expired' && hrs <= 48
                    ? 'bg-amber-950/30'
                    : ''
                return (
                  <tr key={p.id} className={`border-b border-slate-800 ${rowClass}`}>
                    <td className="px-3 py-2 text-slate-200">{p.sportsbook}</td>
                    <td className="px-3 py-2">
                      <div className="text-slate-200">{p.name}</div>
                      {p.market && <div className="text-[11px] text-slate-500">{p.market}</div>}
                    </td>
                    <td className="px-3 py-2 text-slate-300">{p.promoType}</td>
                    <td className="px-3 py-2 text-slate-300">{sportLabel(p)}</td>
                    <td className="px-3 py-2 text-slate-300">
                      {BOOST_TYPES.includes(p.promoType) && p.boostPct !== '' ? `${p.boostPct}%` : ''}
                      {BONUS_TYPES.includes(p.promoType) && p.bonusAmount !== '' ? formatUSD(p.bonusAmount) : ''}
                    </td>
                    <td className="px-3 py-2 text-slate-300">
                      {p.expiration ? (
                        <div>
                          <div className="text-xs">{new Date(p.expiration).toLocaleString()}</div>
                          {st !== 'Expired' && hrs <= 48 && (
                            <div className={`text-[11px] font-medium ${hrs <= 24 ? 'text-red-400' : 'text-amber-400'}`}>
                              in {countdownString(p.expiration)}
                            </div>
                          )}
                        </div>
                      ) : <span className="text-slate-600">—</span>}
                    </td>
                    <td className="px-3 py-2">{statusBadge(st)}</td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => useInCalculator(p)} title="Use in Calculator">📐</Button>
                        <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => { setEditing(p); setModalOpen(true) }} title="Edit">✏️</Button>
                        <Button variant="ghost" className="px-2 py-1 text-xs text-red-400" onClick={() => remove(p.id)} title="Delete">🗑</Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}

      <Modal open={modalOpen} onClose={closeForm} title={scanReview ? 'Review Scanned Promo' : editing && promos.some((x) => x.id === editing.id) ? 'Edit Promo' : 'Add Promo'} wide>
        {editing && (
          <>
            {scanReview && (
              <div className="mb-3 rounded bg-sky-950/50 px-3 py-2 text-xs text-sky-200">
                ✨ Pre-filled from your screenshot by Claude. <span className="font-semibold">Review every field</span> —
                especially boost %, amount, and min odds — then save.
              </div>
            )}
            <PromoForm
              initial={editing}
              onSave={save}
              onCancel={closeForm}
              sportsbookNames={allSportsbooks}
              onAddSportsbook={addSportsbookIfMissing}
            />
          </>
        )}
      </Modal>

      <Modal open={libOpen} onClose={() => setLibOpen(false)} title="Add Promos from Library" wide>
        <PromoLibrary
          onAdd={addFromLibrary}
          onCancel={() => setLibOpen(false)}
          existingBooks={allSportsbooks}
        />
      </Modal>
    </div>
  )
}
