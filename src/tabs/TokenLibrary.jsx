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
} from '../components.jsx'
import {
  useTokens,
  emptyToken,
  normalizeToken,
  effectiveTokenStatus,
  buildAIContextBlock,
  parseImport,
  exportPayload,
  PROMO_TYPES,
  STATUSES,
  BOOST_APPLIES_TO,
  PROTECTION_TYPES,
  BET_TYPES,
  BET_TYPE_LABELS,
  COMMON_SPORTS,
  COMMON_LEAGUES,
  COMMON_MARKETS,
  PROMO_TYPE_LABELS,
  STATUS_LABELS,
  BOOST_APPLIES_TO_LABELS,
  PROTECTION_TYPE_LABELS,
  promoTypeLabel,
  sectionsForType,
  todayISODate,
} from '../lib/tokenStore'
import { PROMO_TEMPLATES, templateToToken } from '../lib/templates'
import { isSupportedImage, scanPromoImage } from '../lib/scanPromo'

// ===========================================================================
// Small building blocks
// ===========================================================================

// Tag / chip input: multi-select from suggestions + free-text add. Backs the
// string[] eligibility fields. `value` is an array of strings.
function TagInput({ value, onChange, suggestions = [], placeholder }) {
  const [draft, setDraft] = useState('')
  const add = (raw) => {
    const v = raw.trim()
    if (!v) return
    if (!value.includes(v)) onChange([...value, v])
    setDraft('')
  }
  const remove = (v) => onChange(value.filter((x) => x !== v))
  const remaining = suggestions.filter((s) => !value.includes(s))

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 rounded-full border border-emerald-600/50 bg-emerald-600/20 px-2 py-0.5 text-xs text-emerald-200"
            >
              {v}
              <button
                type="button"
                onClick={() => remove(v)}
                className="text-emerald-300/70 hover:text-white"
                aria-label={`Remove ${v}`}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <TextInput
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add(draft)
            }
          }}
          placeholder={placeholder || 'Type and press Enter…'}
        />
        <Button type="button" variant="secondary" onClick={() => add(draft)} disabled={!draft.trim()}>
          Add
        </Button>
      </div>
      {remaining.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {remaining.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="rounded-full border border-slate-600 bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300 hover:bg-slate-700"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Checkbox group for enum[] fields (eligible_bet_types).
function CheckboxGroup({ options, value, onChange, labels }) {
  const toggle = (opt) =>
    onChange(value.includes(opt) ? value.filter((x) => x !== opt) : [...value, opt])
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <label
          key={opt}
          className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition ${
            value.includes(opt)
              ? 'border-emerald-500 bg-emerald-600/20 text-emerald-200'
              : 'border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
        >
          <input
            type="checkbox"
            className="h-3.5 w-3.5"
            checked={value.includes(opt)}
            onChange={() => toggle(opt)}
          />
          {labels?.[opt] || opt}
        </label>
      ))}
    </div>
  )
}

function Toggle({ checked, onChange, label }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-200">
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-slate-600 bg-slate-900"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  )
}

function SectionTitle({ children }) {
  return (
    <div className="mb-2 mt-1 border-b border-slate-700 pb-1 text-xs font-semibold uppercase tracking-wide text-emerald-400">
      {children}
    </div>
  )
}

function statusBadge(status) {
  const cls =
    status === 'available'
      ? 'bg-emerald-900/60 text-emerald-300'
      : status === 'used'
      ? 'bg-slate-700 text-slate-300'
      : status === 'expired'
      ? 'bg-red-900/60 text-red-300'
      : 'bg-orange-900/60 text-orange-300' // voided
  return (
    <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {STATUS_LABELS[status] || status}
    </span>
  )
}

// Helper to turn a possibly-blank number field into the schema's number|null.
function numOrNull(v) {
  if (v === '' || v == null) return null
  const n = Number(v)
  return Number.isNaN(n) ? null : n
}
// And back to a controlled-input-friendly string.
function numStr(v) {
  return v == null ? '' : String(v)
}

// ===========================================================================
// Token form (add / edit) — multi-section, sections collapse by promo type
// ===========================================================================
function TokenForm({ initial, onSave, onCancel }) {
  const [t, setT] = useState(initial)
  const [error, setError] = useState('')
  const set = (k, v) => setT((prev) => ({ ...prev, [k]: v }))
  const sections = sectionsForType(t.promo_type)

  function submit() {
    if (!t.sportsbook.trim()) return setError('Sportsbook is required.')
    if (!t.promo_name.trim()) return setError('Promo name is required.')
    if (!PROMO_TYPES.includes(t.promo_type)) return setError('Promo type is required.')
    if (!t.received_date) return setError('Received date is required.')
    setError('')
    onSave(t)
  }

  return (
    <div className="space-y-4">
      {error && <div className="rounded bg-red-950/50 px-3 py-2 text-xs text-red-300">{error}</div>}

      {/* 1. Identity */}
      <div>
        <SectionTitle>Identity</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Sportsbook" required>
            <TextInput value={t.sportsbook} onChange={(e) => set('sportsbook', e.target.value)} placeholder="e.g. FanDuel" />
          </Field>
          <Field label="Promo Name" required>
            <TextInput value={t.promo_name} onChange={(e) => set('promo_name', e.target.value)} placeholder="e.g. 50% Profit Boost" />
          </Field>
          <Field label="Promo Type" required>
            <Select value={t.promo_type} onChange={(e) => set('promo_type', e.target.value)}>
              {PROMO_TYPES.map((p) => (
                <option key={p} value={p}>{PROMO_TYPE_LABELS[p]}</option>
              ))}
            </Select>
          </Field>
          <Field label="Token ID" hint="Sportsbook's internal code, if visible">
            <TextInput value={t.token_id} onChange={(e) => set('token_id', e.target.value)} />
          </Field>
          <Field label="Status">
            <Select value={t.status} onChange={(e) => set('status', e.target.value)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </Select>
          </Field>
          <Field label="Received Date" required>
            <TextInput type="date" value={t.received_date || ''} onChange={(e) => set('received_date', e.target.value)} />
          </Field>
          <Field label="Expiry Date" hint="Leave blank for no expiry">
            <TextInput type="date" value={t.expiry_date || ''} onChange={(e) => set('expiry_date', e.target.value || null)} />
          </Field>
          {t.status === 'used' && (
            <Field label="Used Date">
              <TextInput type="date" value={t.used_date || ''} onChange={(e) => set('used_date', e.target.value || null)} />
            </Field>
          )}
        </div>
      </div>

      {/* 2. Boost / bet rules */}
      {sections.boost && (
        <div>
          <SectionTitle>Boost / Bet Rules</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Boost %">
              <NumberInput value={numStr(t.boost_percentage)} onChange={(e) => set('boost_percentage', numOrNull(e.target.value))} min="0" step="1" placeholder="e.g. 50" />
            </Field>
            <Field label="Max Wager ($)" hint="Cap the boost applies to">
              <NumberInput value={numStr(t.max_wager_amount)} onChange={(e) => set('max_wager_amount', numOrNull(e.target.value))} min="0" step="5" placeholder="e.g. 10" />
            </Field>
            <Field label="Min Odds" hint="American (-200) or decimal (1.5)">
              <TextInput value={t.min_odds || ''} onChange={(e) => set('min_odds', e.target.value || null)} placeholder="e.g. -200" />
            </Field>
            <Field label="Max Odds" hint="Optional cap">
              <TextInput value={t.max_odds || ''} onChange={(e) => set('max_odds', e.target.value || null)} />
            </Field>
            <Field label="Boost Applies To">
              <Select value={t.boost_applies_to || ''} onChange={(e) => set('boost_applies_to', e.target.value || null)}>
                <option value="">—</option>
                {BOOST_APPLIES_TO.map((b) => (
                  <option key={b} value={b}>{BOOST_APPLIES_TO_LABELS[b]}</option>
                ))}
              </Select>
            </Field>
          </div>
        </div>
      )}

      {/* 3. Free bet rules */}
      {sections.freeBet && (
        <div>
          <SectionTitle>Free Bet Rules</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Free Bet Amount ($)">
              <NumberInput value={numStr(t.free_bet_amount)} onChange={(e) => set('free_bet_amount', numOrNull(e.target.value))} min="0" step="5" />
            </Field>
            <div className="flex items-end pb-2">
              <Toggle
                checked={t.stake_returned_on_free_bet}
                onChange={(v) => set('stake_returned_on_free_bet', v)}
                label="Stake returned (true free bet)"
              />
            </div>
          </div>
        </div>
      )}

      {/* 4. Protection rules */}
      {sections.protection && (
        <div>
          <SectionTitle>Protection Rules</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Protection Amount ($)">
              <NumberInput value={numStr(t.protection_amount)} onChange={(e) => set('protection_amount', numOrNull(e.target.value))} min="0" step="5" />
            </Field>
            <Field label="Protection Type">
              <Select value={t.protection_type || ''} onChange={(e) => set('protection_type', e.target.value || null)}>
                <option value="">—</option>
                {PROTECTION_TYPES.map((p) => (
                  <option key={p} value={p}>{PROTECTION_TYPE_LABELS[p]}</option>
                ))}
              </Select>
            </Field>
            <Field label="Max Refund ($)">
              <NumberInput value={numStr(t.protection_max_refund)} onChange={(e) => set('protection_max_refund', numOrNull(e.target.value))} min="0" step="5" />
            </Field>
          </div>
        </div>
      )}

      {/* 5. Deposit match rules */}
      {sections.depositMatch && (
        <div>
          <SectionTitle>Deposit Match Rules</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Match %">
              <NumberInput value={numStr(t.deposit_match_percentage)} onChange={(e) => set('deposit_match_percentage', numOrNull(e.target.value))} min="0" step="5" placeholder="e.g. 100" />
            </Field>
            <Field label="Match Max ($)">
              <NumberInput value={numStr(t.deposit_match_max)} onChange={(e) => set('deposit_match_max', numOrNull(e.target.value))} min="0" step="50" placeholder="e.g. 1000" />
            </Field>
            <Field label="Rollover (x)" hint="Playthrough requirement">
              <NumberInput value={numStr(t.deposit_match_rollover)} onChange={(e) => set('deposit_match_rollover', numOrNull(e.target.value))} min="0" step="1" placeholder="e.g. 10" />
            </Field>
          </div>
        </div>
      )}

      {/* 5b. Early win rules */}
      {sections.earlyWin && (
        <div>
          <SectionTitle>Early Win Rules</SectionTitle>
          <Field label="Early Win Trigger" hint="Plain-English early-settlement condition">
            <TextArea
              rows={2}
              value={t.early_win_trigger || ''}
              onChange={(e) => set('early_win_trigger', e.target.value || null)}
              placeholder="e.g. If your team leads by 2+ runs at any point, the bet settles as a WIN regardless of final result."
            />
          </Field>
        </div>
      )}

      {/* 6. Eligibility */}
      <div>
        <SectionTitle>Eligibility</SectionTitle>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Eligible Sports" hint="Empty = all sports">
              <TagInput value={t.eligible_sports} onChange={(v) => set('eligible_sports', v)} suggestions={COMMON_SPORTS} placeholder="Add a sport…" />
            </Field>
            <Field label="Eligible Leagues" hint="Empty = all leagues">
              <TagInput value={t.eligible_leagues} onChange={(v) => set('eligible_leagues', v)} suggestions={COMMON_LEAGUES} placeholder="Add a league…" />
            </Field>
          </div>
          <Field label="Eligible Markets" hint="Empty = all markets">
            <TagInput value={t.eligible_markets} onChange={(v) => set('eligible_markets', v)} suggestions={COMMON_MARKETS} placeholder="Add a market…" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Eligible Bet Types" hint="Empty = all bet types">
              <CheckboxGroup
                options={BET_TYPES}
                value={t.eligible_bet_types}
                onChange={(v) => set('eligible_bet_types', v)}
                labels={BET_TYPE_LABELS}
              />
            </Field>
            <Field label="Min Legs" hint="Minimum legs required (parlays/SGPs)">
              <NumberInput value={numStr(t.min_legs)} onChange={(e) => set('min_legs', numOrNull(e.target.value))} min="0" step="1" placeholder="e.g. 3" />
            </Field>
          </div>
          <Field label="Excluded Bet Types" hint="e.g. odds_boosts, bonus_bets, cashed_out, live">
            <TagInput value={t.excluded_bet_types} onChange={(v) => set('excluded_bet_types', v)} placeholder="Add an excluded bet type…" />
          </Field>
          <Field label="Excluded Markets" hint="Explicitly blacklisted">
            <TagInput value={t.excluded_markets} onChange={(v) => set('excluded_markets', v)} suggestions={COMMON_MARKETS} placeholder="Add an excluded market…" />
          </Field>
        </div>
      </div>

      {/* 7. Restrictions */}
      <div>
        <SectionTitle>Restrictions</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex items-center pt-5">
            <Toggle checked={t.requires_cash_funds} onChange={(v) => set('requires_cash_funds', v)} label="Requires cash funds" />
          </div>
          <div className="flex items-center pt-5">
            <Toggle checked={t.combinable_with_other_promos} onChange={(v) => set('combinable_with_other_promos', v)} label="Combinable with other promos" />
          </div>
          <div className="flex items-center pt-5">
            <Toggle checked={t.one_time_use} onChange={(v) => set('one_time_use', v)} label="One-time use" />
          </div>
        </div>
      </div>

      {/* 8. Strategy & AI notes */}
      <div>
        <SectionTitle>Strategy &amp; AI Notes</SectionTitle>
        <div className="space-y-3">
          <Field label="Hedge Math Notes" hint="Freeform extraction strategy">
            <TextArea
              rows={3}
              value={t.hedge_math_notes}
              onChange={(e) => set('hedge_math_notes', e.target.value)}
              placeholder="e.g. Use on one leg of a two-way O/U hedge. Pair with matching boost on FD. ~$3.60 on $20 risk at -110/-110."
            />
          </Field>
          <Field label="AI Extraction Formula" hint="Structured plain-English formula an AI agent can parse">
            <TextArea
              rows={3}
              value={t.ai_extraction_formula}
              onChange={(e) => set('ai_extraction_formula', e.target.value)}
              placeholder="e.g. boosted_payout = net_win * (1 + boost_pct/100); guaranteed_profit = boosted_payout_A - stake_B when staked optimally across both sides"
            />
          </Field>
          <Field label="General Notes" hint="Gotchas, account restriction warnings, etc.">
            <TextArea rows={2} value={t.notes} onChange={(e) => set('notes', e.target.value)} />
          </Field>
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-slate-700 pt-3">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button onClick={submit}>Save Token</Button>
      </div>
    </div>
  )
}

// ===========================================================================
// Token detail view (read-only) — full record + AI Agent Context Block
// ===========================================================================
function Row({ label, children }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2 py-1 text-sm">
      <span className="text-xs uppercase tracking-wide text-slate-500">{label}</span>
      <span className="text-slate-200">{children}</span>
    </div>
  )
}
const dash = <span className="text-slate-600">—</span>
const yn = (b) => (b ? 'Yes' : 'No')
const money = (v) => (v == null ? dash : `$${v}`)
const list = (a, all = 'All') => (a && a.length ? a.join(', ') : <span className="text-slate-500">{all}</span>)

function TokenDetail({ token, onEdit, onDuplicate, onMarkUsed, onMarkExpired, onClose }) {
  const [copied, setCopied] = useState(false)
  const sections = sectionsForType(token.promo_type)
  const eff = effectiveTokenStatus(token)
  const aiBlock = useMemo(() => buildAIContextBlock(token), [token])

  function copy() {
    const done = () => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(aiBlock).then(done).catch(done)
    } else {
      done()
    }
  }

  return (
    <div className="space-y-4">
      {/* Header actions */}
      <div className="flex flex-wrap items-center gap-2">
        {statusBadge(eff)}
        <span className="text-xs text-slate-500">{promoTypeLabel(token.promo_type)}</span>
        <div className="ml-auto flex flex-wrap gap-1.5">
          <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => onEdit(token)}>✏️ Edit</Button>
          <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => onDuplicate(token)}>⧉ Duplicate</Button>
          {eff === 'available' && (
            <>
              <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => onMarkUsed(token)}>✓ Mark Used</Button>
              <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => onMarkExpired(token)}>⌛ Mark Expired</Button>
            </>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-slate-700 p-3">
        <SectionTitle>Identity</SectionTitle>
        <Row label="Sportsbook">{token.sportsbook || dash}</Row>
        <Row label="Promo Name">{token.promo_name || dash}</Row>
        <Row label="Promo Type">{promoTypeLabel(token.promo_type)}</Row>
        <Row label="Token ID">{token.token_id || dash}</Row>
        <Row label="Received">{token.received_date || dash}</Row>
        <Row label="Expires">{token.expiry_date || <span className="text-slate-500">No expiry</span>}</Row>
        {token.used_date && <Row label="Used">{token.used_date}</Row>}
      </div>

      {sections.boost && (
        <div className="rounded-lg border border-slate-700 p-3">
          <SectionTitle>Boost / Bet Rules</SectionTitle>
          <Row label="Boost %">{token.boost_percentage != null ? `${token.boost_percentage}%` : dash}</Row>
          <Row label="Applies To">{token.boost_applies_to ? BOOST_APPLIES_TO_LABELS[token.boost_applies_to] : dash}</Row>
          <Row label="Max Wager">{money(token.max_wager_amount)}</Row>
          <Row label="Min Odds">{token.min_odds || dash}</Row>
          <Row label="Max Odds">{token.max_odds || dash}</Row>
        </div>
      )}

      {sections.freeBet && (
        <div className="rounded-lg border border-slate-700 p-3">
          <SectionTitle>Free Bet Rules</SectionTitle>
          <Row label="Amount">{money(token.free_bet_amount)}</Row>
          <Row label="Stake Returned">{yn(token.stake_returned_on_free_bet)}</Row>
        </div>
      )}

      {sections.protection && (
        <div className="rounded-lg border border-slate-700 p-3">
          <SectionTitle>Protection Rules</SectionTitle>
          <Row label="Amount">{money(token.protection_amount)}</Row>
          <Row label="Type">{token.protection_type ? PROTECTION_TYPE_LABELS[token.protection_type] : dash}</Row>
          <Row label="Max Refund">{money(token.protection_max_refund)}</Row>
        </div>
      )}

      {sections.depositMatch && (
        <div className="rounded-lg border border-slate-700 p-3">
          <SectionTitle>Deposit Match Rules</SectionTitle>
          <Row label="Match %">{token.deposit_match_percentage != null ? `${token.deposit_match_percentage}%` : dash}</Row>
          <Row label="Match Max">{money(token.deposit_match_max)}</Row>
          <Row label="Rollover">{token.deposit_match_rollover != null ? `${token.deposit_match_rollover}x` : dash}</Row>
        </div>
      )}

      {sections.earlyWin && (
        <div className="rounded-lg border border-slate-700 p-3">
          <SectionTitle>Early Win Rules</SectionTitle>
          <p className="whitespace-pre-wrap text-sm text-slate-200">{token.early_win_trigger || dash}</p>
        </div>
      )}

      <div className="rounded-lg border border-slate-700 p-3">
        <SectionTitle>Eligibility</SectionTitle>
        <Row label="Sports">{list(token.eligible_sports)}</Row>
        <Row label="Leagues">{list(token.eligible_leagues)}</Row>
        <Row label="Markets">{list(token.eligible_markets)}</Row>
        <Row label="Bet Types">{list(token.eligible_bet_types.map((b) => BET_TYPE_LABELS[b] || b))}</Row>
        <Row label="Min Legs">{token.min_legs ?? dash}</Row>
        <Row label="Excluded Types">{list(token.excluded_bet_types, 'None')}</Row>
        <Row label="Excluded Mkts">{list(token.excluded_markets, 'None')}</Row>
      </div>

      <div className="rounded-lg border border-slate-700 p-3">
        <SectionTitle>Restrictions</SectionTitle>
        <Row label="Requires Cash">{yn(token.requires_cash_funds)}</Row>
        <Row label="Combinable">{yn(token.combinable_with_other_promos)}</Row>
        <Row label="One-time Use">{yn(token.one_time_use)}</Row>
      </div>

      {(token.hedge_math_notes || token.ai_extraction_formula || token.notes) && (
        <div className="rounded-lg border border-slate-700 p-3">
          <SectionTitle>Strategy &amp; AI Notes</SectionTitle>
          {token.hedge_math_notes && (
            <div className="mb-2">
              <div className="text-xs uppercase tracking-wide text-slate-500">Hedge Math</div>
              <p className="whitespace-pre-wrap text-sm text-slate-200">{token.hedge_math_notes}</p>
            </div>
          )}
          {token.ai_extraction_formula && (
            <div className="mb-2">
              <div className="text-xs uppercase tracking-wide text-slate-500">AI Extraction Formula</div>
              <p className="whitespace-pre-wrap font-mono text-xs text-slate-200">{token.ai_extraction_formula}</p>
            </div>
          )}
          {token.notes && (
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">Notes</div>
              <p className="whitespace-pre-wrap text-sm text-slate-200">{token.notes}</p>
            </div>
          )}
        </div>
      )}

      {/* AI Agent Context Block */}
      <div className="rounded-lg border border-emerald-700/50 bg-slate-900/60 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-emerald-400">AI Agent Context Block</span>
          <Button variant="secondary" className="px-2 py-1 text-xs" onClick={copy}>
            {copied ? '✓ Copied' : '📋 Copy to clipboard'}
          </Button>
        </div>
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded bg-slate-950/70 p-3 font-mono text-[11px] leading-relaxed text-slate-300">
{aiBlock}
        </pre>
      </div>

      <div className="flex justify-end border-t border-slate-700 pt-3">
        <Button variant="secondary" onClick={onClose}>Close</Button>
      </div>
    </div>
  )
}

// ===========================================================================
// Expiry helpers — urgency + days-left display
// ===========================================================================
function hoursUntil(iso) {
  if (!iso) return Infinity
  return (new Date(iso).getTime() - Date.now()) / 3600000
}
// A still-available token expiring within 24h is "urgent".
function isUrgent(token) {
  if (effectiveTokenStatus(token) !== 'available' || !token.expiry_date) return false
  const h = hoursUntil(token.expiry_date)
  return h > 0 && h <= 24
}
function daysLeftLabel(token) {
  if (!token.expiry_date) return '—'
  const h = hoursUntil(token.expiry_date)
  if (h <= 0) return 'expired'
  if (h < 24) return `${Math.max(1, Math.round(h))}h`
  return `${Math.floor(h / 24)}d`
}

// ===========================================================================
// Template picker — shown before the Add Token form
// ===========================================================================
function TemplatePicker({ onPick, onScratch, onClose }) {
  const [fBook, setFBook] = useState('')
  const [fType, setFType] = useState('')

  const books = useMemo(() => [...new Set(PROMO_TEMPLATES.map((t) => t.sportsbook))].sort(), [])
  const types = useMemo(() => [...new Set(PROMO_TEMPLATES.map((t) => t.promo_type))], [])
  const shown = PROMO_TEMPLATES.filter(
    (t) => (!fBook || t.sportsbook === fBook) && (!fType || t.promo_type === fType),
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-400">
          Pick a pre-built promo to pre-fill the form, or start blank. You then add your token ID, dates, and notes.
        </p>
        <Button variant="secondary" onClick={onScratch}>✎ Start from scratch</Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Select value={fBook} onChange={(e) => setFBook(e.target.value)}>
          <option value="">All sportsbooks</option>
          {books.map((b) => (<option key={b} value={b}>{b}</option>))}
        </Select>
        <Select value={fType} onChange={(e) => setFType(e.target.value)}>
          <option value="">All types</option>
          {types.map((p) => (<option key={p} value={p}>{PROMO_TYPE_LABELS[p]}</option>))}
        </Select>
      </div>

      <div className="grid max-h-[55vh] gap-2 overflow-y-auto sm:grid-cols-2">
        {shown.map((tpl) => (
          <button
            key={tpl.template_id}
            onClick={() => onPick(tpl)}
            className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 text-left transition hover:border-emerald-500 hover:bg-slate-800/70"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-emerald-400">{tpl.sportsbook}</span>
              <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300">{PROMO_TYPE_LABELS[tpl.promo_type]}</span>
            </div>
            <div className="mt-1 text-sm font-medium text-slate-100">{tpl.promo_name}</div>
            <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-slate-500">
              {tpl.boost_percentage != null && <span>Boost {tpl.boost_percentage}%</span>}
              {tpl.free_bet_amount != null && <span>${tpl.free_bet_amount} bet</span>}
              {tpl.max_wager_amount != null && <span>Max ${tpl.max_wager_amount}</span>}
              {tpl.min_odds && <span>Min {tpl.min_odds}</span>}
              {tpl.min_legs != null && <span>{tpl.min_legs}+ legs</span>}
            </div>
          </button>
        ))}
      </div>

      <div className="flex justify-end border-t border-slate-700 pt-3">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  )
}

// ===========================================================================
// Main tab
// ===========================================================================
export default function TokenLibrary() {
  const { tokens, saveToken, setStatus, duplicateToken, importTokens } = useTokens()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null) // token being edited/added
  const [detailId, setDetailId] = useState(null) // token open in detail view
  const [confirm, setConfirm] = useState(null) // { token, status, label }
  const [pickerOpen, setPickerOpen] = useState(false) // template picker before add
  const [importMsg, setImportMsg] = useState('')
  const [scanState, setScanState] = useState({ status: 'idle', message: '' }) // idle | loading | error
  const [scanReview, setScanReview] = useState(false) // true while reviewing an AI-extracted draft
  const fileRef = useRef(null)
  const scanRef = useRef(null)

  const [sort, setSort] = useState({ key: 'expiry', dir: 'asc' })
  const [search, setSearch] = useState('')
  const [fBook, setFBook] = useState('')
  const [fType, setFType] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [fSport, setFSport] = useState('')

  // Keep the detail view bound to live data after edits/status changes.
  const detailToken = useMemo(() => tokens.find((t) => t.id === detailId) || null, [tokens, detailId])

  const books = useMemo(
    () => [...new Set(tokens.map((t) => t.sportsbook).filter(Boolean))].sort(),
    [tokens],
  )
  const sportsInUse = useMemo(
    () => [...new Set(tokens.flatMap((t) => t.eligible_sports))].sort(),
    [tokens],
  )

  const filtered = useMemo(() => {
    return tokens.filter((t) => {
      const eff = effectiveTokenStatus(t)
      if (fBook && t.sportsbook !== fBook) return false
      if (fType && t.promo_type !== fType) return false
      if (fStatus && eff !== fStatus) return false
      if (fSport && !t.eligible_sports.includes(fSport)) return false
      if (search) {
        const q = search.toLowerCase()
        const hay = `${t.sportsbook} ${t.promo_name} ${t.notes} ${t.hedge_math_notes}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [tokens, fBook, fType, fStatus, fSport, search])

  const sorted = useMemo(
    () =>
      sortRows(filtered, sort, {
        expiry: (t) => (t.expiry_date ? new Date(t.expiry_date).getTime() : Infinity),
        received: (t) => (t.received_date ? new Date(t.received_date).getTime() : 0),
        sportsbook: (t) => t.sportsbook,
        value: (t) =>
          t.boost_percentage ?? t.free_bet_amount ?? t.protection_amount ?? t.deposit_match_max ?? 0,
        status: (t) => effectiveTokenStatus(t),
      }),
    [filtered, sort],
  )

  // "Add Token" opens the template picker first; the picker then opens the form.
  function openAdd() {
    setPickerOpen(true)
  }
  function startFromScratch() {
    setPickerOpen(false)
    setScanReview(false)
    setEditing(emptyToken())
    setFormOpen(true)
  }
  function startFromTemplate(tpl) {
    setPickerOpen(false)
    setScanReview(false)
    setEditing(templateToToken(tpl))
    setFormOpen(true)
  }
  function openEdit(token) {
    setEditing(token)
    setFormOpen(true)
  }
  function handleSave(token) {
    saveToken(token)
    setFormOpen(false)
    setEditing(null)
    setScanReview(false)
    setDetailId(token.id) // surface the saved record
  }

  function closeForm() {
    setFormOpen(false)
    setEditing(null)
    setScanReview(false)
  }
  function handleDuplicate(token) {
    const created = duplicateToken(token.id)
    if (created) setDetailId(created.id)
  }
  function requestStatus(token, status, label) {
    setConfirm({ token, status, label })
  }
  function applyStatus() {
    if (confirm) setStatus(confirm.token.id, confirm.status)
    setConfirm(null)
  }

  function doExport() {
    const blob = new Blob([JSON.stringify(exportPayload(tokens), null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `promo_token_library_${todayISODate()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function onFilePicked(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-importing the same file
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const arr = parseImport(String(reader.result))
        const res = importTokens(arr)
        setImportMsg(`Imported ${res.total} token${res.total === 1 ? '' : 's'} (${res.added} new, ${res.updated} updated).`)
      } catch (err) {
        setImportMsg(`Import failed: ${err.message}`)
      }
      setTimeout(() => setImportMsg(''), 5000)
    }
    reader.readAsText(file)
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
      const extracted = await scanPromoImage(file, 'token')
      // Normalize the partial fields into a full, valid draft token, then open
      // the form so the user reviews/corrects before saving.
      setEditing(normalizeToken(extracted))
      setScanReview(true)
      setFormOpen(true)
      setScanState({ status: 'idle', message: '' })
    } catch (err) {
      setScanState({ status: 'error', message: err.message })
    }
  }

  function value(t) {
    if (t.boost_percentage != null) return `${t.boost_percentage}%`
    if (t.free_bet_amount != null) return `$${t.free_bet_amount}`
    if (t.protection_amount != null) return `$${t.protection_amount}`
    if (t.deposit_match_max != null) return `$${t.deposit_match_max}`
    return '—'
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-100">Token Library</h2>
          <p className="text-sm text-slate-400">
            {tokens.length} token{tokens.length === 1 ? '' : 's'} · structured records ready for AI extraction
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onFilePicked} />
          <input ref={scanRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={onScanPicked} />
          <Button variant="ghost" className="text-xs" onClick={() => fileRef.current?.click()}>⬆ Import</Button>
          <Button variant="ghost" className="text-xs" onClick={doExport} disabled={tokens.length === 0}>⬇ Export</Button>
          <Button
            variant="secondary"
            onClick={() => { setScanState({ status: 'idle', message: '' }); scanRef.current?.click() }}
            disabled={scanState.status === 'loading'}
          >
            {scanState.status === 'loading' ? '⏳ Reading…' : '📷 Scan Screenshot'}
          </Button>
          <Button onClick={openAdd}>＋ Add Token</Button>
        </div>
      </div>

      {importMsg && (
        <div className="rounded bg-emerald-950/50 px-3 py-2 text-xs text-emerald-200">{importMsg}</div>
      )}

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
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <TextInput placeholder="🔎 Search book / name / notes" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select value={fBook} onChange={(e) => setFBook(e.target.value)}>
            <option value="">All sportsbooks</option>
            {books.map((b) => (<option key={b} value={b}>{b}</option>))}
          </Select>
          <Select value={fType} onChange={(e) => setFType(e.target.value)}>
            <option value="">All types</option>
            {PROMO_TYPES.map((p) => (<option key={p} value={p}>{PROMO_TYPE_LABELS[p]}</option>))}
          </Select>
          <Select value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => (<option key={s} value={s}>{STATUS_LABELS[s]}</option>))}
          </Select>
          <Select value={fSport} onChange={(e) => setFSport(e.target.value)}>
            <option value="">All sports</option>
            {sportsInUse.map((s) => (<option key={s} value={s}>{s}</option>))}
          </Select>
        </div>
      </Card>

      {sorted.length === 0 ? (
        <EmptyState
          message={
            tokens.length === 0
              ? 'No tokens logged yet. Log every promo you receive with its full rule set so an AI agent can compute guaranteed-profit math.'
              : 'No tokens match your filters.'
          }
          action={
            tokens.length === 0 && <Button onClick={openAdd}>＋ Add your first token</Button>
          }
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-b border-slate-700">
              <tr>
                <SortHeader label="Sportsbook" sortKey="sportsbook" sort={sort} setSort={setSort} />
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Promo</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Type</th>
                <SortHeader label="Value" sortKey="value" sort={sort} setSort={setSort} />
                <SortHeader label="Expires" sortKey="expiry" sort={sort} setSort={setSort} />
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Days Left</th>
                <SortHeader label="Status" sortKey="status" sort={sort} setSort={setSort} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((t) => {
                const eff = effectiveTokenStatus(t)
                const urgent = isUrgent(t)
                return (
                  <tr
                    key={t.id}
                    className={`cursor-pointer border-b border-slate-800 hover:bg-slate-800/50 ${urgent ? 'border-l-2 border-l-red-500 bg-red-950/20' : ''}`}
                    onClick={() => setDetailId(t.id)}
                  >
                    <td className="px-3 py-2 text-slate-200">{t.sportsbook}</td>
                    <td className="px-3 py-2 text-slate-200">{t.promo_name}</td>
                    <td className="px-3 py-2 text-slate-300">{promoTypeLabel(t.promo_type)}</td>
                    <td className="px-3 py-2 text-slate-300">{value(t)}</td>
                    <td className="px-3 py-2 text-slate-300">
                      {t.expiry_date ? new Date(t.expiry_date).toLocaleDateString() : <span className="text-slate-600">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      {urgent ? (
                        <span className="animate-pulse rounded bg-red-900/70 px-2 py-0.5 text-[11px] font-semibold text-red-200">⚠ {daysLeftLabel(t)}</span>
                      ) : (
                        <span className="text-slate-300">{daysLeftLabel(t)}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{statusBadge(eff)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}

      {/* Template picker (before the add form) */}
      <Modal open={pickerOpen} onClose={() => setPickerOpen(false)} title="Choose a Template" wide>
        <TemplatePicker
          onPick={startFromTemplate}
          onScratch={startFromScratch}
          onClose={() => setPickerOpen(false)}
        />
      </Modal>

      {/* Add / edit form */}
      <Modal
        open={formOpen}
        onClose={closeForm}
        title={scanReview ? 'Review Scanned Token' : editing && tokens.some((t) => t.id === editing.id) ? 'Edit Token' : 'Add Token'}
        wide
      >
        {editing && (
          <>
            {scanReview && (
              <div className="mb-3 rounded bg-sky-950/50 px-3 py-2 text-xs text-sky-200">
                ✨ Pre-filled from your screenshot by Claude. <span className="font-semibold">Review every field</span> —
                especially min odds, amounts, and the stake-returned flag — then save.
              </div>
            )}
            <TokenForm
              initial={editing}
              onSave={handleSave}
              onCancel={closeForm}
            />
          </>
        )}
      </Modal>

      {/* Detail view */}
      <Modal
        open={!!detailToken}
        onClose={() => setDetailId(null)}
        title={detailToken ? `${detailToken.sportsbook} — ${detailToken.promo_name}` : ''}
        wide
      >
        {detailToken && (
          <TokenDetail
            token={detailToken}
            onEdit={(tok) => { setDetailId(null); openEdit(tok) }}
            onDuplicate={handleDuplicate}
            onMarkUsed={(tok) => requestStatus(tok, 'used', 'mark this token as Used')}
            onMarkExpired={(tok) => requestStatus(tok, 'expired', 'mark this token as Expired')}
            onClose={() => setDetailId(null)}
          />
        )}
      </Modal>

      {/* Status-change confirmation */}
      <Modal open={!!confirm} onClose={() => setConfirm(null)} title="Confirm">
        <p className="text-sm text-slate-300">
          Are you sure you want to {confirm?.label}?
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirm(null)}>Cancel</Button>
          <Button onClick={applyStatus}>Confirm</Button>
        </div>
      </Modal>
    </div>
  )
}
