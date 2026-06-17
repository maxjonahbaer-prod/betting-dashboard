import React, { useState, useEffect, useMemo } from 'react'
import { Card, Button, Select, EmptyState, OddsFormatToggle, StatCard } from '../components.jsx'
import { formatOdds } from '../utils'
import { usePersistentState } from '../storage'

const BOOKS = ['DraftKings', 'FanDuel']

function compareKey(market, selection, line) {
  const l = line == null || line === '' ? '' : `@${line}`
  return `${(market || '').trim().toLowerCase()}|${(selection || '').trim().toLowerCase()}${l}`
}

export default function Sports() {
  const [catalog, setCatalog] = useState({}) // { Soccer: [{name}], ... }
  const [sport, setSport] = usePersistentState('sportsSport', 'Soccer')
  const [competition, setCompetition] = usePersistentState('sportsCompetition', 'FIFA World Cup')
  const [selectedBooks, setSelectedBooks] = usePersistentState('sportsBooks', BOOKS)
  const [results, setResults] = usePersistentState('sportsResults', [])
  const [format, setFormat] = useState('american')
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [overrides, setOverrides] = usePersistentState('sportsOverrides', {})
  const [region, setRegion] = usePersistentState('sportsRegion', 'nj')

  useEffect(() => {
    fetch('/api/sports')
      .then((r) => (r.ok ? r.json() : {}))
      .then(setCatalog)
      .catch(() => setCatalog({}))
  }, [])

  const sportNames = Object.keys(catalog)
  const competitions = catalog[sport] || []

  function toggleBook(b) {
    setSelectedBooks((prev) => (prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]))
  }

  async function load() {
    if (selectedBooks.length === 0) {
      setError('Select at least one sportsbook.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/league', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sport, competition, books: selectedBooks, overrides, region }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Server error (${res.status})`)
      }
      const data = await res.json()
      setResults(data.results || [])
    } catch (e) {
      setError(`${e.message}. Is the odds server running?  →  npm run server`)
    } finally {
      setLoading(false)
    }
  }

  async function loadDemo() {
    setLoading(true)
    setError('')
    try {
      const data = await (await fetch('/api/sports-demo')).json()
      setResults(data.results || [])
    } catch (e) {
      setError(`Could not load sample data: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  const ok = results.filter((r) => r.ok)
  const failed = results.filter((r) => !r.ok)
  const books = ok.map((r) => r.book)

  // Build: match -> ordered list of selection rows with each book's odds.
  const matches = useMemo(() => {
    const map = new Map()
    for (const r of ok) {
      for (const ev of r.events) {
        if (!map.has(ev.event)) map.set(ev.event, new Map())
        const sels = map.get(ev.event)
        for (const row of ev.odds) {
          const key = compareKey(row.market_name, row.selection_name, row.line)
          if (!sels.has(key)) {
            sels.set(key, {
              market: row.market_name,
              selection: row.selection_name,
              line: row.line,
              byBook: {},
            })
          }
          const e = sels.get(key)
          if (e.byBook[r.book] == null || row.odds > e.byBook[r.book]) e.byBook[r.book] = row.odds
        }
      }
    }
    const f = filter.trim().toLowerCase()
    return [...map.entries()].map(([event, sels]) => {
      let rows = [...sels.values()]
      if (f) {
        rows = rows.filter(
          (x) =>
            (x.market || '').toLowerCase().includes(f) ||
            (x.selection || '').toLowerCase().includes(f) ||
            event.toLowerCase().includes(f),
        )
      }
      return { event, rows }
    }).filter((m) => m.rows.length > 0)
  }, [ok, filter])

  const totalSelections = ok.reduce((s, r) => s + (r.selectionCount || 0), 0)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-100">Sports</h2>
          <p className="max-w-2xl text-sm text-slate-400">
            Pull every match in a competition across books and compare prices side by side. Starting
            with soccer — the FIFA World Cup on DraftKings and FanDuel.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Odds format</span>
          <OddsFormatToggle format={format} onChange={setFormat} />
        </div>
      </div>

      {/* Controls */}
      <Card className="p-4">
        {error && (
          <div className="mb-3 rounded bg-red-950/50 px-3 py-2 text-xs text-red-300">{error}</div>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-300">Sport</span>
            <Select value={sport} onChange={(e) => setSport(e.target.value)}>
              {(sportNames.length ? sportNames : ['Soccer']).map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-300">Competition</span>
            <Select value={competition} onChange={(e) => setCompetition(e.target.value)}>
              {(competitions.length ? competitions : [{ name: 'FIFA World Cup' }]).map((c) => (
                <option key={c.name} value={c.name}>{c.name}</option>
              ))}
            </Select>
          </label>
          <div className="sm:col-span-2">
            <span className="mb-1 block text-xs font-medium text-slate-300">Sportsbooks</span>
            <div className="flex flex-wrap gap-2 pt-1">
              {BOOKS.map((b) => (
                <button
                  key={b}
                  onClick={() => toggleBook(b)}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                    selectedBooks.includes(b)
                      ? 'border-emerald-500 bg-emerald-600/20 text-emerald-300'
                      : 'border-slate-600 bg-slate-900/60 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {selectedBooks.includes(b) ? '✓ ' : ''}{b}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <button
            className="text-xs text-slate-400 underline hover:text-slate-200"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            {showAdvanced ? 'Hide' : 'Advanced'} (competition IDs / region)
          </button>
          <div className="flex gap-2">
            <Button variant="secondary" className="text-xs" onClick={loadDemo} disabled={loading}>
              Load sample data
            </Button>
            <Button onClick={load} disabled={loading}>
              {loading ? 'Loading…' : '⚡ Load Odds'}
            </Button>
          </div>
        </div>

        {showAdvanced && (
          <div className="mt-3 grid gap-3 border-t border-slate-700 pt-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-300">DraftKings league ID</span>
              <input
                value={overrides.DraftKings || ''}
                onChange={(e) => setOverrides((p) => ({ ...p, DraftKings: e.target.value }))}
                placeholder="numeric leagueId (overrides default)"
                className="w-full rounded-lg border border-slate-600 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-300">FanDuel page ID</span>
              <input
                value={overrides.FanDuel || ''}
                onChange={(e) => setOverrides((p) => ({ ...p, FanDuel: e.target.value }))}
                placeholder="customPageId slug (overrides default)"
                className="w-full rounded-lg border border-slate-600 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-300">FanDuel region</span>
              <input
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="nj, ny, co, …"
                className="w-full rounded-lg border border-slate-600 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
              />
            </label>
            <p className="text-[11px] text-slate-500 sm:col-span-3">
              These competition IDs change each tournament. If a book returns nothing, grab the correct
              ID from its event-group / competition URL while logged in and paste it here.
            </p>
          </div>
        )}
      </Card>

      {failed.length > 0 && (
        <Card className="border-amber-700/50 p-4">
          <div className="mb-2 text-sm font-semibold text-amber-300">
            {failed.length} book{failed.length === 1 ? '' : 's'} could not be loaded
          </div>
          <ul className="space-y-1 text-xs text-amber-200/80">
            {failed.map((r, i) => (
              <li key={i} className="break-all">
                <span className="text-amber-400">•</span> <b>{r.book}</b> — {r.error}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {ok.length === 0 ? (
        <EmptyState message="No matches loaded yet. Pick a competition and books, then Load Odds — or Load sample data to preview the layout." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Books Loaded" value={books.length} />
            <StatCard label="Matches" value={matches.length} />
            <StatCard label="Total Selections" value={totalSelections} />
            <StatCard
              label="Comparable"
              value={matches.reduce((s, m) => s + m.rows.filter((r) => Object.keys(r.byBook).length > 1).length, 0)}
              accent="profit"
            />
          </div>

          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by team, market, or selection…"
            className="w-full rounded-lg border border-slate-600 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
          />

          <div className="space-y-4">
            {matches.map((m) => (
              <MatchCard key={m.event} match={m} books={books} format={format} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function MatchCard({ match, books, format }) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-slate-700 px-4 py-2.5">
        <h3 className="text-sm font-semibold text-slate-100">⚽ {match.event}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="border-b border-slate-800">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                Market / Selection
              </th>
              {books.map((b) => (
                <th key={b} className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {b}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {match.rows.map((row, i) => {
              const vals = Object.values(row.byBook)
              const best = Math.max(...vals)
              const multi = Object.keys(row.byBook).length > 1
              return (
                <tr key={i} className="border-b border-slate-800/60 hover:bg-slate-800/40">
                  <td className="px-4 py-2">
                    <div className="text-slate-200">
                      {row.selection}
                      {row.line != null && row.line !== '' && (
                        <span className="ml-1 text-slate-500">{row.line}</span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500">{row.market}</div>
                  </td>
                  {books.map((b) => {
                    const v = row.byBook[b]
                    const isBest = multi && v != null && v === best
                    return (
                      <td key={b} className="px-4 py-2 text-right">
                        {v == null ? (
                          <span className="text-slate-700">—</span>
                        ) : (
                          <span
                            className={`font-semibold ${
                              isBest ? 'rounded bg-emerald-600/20 px-1.5 py-0.5 text-emerald-300' : 'text-slate-300'
                            }`}
                          >
                            {formatOdds(v, format)}
                          </span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
