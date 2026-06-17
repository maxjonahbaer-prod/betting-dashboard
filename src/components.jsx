import React from 'react'
import { formatOdds } from './utils'

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------
export function Card({ children, className = '' }) {
  return (
    <div
      className={`rounded-xl border border-slate-700 bg-slate-800/60 shadow-lg shadow-black/20 ${className}`}
    >
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Summary stat card
// ---------------------------------------------------------------------------
export function StatCard({ label, value, accent = 'default', sub }) {
  const accentColor =
    accent === 'profit'
      ? 'text-profit'
      : accent === 'loss'
      ? 'text-loss'
      : accent === 'warn'
      ? 'text-amber-400'
      : 'text-slate-100'
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${accentColor}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------
export function Button({ children, variant = 'primary', className = '', ...rest }) {
  const base =
    'inline-flex items-center justify-center gap-1 rounded-lg px-3 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed'
  const variants = {
    primary: 'bg-emerald-600 hover:bg-emerald-500 text-white focus:ring-emerald-400',
    secondary: 'bg-slate-700 hover:bg-slate-600 text-slate-100 focus:ring-slate-400',
    danger: 'bg-red-600 hover:bg-red-500 text-white focus:ring-red-400',
    ghost: 'bg-transparent hover:bg-slate-700 text-slate-300 focus:ring-slate-500',
  }
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...rest}>
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Labeled field wrapper
// ---------------------------------------------------------------------------
export function Field({ label, children, required, hint, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-slate-300">
        {label}
        {required && <span className="ml-0.5 text-red-400">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate-500">{hint}</span>}
    </label>
  )
}

const inputBase =
  'w-full rounded-lg border border-slate-600 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500'

export function TextInput(props) {
  return <input {...props} className={`${inputBase} ${props.className || ''}`} />
}

export function NumberInput(props) {
  return <input type="number" {...props} className={`${inputBase} ${props.className || ''}`} />
}

export function Select({ children, ...props }) {
  return (
    <select {...props} className={`${inputBase} ${props.className || ''}`}>
      {children}
    </select>
  )
}

export function TextArea(props) {
  return <textarea {...props} className={`${inputBase} ${props.className || ''}`} rows={props.rows || 3} />
}

// ---------------------------------------------------------------------------
// Odds format toggle (American <-> Decimal)
// ---------------------------------------------------------------------------
export function OddsFormatToggle({ format, onChange }) {
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-slate-600 text-xs">
      {['american', 'decimal'].map((f) => (
        <button
          key={f}
          type="button"
          onClick={() => onChange(f)}
          className={`px-3 py-1.5 font-medium capitalize transition ${
            format === f ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
        >
          {f}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Odds input — raw value paired with the current global format
// ---------------------------------------------------------------------------
export function OddsInput({ value, onChange, format, placeholder, ...rest }) {
  return (
    <NumberInput
      value={value}
      onChange={(e) => onChange(e.target.value)}
      step={format === 'american' ? 5 : 0.01}
      placeholder={placeholder || (format === 'american' ? 'e.g. +150 or -140' : 'e.g. 2.50')}
      {...rest}
    />
  )
}

// Read-only display of decimal odds in the chosen format.
export function OddsDisplay({ decimal, format }) {
  return <span>{formatOdds(decimal, format)}</span>
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------
export function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:p-6"
      onMouseDown={onClose}
    >
      <div
        className={`my-8 w-full ${wide ? 'max-w-3xl' : 'max-w-xl'} rounded-xl border border-slate-700 bg-slate-800 shadow-2xl`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-700 px-5 py-3">
          <h3 className="text-base font-semibold text-slate-100">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
export function EmptyState({ message, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-700 bg-slate-800/30 px-6 py-12 text-center">
      <p className="text-sm text-slate-400">{message}</p>
      {action}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sortable table header cell
// ---------------------------------------------------------------------------
export function SortHeader({ label, sortKey, sort, setSort, className = '' }) {
  const active = sort.key === sortKey
  const arrow = active ? (sort.dir === 'asc' ? '▲' : '▼') : ''
  return (
    <th
      className={`cursor-pointer select-none px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-200 ${className}`}
      onClick={() =>
        setSort((s) =>
          s.key === sortKey ? { key: sortKey, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: sortKey, dir: 'asc' },
        )
      }
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className="text-[10px] text-emerald-400">{arrow}</span>
      </span>
    </th>
  )
}

// Generic comparison-based sorter.
export function sortRows(rows, sort, accessors) {
  if (!sort.key) return rows
  const acc = accessors[sort.key] || ((r) => r[sort.key])
  const sorted = [...rows].sort((a, b) => {
    const va = acc(a)
    const vb = acc(b)
    if (va == null && vb == null) return 0
    if (va == null) return 1
    if (vb == null) return -1
    if (typeof va === 'number' && typeof vb === 'number') return va - vb
    return String(va).localeCompare(String(vb))
  })
  return sort.dir === 'asc' ? sorted : sorted.reverse()
}
