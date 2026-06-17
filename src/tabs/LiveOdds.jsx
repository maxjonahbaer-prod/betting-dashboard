import React, { useState, useEffect, useMemo } from 'react'
import { Card, Button, TextArea, EmptyState, OddsFormatToggle, StatCard } from '../components.jsx'
import { formatOdds } from '../utils'
import { usePersistentState } from '../storage'

// Normalize a selection across books for the comparison view.
function compareKey(book, market, selection, line) {
  const l = line == null || line === '' ? '' : `@${line}`
  return `${(market || '').trim().toLowerCase()}|${(selection || '').trim().toLowerCase()}${l}`
}

// Group a single result's odds rows by market_group -> market_name -> rows.
function groupByMarket(odds) {
  const groups = {}
  for (const row of odds) {
    const g = row.market_group || 'Other'
    const m = row.market_name || 'Market'
    groups[g] = groups[g] || {}
    groups[g][m] = groups[g][m] || []
    groups[g][m].push(row)
  }
  return groups
}

export default function LiveOdds() {
  const [urlText, setUrlText] = usePersistentState('liveOddsUrls', '')
  const [results, setResults] = usePersistentState('liveOddsResults', [])
  const [books, setBooks] = useState([])
  const [format, setFormat] = useState('american')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  const [view, setView] = useState('byBook') // 'byBook' | 'compare'

  useEffect(() => {
    fetch('/api/sportsbooks')
      .then((r) => (r.ok ? r.json() : []))
      .then(setBooks)
      .catch(() => setBooks([]))
  }, [])

  const ok = results.filter((r) => r.ok)
  const failed = results.filter((r) => !r.ok)

  async function fetchOdds() {
    const urls = urlText.split('\n').map((u) => u.trim()).filter(Boolean)
    if (urls.length === 0) {
      setError('Paste at least one event URL (one per line).')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Server error (${res.status})`)
      }
      const data = await res.json()
      setResults(data.results || [])
    } catch (e) {
      setError(
        `${e.message}. Is the odds server running?  →  python server/api.py`,
      )
    } finally {
      setLoading(false)
    }
  }

  async function loadDemo() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/demo')
      const data = await res.json()
      setResults(data.results || [])
    } catch (e) {
      setError(`Could not load sample data: ${e.message}. Is the odds server running?`)
    } finally {
      setLoading(false)
    }
  }

  function addExample(url) {
    setUrlText((prev) => (prev.trim() ? `${prev.trim()}\n${url}` : url))
  }

  const totalSelections = ok.reduce((s, r) => s + (r.selectionCount || 0), 0)

  // --- Cross-book comparison: same market+selection across scraped books ----
  const comparison = useMemo(() => {
    const map = new Map()
    for (const r of ok) {
      for (const row of r.odds) {
        const key = compareKey(r.sportsbook, row.market_name, row.selection_name, row.line)
        if (!map.has(key)) {
          map.set(key, {
            market: row.market_name,
            selection: row.selection_name,
            line: row.line,
            byBook: {},
          })
        }
        const entry = map.get(key)
        // Keep best (highest decimal) per book if a book lists it twice.
        if (!entry.byBook[r.sportsbook] || row.odds > entry.byBook[r.sportsbook]) {
          entry.byBook[r.sportsbook] = row.odds
        }
      }
    }
    let rows = [...map.values()]
    const f = filter.trim().toLowerCase()
    if (f) {
      rows = rows.filter(
        (x) =>
          (x.market || '').toLowerCase().includes(f) ||
          (x.selection || '').toLowerCase().includes(f),
      )
    }
    // Selections offered by more than one book float to the top.
    rows.sort((a, b) => {
      const na = Object.keys(a.byBook).length
      const nb = Object.keys(b.byBook).length
      if (na !== nb) return nb - na
      return (a.market || '').localeCompare(b.market || '')
    })
    return rows
  }, [ok, filter])

  const bookNames = useMemo(() => {
    const set = new Set()
    ok.forEach((r) => set.add(r.sportsbook))
    return [...set]
  }, [ok])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-100">Live Odds</h2>
          <p className="max-w-2xl text-sm text-slate-400">
            Paste event URLs from any supported sportsbook (one per line) to pull every available bet
            and its live odds. Add the same game from multiple books to compare prices side by side.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Odds format</span>
          <OddsFormatToggle format={format} onChange={setFormat} />
        </div>
      </div>

      {/* Input */}
      <Card className="p-4">
        {error && (
          <div className="mb-2 rounded bg-red-950/50 px-3 py-2 text-xs text-red-300">{error}</div>
        )}
        <TextArea
          value={urlText}
          onChange={(e) => setUrlText(e.target.value)}
          rows={4}
          placeholder={'https://sportsbook.draftkings.com/event/.../28867533\nhttps://sports.az.betmgm.com/en/sports/events/...'}
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-slate-500">
            One event URL per line · paste the same game from different books to compare.
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" className="text-xs" onClick={() => { setUrlText(''); setResults([]) }}>
              Clear
            </Button>
            <Button variant="secondary" className="text-xs" onClick={loadDemo} disabled={loading}>
              Load sample data
            </Button>
            <Button onClick={fetchOdds} disabled={loading}>
              {loading ? 'Fetching…' : '⚡ Fetch Odds'}
            </Button>
          </div>
        </div>

        {/* Supported books + example URLs */}
        {books.length > 0 && (
          <div className="mt-4 border-t border-slate-700 pt-3">
            <div className="mb-2 text-xs font-medium text-slate-400">
              Supported books — click to add a sample event URL:
            </div>
            <div className="flex flex-wrap gap-1.5">
              {books.map((b) => (
                <button
                  key={b.name}
                  onClick={() => addExample(b.example)}
                  title={b.example}
                  className="rounded-md border border-slate-600 bg-slate-900/60 px-2 py-1 text-xs text-slate-300 hover:border-emerald-500 hover:text-emerald-300"
                >
                  {b.name} <span className="text-slate-600">{b.region}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>

      {failed.length > 0 && (
        <Card className="border-amber-700/50 p-4">
          <div className="mb-2 text-sm font-semibold text-amber-300">
            {failed.length} URL{failed.length === 1 ? '' : 's'} could not be scraped
          </div>
          <ul className="space-y-1 text-xs text-amber-200/80">
            {failed.map((r, i) => (
              <li key={i} className="break-all">
                <span className="text-amber-400">•</span> {r.url} — {r.error}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {ok.length === 0 ? (
        <EmptyState message="No odds loaded yet. Paste one or more event URLs above and hit Fetch Odds." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Events Loaded" value={ok.length} />
            <StatCard label="Sportsbooks" value={bookNames.length} />
            <StatCard label="Total Selections" value={totalSelections} />
            <StatCard label="Comparable Bets" value={comparison.filter((c) => Object.keys(c.byBook).length > 1).length} accent="profit" />
          </div>

          {/* View switch */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex overflow-hidden rounded-lg border border-slate-600 text-sm">
              {[
                { id: 'byBook', label: 'By Sportsbook' },
                { id: 'compare', label: 'Compare Prices' },
              ].map((v) => (
                <button
                  key={v.id}
                  onClick={() => setView(v.id)}
                  className={`px-3 py-1.5 font-medium transition ${
                    view === v.id ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by market or selection…"
              className="flex-1 rounded-lg border border-slate-600 bg-slate-900/70 px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {view === 'byBook' && (
            <div className="space-y-4">
              {ok.map((r, i) => (
                <BookCard key={i} result={r} format={format} filter={filter} />
              ))}
            </div>
          )}

          {view === 'compare' && (
            <ComparisonTable rows={comparison} books={bookNames} format={format} />
          )}
        </>
      )}
    </div>
  )
}

function BookCard({ result, format, filter }) {
  const f = filter.trim().toLowerCase()
  const odds = f
    ? result.odds.filter(
        (row) =>
          (row.market_name || '').toLowerCase().includes(f) ||
          (row.selection_name || '').toLowerCase().includes(f),
      )
    : result.odds
  const groups = groupByMarket(odds)
  const groupNames = Object.keys(groups)

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-emerald-600/20 px-2 py-0.5 text-xs font-semibold text-emerald-300">
              {result.sportsbook}{result.jurisdiction ? ` · ${result.jurisdiction}` : ''}
            </span>
            <h3 className="text-sm font-semibold text-slate-100">{result.event}</h3>
          </div>
        </div>
        <div className="text-xs text-slate-500">
          {result.marketCount} markets · {result.selectionCount} selections
        </div>
      </div>

      {groupNames.length === 0 ? (
        <div className="text-xs text-slate-500">No selections match the filter.</div>
      ) : (
        <div className="space-y-4">
          {groupNames.map((g) => (
            <div key={g}>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{g}</div>
              <div className="space-y-3">
                {Object.entries(groups[g]).map(([market, rows]) => (
                  <div key={market}>
                    <div className="mb-1 text-sm font-medium text-slate-300">{market}</div>
                    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
                      {rows.map((row, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between gap-2 rounded-lg border border-slate-700 bg-slate-900/50 px-2.5 py-1.5"
                        >
                          <span className="truncate text-xs text-slate-300" title={row.selection_name}>
                            {row.selection_name}
                            {row.line != null && row.line !== '' && (
                              <span className="ml-1 text-slate-500">{row.line}</span>
                            )}
                          </span>
                          <span className="shrink-0 text-sm font-bold text-emerald-300">
                            {formatOdds(row.odds, format)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function ComparisonTable({ rows, books, format }) {
  if (rows.length === 0) {
    return <EmptyState message="No selections match the filter." />
  }
  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="border-b border-slate-700">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
              Market / Selection
            </th>
            {books.map((b) => (
              <th key={b} className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">
                {b}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const best = Math.max(...Object.values(row.byBook))
            const multi = Object.keys(row.byBook).length > 1
            return (
              <tr key={i} className="border-b border-slate-800 hover:bg-slate-800/40">
                <td className="px-3 py-2">
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
                    <td key={b} className="px-3 py-2 text-right">
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
    </Card>
  )
}
