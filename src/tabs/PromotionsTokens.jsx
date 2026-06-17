import React, { useMemo, useRef, useState } from 'react'
import {
  Card,
  Button,
  Field,
  TextInput,
  NumberInput,
  Select,
  TextArea,
  EmptyState,
  SortHeader,
  sortRows,
} from '../components.jsx'
import { uid, formatUSD, countdownString, hoursUntil } from '../utils'
import { PROMO_TEMPLATES } from '../lib/templates'

const PROMOTION_TYPES = [
  'profit_boost',
  'free_bet',
  'bonus_bet',
  'sweat_free',
  'deposit_match',
  'odds_boost',
  'parlay_boost',
  'sgp_boost',
  'bet_protection',
  'risk_free_bet',
  'early_win',
  'draw_refund',
  'reload_bonus',
  'predictions_bonus',
  'other',
]
const PROMOTION_STATUSES = ['active', 'expired', 'completed', 'cancelled']
const TOKEN_TYPES = ['profit_boost', 'free_bet', 'bonus_bet', 'sweat_free', 'deposit_match', 'odds_boost', 'parlay_boost', 'sgp_boost', 'bet_protection', 'risk_free_bet', 'early_win', 'draw_refund', 'reload_bonus', 'predictions_bonus', 'other']
const TOKEN_STATUSES = ['available', 'partially_used', 'used', 'expired']

const label = (v) => String(v || '').replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())
const today = () => new Date().toISOString().slice(0, 10)

function effectivePromotionStatus(promo) {
  if (promo.status !== 'active') return promo.status
  if (promo.expirationDate && hoursUntil(promo.expirationDate) <= 0) return 'expired'
  return 'active'
}

export function effectiveTokenStatus(token) {
  if (token.status !== 'available' && token.status !== 'partially_used') return token.status
  if (token.expirationDate && hoursUntil(token.expirationDate) <= 0) return 'expired'
  if (Number(token.remainingQuantity) <= 0) return 'used'
  if (Number(token.remainingQuantity) < Number(token.quantity || 1)) return 'partially_used'
  return 'available'
}

export function tokenDisplayName(token) {
  return `${token.sportsbook || 'Sportsbook'} - ${token.tokenName || label(token.tokenType)}`
}

export function tokenEstimatedValue(token) {
  return Number(token.value || token.bonusAmount || token.maxStake || 0)
}


function templateToPromotion(template) {
  return {
    id: uid(),
    templateId: template.template_id || template.id || '',
    sportsbook: template.sportsbook || '',
    promotionName: template.promo_name || template.promotionName || template.tokenName || '',
    promotionType: template.promo_type || template.promotionType || template.tokenType || 'other',
    description: template.description || template.promo_name || template.notes || '',
    startDate: today(),
    expirationDate: template.expiry_date || template.expirationDate || '',
    terms: template.terms || template.notes || '',
    status: 'active',
    estimatedValue: template.free_bet_amount ?? template.bonusAmount ?? template.deposit_match_max ?? template.value ?? '',
    boostPct: template.boost_percentage ?? template.boostPercent ?? '',
    bonusAmount: template.free_bet_amount ?? template.bonusAmount ?? '',
    maxStake: template.max_wager_amount ?? template.maxStake ?? '',
    notes: template.notes || '',
  }
}

function templateToManagedToken(template, promotion) {
  const quantity = Number(template.quantity || template.max_uses_per_account || 1) || 1
  return {
    id: uid(),
    templateId: template.template_id || template.id || '',
    promotionId: promotion?.id || template.promotionId || '',
    sportsbook: template.sportsbook || promotion?.sportsbook || '',
    tokenName: template.promo_name || template.tokenName || promotion?.promotionName || '',
    tokenType: template.promo_type || template.tokenType || promotion?.promotionType || 'other',
    quantity,
    remainingQuantity: quantity,
    value: template.value ?? template.free_bet_amount ?? template.protection_amount ?? template.deposit_match_max ?? '',
    maxStake: template.max_wager_amount ?? template.maxStake ?? '',
    boostPercent: template.boost_percentage ?? template.boostPercent ?? '',
    bonusAmount: template.free_bet_amount ?? template.bonusAmount ?? '',
    expirationDate: template.expiry_date || template.expirationDate || promotion?.expirationDate || '',
    status: 'available',
    usedOnBetIds: [],
    minOdds: template.min_odds || '',
    eligibleSports: template.eligible_sports || [],
    eligibleLeagues: template.eligible_leagues || [],
    eligibleMarkets: template.eligible_markets || [],
    eligibleBetTypes: template.eligible_bet_types || [],
    minLegs: template.min_legs ?? '',
    excludedBetTypes: template.excluded_bet_types || [],
    excludedMarkets: template.excluded_markets || [],
    aiExtractionFormula: template.ai_extraction_formula || '',
    notes: template.notes || '',
  }
}

function recordsFromUpload(parsed) {
  if (Array.isArray(parsed)) return { templates: parsed }
  return {
    promotions: Array.isArray(parsed?.promotions) ? parsed.promotions : [],
    tokens: Array.isArray(parsed?.tokens) ? parsed.tokens : [],
    templates: Array.isArray(parsed?.templates) ? parsed.templates : Array.isArray(parsed?.promoTemplates) ? parsed.promoTemplates : [],
  }
}

function templateKey(template) {
  return String(template.template_id || template.id || `${template.sportsbook || ''}:${template.promo_name || template.promotionName || template.tokenName || ''}`).toLowerCase()
}

function emptyPromotion() {
  return {
    id: uid(),
    sportsbook: '',
    promotionName: '',
    promotionType: 'profit_boost',
    description: '',
    startDate: today(),
    expirationDate: '',
    terms: '',
    status: 'active',
    estimatedValue: '',
    notes: '',
  }
}

function emptyToken(promotion) {
  return {
    id: uid(),
    promotionId: promotion?.id || '',
    sportsbook: promotion?.sportsbook || '',
    tokenName: promotion?.promotionName || '',
    tokenType: promotion?.promotionType || 'profit_boost',
    quantity: 1,
    remainingQuantity: 1,
    value: promotion?.estimatedValue || '',
    maxStake: promotion?.maxStake || '',
    boostPercent: promotion?.boostPct || '',
    bonusAmount: promotion?.bonusAmount || '',
    expirationDate: promotion?.expirationDate || '',
    status: 'available',
    usedOnBetIds: [],
    notes: '',
  }
}

function statusBadge(status) {
  const cls =
    status === 'active' || status === 'available'
      ? 'bg-emerald-900/60 text-emerald-300'
      : status === 'partially_used'
      ? 'bg-amber-900/60 text-amber-300'
      : status === 'used' || status === 'completed'
      ? 'bg-slate-700 text-slate-300'
      : 'bg-red-900/60 text-red-300'
  return <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${cls}`}>{label(status)}</span>
}

function PromotionForm({ initial, onSave, sportsbookNames }) {
  const [p, setP] = useState(initial)
  const [error, setError] = useState('')
  const set = (k, v) => setP((prev) => ({ ...prev, [k]: v }))

  function submit() {
    if (!p.sportsbook.trim()) return setError('Sportsbook is required.')
    if (!p.promotionName.trim()) return setError('Promotion name is required.')
    setError('')
    onSave(p)
  }

  return (
    <Card className="p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-200">Add Promotion</h3>
      {error && <div className="mb-3 rounded bg-red-950/50 px-3 py-2 text-xs text-red-300">{error}</div>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Sportsbook" required>
          <TextInput list="promo-token-books" value={p.sportsbook} onChange={(e) => set('sportsbook', e.target.value)} />
        </Field>
        <Field label="Promotion Name" required>
          <TextInput value={p.promotionName} onChange={(e) => set('promotionName', e.target.value)} placeholder="e.g. NBA 30% boost campaign" />
        </Field>
        <Field label="Promotion Type">
          <Select value={p.promotionType} onChange={(e) => set('promotionType', e.target.value)}>
            {PROMOTION_TYPES.map((type) => <option key={type} value={type}>{label(type)}</option>)}
          </Select>
        </Field>
        <Field label="Start Date"><TextInput type="date" value={p.startDate} onChange={(e) => set('startDate', e.target.value)} /></Field>
        <Field label="Expiration"><TextInput type="date" value={p.expirationDate} onChange={(e) => set('expirationDate', e.target.value)} /></Field>
        <Field label="Estimated Value ($)"><NumberInput value={p.estimatedValue} onChange={(e) => set('estimatedValue', e.target.value)} step="0.01" /></Field>
        <Field label="Status">
          <Select value={p.status} onChange={(e) => set('status', e.target.value)}>
            {PROMOTION_STATUSES.map((status) => <option key={status} value={status}>{label(status)}</option>)}
          </Select>
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <TextInput value={p.description} onChange={(e) => set('description', e.target.value)} />
        </Field>
        <Field label="Terms" className="sm:col-span-2">
          <TextArea rows={2} value={p.terms} onChange={(e) => set('terms', e.target.value)} />
        </Field>
        <Field label="Notes">
          <TextArea rows={2} value={p.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </div>
      <datalist id="promo-token-books">{sportsbookNames.map((n) => <option key={n} value={n} />)}</datalist>
      <div className="mt-3 flex justify-end"><Button onClick={submit}>Save Promotion</Button></div>
    </Card>
  )
}

function TokenForm({ initial, promotions, onSave }) {
  const [t, setT] = useState(initial)
  const [error, setError] = useState('')
  const set = (k, v) => setT((prev) => ({ ...prev, [k]: v }))

  function choosePromotion(id) {
    const promo = promotions.find((p) => p.id === id)
    setT((prev) => ({
      ...prev,
      promotionId: id,
      sportsbook: promo?.sportsbook || prev.sportsbook,
      tokenName: prev.tokenName || promo?.promotionName || '',
      tokenType: promo?.promotionType || prev.tokenType,
      expirationDate: prev.expirationDate || promo?.expirationDate || '',
      value: prev.value || promo?.estimatedValue || '',
    }))
  }

  function submit() {
    if (!t.sportsbook.trim()) return setError('Sportsbook is required.')
    if (!t.tokenName.trim()) return setError('Token name is required.')
    const quantity = Math.max(1, Number(t.quantity) || 1)
    const remainingQuantity = Math.max(0, Math.min(quantity, Number(t.remainingQuantity ?? quantity) || 0))
    setError('')
    onSave({ ...t, quantity, remainingQuantity, status: remainingQuantity <= 0 ? 'used' : t.status })
  }

  return (
    <Card className="p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-200">Add Token</h3>
      {error && <div className="mb-3 rounded bg-red-950/50 px-3 py-2 text-xs text-red-300">{error}</div>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Parent Promotion">
          <Select value={t.promotionId} onChange={(e) => choosePromotion(e.target.value)}>
            <option value="">No parent promotion</option>
            {promotions.map((p) => <option key={p.id} value={p.id}>{p.sportsbook} - {p.promotionName}</option>)}
          </Select>
        </Field>
        <Field label="Sportsbook" required><TextInput value={t.sportsbook} onChange={(e) => set('sportsbook', e.target.value)} /></Field>
        <Field label="Token Name" required><TextInput value={t.tokenName} onChange={(e) => set('tokenName', e.target.value)} /></Field>
        <Field label="Token Type">
          <Select value={t.tokenType} onChange={(e) => set('tokenType', e.target.value)}>
            {TOKEN_TYPES.map((type) => <option key={type} value={type}>{label(type)}</option>)}
          </Select>
        </Field>
        <Field label="Quantity"><NumberInput value={t.quantity} onChange={(e) => set('quantity', e.target.value)} min="1" /></Field>
        <Field label="Remaining"><NumberInput value={t.remainingQuantity} onChange={(e) => set('remainingQuantity', e.target.value)} min="0" /></Field>
        <Field label="Value ($)"><NumberInput value={t.value} onChange={(e) => set('value', e.target.value)} step="0.01" /></Field>
        <Field label="Max Stake ($)"><NumberInput value={t.maxStake} onChange={(e) => set('maxStake', e.target.value)} step="0.01" /></Field>
        <Field label="Boost %"><NumberInput value={t.boostPercent} onChange={(e) => set('boostPercent', e.target.value)} step="1" /></Field>
        <Field label="Bonus Amount ($)"><NumberInput value={t.bonusAmount} onChange={(e) => set('bonusAmount', e.target.value)} step="0.01" /></Field>
        <Field label="Expiration"><TextInput type="date" value={t.expirationDate} onChange={(e) => set('expirationDate', e.target.value)} /></Field>
        <Field label="Status">
          <Select value={t.status} onChange={(e) => set('status', e.target.value)}>
            {TOKEN_STATUSES.map((status) => <option key={status} value={status}>{label(status)}</option>)}
          </Select>
        </Field>
        <Field label="Notes" className="sm:col-span-2 lg:col-span-3">
          <TextArea rows={2} value={t.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </div>
      <div className="mt-3 flex justify-end"><Button onClick={submit}>Save Token</Button></div>
    </Card>
  )
}

export default function PromotionsTokens({ promotions, setPromotions, tokens, setTokens, sportsbookNames, setSportsbooks, log, templateLibrary = [], setTemplateLibrary }) {
  const [promoDraft, setPromoDraft] = useState(emptyPromotion())
  const [tokenDraft, setTokenDraft] = useState(emptyToken())
  const [sort, setSort] = useState({ key: 'expirationDate', dir: 'asc' })
  const [fBook, setFBook] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [fExpiry, setFExpiry] = useState('')
  const [editingPromoId, setEditingPromoId] = useState('')
  const [editingTokenId, setEditingTokenId] = useState('')
  const [librarySearch, setLibrarySearch] = useState('')
  const [libraryBook, setLibraryBook] = useState('')
  const [importMessage, setImportMessage] = useState('')
  const uploadRef = useRef(null)

  function addSportsbookIfMissing(name) {
    if (!name) return
    setSportsbooks((prev) => prev.some((s) => s.name === name) ? prev : [...prev, { name, balance: 0, transactions: [] }])
  }

  function savePromotion(promo) {
    addSportsbookIfMissing(promo.sportsbook)
    setPromotions((prev) => prev.some((p) => p.id === promo.id) ? prev.map((p) => p.id === promo.id ? promo : p) : [promo, ...prev])
    setPromoDraft(emptyPromotion())
    setEditingPromoId('')
  }

  function saveToken(token) {
    addSportsbookIfMissing(token.sportsbook)
    setTokens((prev) => prev.some((t) => t.id === token.id) ? prev.map((t) => t.id === token.id ? token : t) : [token, ...prev])
    setTokenDraft(emptyToken())
    setEditingTokenId('')
  }

  function editPromo(promo) { setPromoDraft(promo); setEditingPromoId(promo.id) }
  function editToken(token) { setTokenDraft(token); setEditingTokenId(token.id) }
  function makeTokenFromPromo(promo) { setTokenDraft(emptyToken(promo)); setEditingTokenId('') }

  function setTokenStatus(id, status) {
    setTokens((prev) => prev.map((token) => token.id === id ? {
      ...token,
      status,
      remainingQuantity: status === 'used' || status === 'expired' ? 0 : token.remainingQuantity,
    } : token))
  }

  function addTemplateToLibrary(template) {
    if (!setTemplateLibrary) return
    const saved = { ...template, template_id: template.template_id || `custom-${uid()}`, saved_at: new Date().toISOString() }
    setTemplateLibrary((prev) => {
      const key = templateKey(saved)
      return prev.some((item) => templateKey(item) === key) ? prev.map((item) => templateKey(item) === key ? saved : item) : [saved, ...prev]
    })
    setImportMessage(`Saved ${saved.promo_name || saved.promotionName || saved.tokenName || 'template'} to your library.`)
  }

  function createFromTemplate(template) {
    const promotion = templateToPromotion(template)
    const token = templateToManagedToken(template, promotion)
    savePromotion(promotion)
    saveToken(token)
    setImportMessage(`Created ${token.tokenName} from the library.`)
  }

  function saveTokenAsTemplate(token) {
    addTemplateToLibrary({
      template_id: token.templateId || `custom-${token.sportsbook}-${token.tokenName}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      sportsbook: token.sportsbook,
      promo_name: token.tokenName,
      promo_type: token.tokenType,
      boost_percentage: token.boostPercent || null,
      max_wager_amount: token.maxStake || null,
      free_bet_amount: token.bonusAmount || token.value || null,
      eligible_sports: token.eligibleSports || [],
      eligible_leagues: token.eligibleLeagues || [],
      eligible_markets: token.eligibleMarkets || [],
      eligible_bet_types: token.eligibleBetTypes || [],
      min_legs: token.minLegs || null,
      excluded_bet_types: token.excludedBetTypes || [],
      excluded_markets: token.excludedMarkets || [],
      ai_extraction_formula: token.aiExtractionFormula || '',
      notes: token.notes || '',
    })
  }

  function exportTemplateLibrary() {
    const payload = {
      library: 'promo_template_library',
      exported_at: new Date().toISOString(),
      templates: [...templateLibrary],
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `promo-token-library-${today()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function importFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text())
      const incoming = recordsFromUpload(parsed)
      let addedPromos = 0
      let addedTokens = 0
      let addedTemplates = 0

      if (incoming.promotions.length) {
        const nextPromos = incoming.promotions.map((p) => ({ ...emptyPromotion(), ...p, id: p.id || uid() }))
        setPromotions((prev) => [...nextPromos, ...prev])
        addedPromos = nextPromos.length
      }
      if (incoming.tokens.length) {
        const nextTokens = incoming.tokens.map((t) => ({ ...emptyToken(), ...t, id: t.id || uid(), usedOnBetIds: t.usedOnBetIds || [] }))
        setTokens((prev) => [...nextTokens, ...prev])
        addedTokens = nextTokens.length
      }
      if (incoming.templates.length && setTemplateLibrary) {
        setTemplateLibrary((prev) => {
          const byKey = new Map(prev.map((template) => [templateKey(template), template]))
          incoming.templates.forEach((template) => byKey.set(templateKey(template), template))
          addedTemplates = incoming.templates.length
          return Array.from(byKey.values())
        })
      }
      setImportMessage(`Imported ${addedPromos} promotions, ${addedTokens} tokens, and ${addedTemplates} reusable templates.`)
    } catch (err) {
      setImportMessage(`Import failed: ${err.message}`)
    }
  }


  const builtInTemplates = PROMO_TEMPLATES
  const reusableTemplates = useMemo(() => [...templateLibrary, ...builtInTemplates], [templateLibrary, builtInTemplates])

  const allSportsbooks = useMemo(
    () => [...new Set([...sportsbookNames, ...promotions.map((p) => p.sportsbook), ...tokens.map((t) => t.sportsbook), ...reusableTemplates.map((t) => t.sportsbook)])].filter(Boolean).sort(),
    [sportsbookNames, promotions, tokens, reusableTemplates],
  )

  const shownTemplates = useMemo(() => reusableTemplates.filter((template) => {
    if (libraryBook && template.sportsbook !== libraryBook) return false
    if (librarySearch) {
      const q = librarySearch.toLowerCase()
      const hay = `${template.sportsbook || ''} ${template.promo_name || ''} ${template.promotionName || ''} ${template.notes || ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  }), [reusableTemplates, libraryBook, librarySearch])

  const tokenRows = useMemo(() => tokens.map((token) => ({ ...token, effectiveStatus: effectiveTokenStatus(token) })), [tokens])
  const filteredTokens = useMemo(() => tokenRows.filter((token) => {
    if (fBook && token.sportsbook !== fBook) return false
    if (fStatus && token.effectiveStatus !== fStatus) return false
    if (fExpiry === 'soon') {
      const hrs = hoursUntil(token.expirationDate)
      if (!(hrs > 0 && hrs <= 168)) return false
    }
    return true
  }), [tokenRows, fBook, fStatus, fExpiry])
  const sortedTokens = useMemo(() => sortRows(filteredTokens, sort, {
    sportsbook: (t) => t.sportsbook,
    tokenName: (t) => t.tokenName,
    expirationDate: (t) => t.expirationDate ? new Date(t.expirationDate).getTime() : Infinity,
    remainingQuantity: (t) => Number(t.remainingQuantity) || 0,
    status: (t) => t.effectiveStatus,
    value: (t) => tokenEstimatedValue(t),
  }), [filteredTokens, sort])

  const summary = useMemo(() => {
    const activePromos = promotions.filter((p) => effectivePromotionStatus(p) === 'active').length
    const available = tokenRows.filter((t) => t.effectiveStatus === 'available' || t.effectiveStatus === 'partially_used').reduce((sum, t) => sum + Number(t.remainingQuantity || 0), 0)
    const used = tokenRows.filter((t) => t.effectiveStatus === 'used').length
    const expired = tokenRows.filter((t) => t.effectiveStatus === 'expired').length
    const expiringSoon = tokenRows.filter((t) => {
      const hrs = hoursUntil(t.expirationDate)
      return (t.effectiveStatus === 'available' || t.effectiveStatus === 'partially_used') && hrs > 0 && hrs <= 168
    }).length
    const remainingValue = tokenRows.reduce((sum, t) => {
      if (t.effectiveStatus !== 'available' && t.effectiveStatus !== 'partially_used') return sum
      return sum + tokenEstimatedValue(t) * Number(t.remainingQuantity || 0)
    }, 0)
    return { activePromos, available, used, expired, expiringSoon, remainingValue }
  }, [promotions, tokenRows])

  const linkedBets = (token) => (token.usedOnBetIds || []).map((id) => log.find((entry) => entry.id === id)).filter(Boolean)
  const promotionName = (id) => promotions.find((p) => p.id === id)?.promotionName || ''

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-100">Promotions &amp; Tokens</h2>
          <p className="text-sm text-slate-400">Promotions are sportsbook offers. Tokens are the usable items those offers grant.</p>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-200">Reusable Promo/Token Library</h3>
            <p className="text-xs text-slate-500">Use recurring sportsbook templates, save your own versions, or upload a JSON library.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input ref={uploadRef} type="file" accept="application/json,.json" className="hidden" onChange={importFile} />
            <Button variant="secondary" onClick={() => uploadRef.current?.click()}>Upload Library</Button>
            <Button variant="secondary" onClick={exportTemplateLibrary} disabled={!templateLibrary.length}>Export My Library</Button>
          </div>
        </div>
        {importMessage && <div className="mt-3 rounded bg-slate-900 px-3 py-2 text-xs text-slate-300">{importMessage}</div>}
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <TextInput placeholder="Search templates" value={librarySearch} onChange={(e) => setLibrarySearch(e.target.value)} />
          <Select value={libraryBook} onChange={(e) => setLibraryBook(e.target.value)}>
            <option value="">All template sportsbooks</option>
            {allSportsbooks.map((book) => <option key={book} value={book}>{book}</option>)}
          </Select>
        </div>
        <div className="mt-3 grid max-h-72 gap-2 overflow-y-auto md:grid-cols-2 xl:grid-cols-3">
          {shownTemplates.map((template) => {
            const isCustom = templateLibrary.some((item) => templateKey(item) === templateKey(template))
            return (
              <div key={`${isCustom ? 'custom' : 'built'}-${templateKey(template)}`} className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold uppercase text-emerald-400">{template.sportsbook || 'Sportsbook'}</div>
                    <div className="mt-1 text-sm font-medium text-slate-100">{template.promo_name || template.promotionName || template.tokenName}</div>
                  </div>
                  <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300">{isCustom ? 'Saved' : 'Built-in'}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                  <span>{label(template.promo_type || template.promotionType || template.tokenType)}</span>
                  {template.boost_percentage != null && <span>{template.boost_percentage}% boost</span>}
                  {template.max_wager_amount != null && <span>Max {formatUSD(template.max_wager_amount)}</span>}
                  {template.min_odds && <span>Min {template.min_odds}</span>}
                </div>
                {template.notes && <p className="mt-2 line-clamp-2 text-[11px] text-slate-500">{template.notes}</p>}
                <div className="mt-3 flex justify-end gap-1">
                  <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => createFromTemplate(template)}>Create</Button>
                  {!isCustom && <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => addTemplateToLibrary(template)}>Save</Button>}
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <Card className="p-3"><div className="text-xs uppercase text-slate-400">Active Promos</div><div className="mt-1 text-2xl font-bold text-slate-100">{summary.activePromos}</div></Card>
        <Card className="p-3"><div className="text-xs uppercase text-slate-400">Available Uses</div><div className="mt-1 text-2xl font-bold text-emerald-300">{summary.available}</div></Card>
        <Card className="p-3"><div className="text-xs uppercase text-slate-400">Used Tokens</div><div className="mt-1 text-2xl font-bold text-slate-100">{summary.used}</div></Card>
        <Card className="p-3"><div className="text-xs uppercase text-slate-400">Expired</div><div className="mt-1 text-2xl font-bold text-red-300">{summary.expired}</div></Card>
        <Card className="p-3"><div className="text-xs uppercase text-slate-400">Expiring 7d</div><div className="mt-1 text-2xl font-bold text-amber-300">{summary.expiringSoon}</div></Card>
        <Card className="p-3"><div className="text-xs uppercase text-slate-400">Remaining Value</div><div className="mt-1 text-2xl font-bold text-slate-100">{formatUSD(summary.remainingValue)}</div></Card>
      </div>

      <Card className="p-3">
        <div className="grid gap-2 sm:grid-cols-3">
          <Select value={fBook} onChange={(e) => setFBook(e.target.value)}>
            <option value="">All sportsbooks</option>
            {allSportsbooks.map((book) => <option key={book} value={book}>{book}</option>)}
          </Select>
          <Select value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
            <option value="">All token statuses</option>
            {TOKEN_STATUSES.map((status) => <option key={status} value={status}>{label(status)}</option>)}
          </Select>
          <Select value={fExpiry} onChange={(e) => setFExpiry(e.target.value)}>
            <option value="">Any expiration</option>
            <option value="soon">Expiring within 7 days</option>
          </Select>
        </div>
      </Card>

      {sortedTokens.length === 0 ? (
        <EmptyState message={tokens.length === 0 ? 'No tokens yet. Add a promotion, then create the token it grants.' : 'No tokens match your filters.'} />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="border-b border-slate-700">
              <tr>
                <SortHeader label="Sportsbook" sortKey="sportsbook" sort={sort} setSort={setSort} />
                <SortHeader label="Token" sortKey="tokenName" sort={sort} setSort={setSort} />
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Parent Promotion</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Type</th>
                <SortHeader label="Remaining" sortKey="remainingQuantity" sort={sort} setSort={setSort} />
                <SortHeader label="Value" sortKey="value" sort={sort} setSort={setSort} />
                <SortHeader label="Expires" sortKey="expirationDate" sort={sort} setSort={setSort} />
                <SortHeader label="Status" sortKey="status" sort={sort} setSort={setSort} />
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Used On</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedTokens.map((token) => {
                const hrs = hoursUntil(token.expirationDate)
                const bets = linkedBets(token)
                return (
                  <tr key={token.id} className={`border-b border-slate-800 ${hrs > 0 && hrs <= 48 ? 'bg-amber-950/20' : ''}`}>
                    <td className="px-3 py-2 text-slate-200">{token.sportsbook}</td>
                    <td className="px-3 py-2"><div className="text-slate-200">{token.tokenName}</div><div className="text-[11px] text-slate-500">{token.notes}</div></td>
                    <td className="px-3 py-2 text-slate-400">{promotionName(token.promotionId) || <span className="text-slate-600">None</span>}</td>
                    <td className="px-3 py-2 text-slate-300">{label(token.tokenType)}</td>
                    <td className="px-3 py-2 text-slate-300">{token.remainingQuantity} / {token.quantity}</td>
                    <td className="px-3 py-2 text-slate-300">{formatUSD(tokenEstimatedValue(token))}</td>
                    <td className="px-3 py-2 text-slate-300">{token.expirationDate ? <><div>{token.expirationDate}</div>{hrs > 0 && hrs <= 168 && <div className="text-[11px] text-amber-400">in {countdownString(token.expirationDate)}</div>}</> : '—'}</td>
                    <td className="px-3 py-2">{statusBadge(token.effectiveStatus)}</td>
                    <td className="px-3 py-2 text-[11px] text-slate-400">{bets.length ? bets.map((bet) => <div key={bet.id}>{bet.date} - {bet.event || bet.sportMarket || bet.type}</div>) : <span className="text-slate-600">None yet</span>}</td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => editToken(token)}>Edit</Button>
                        <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => saveTokenAsTemplate(token)}>Save Template</Button>
                        <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setTokenStatus(token.id, 'used')}>Used</Button>
                        <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setTokenStatus(token.id, 'expired')}>Expired</Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <PromotionForm key={editingPromoId || 'new-promo'} initial={promoDraft} onSave={savePromotion} sportsbookNames={allSportsbooks} />
        <TokenForm key={editingTokenId || tokenDraft.promotionId || 'new-token'} initial={tokenDraft} promotions={promotions} onSave={saveToken} />
      </div>

      <Card className="overflow-x-auto">
        <div className="border-b border-slate-700 p-3 text-sm font-semibold text-slate-200">Promotions</div>
        {promotions.length === 0 ? <div className="p-4 text-sm text-slate-500">No promotions added yet.</div> : (
          <table className="w-full min-w-[800px] text-sm">
            <thead className="border-b border-slate-700 text-xs uppercase tracking-wide text-slate-400">
              <tr><th className="px-3 py-2 text-left">Sportsbook</th><th className="px-3 py-2 text-left">Promotion</th><th className="px-3 py-2 text-left">Type</th><th className="px-3 py-2 text-left">Expires</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2 text-right">Actions</th></tr>
            </thead>
            <tbody>
              {promotions.map((promo) => (
                <tr key={promo.id} className="border-b border-slate-800">
                  <td className="px-3 py-2 text-slate-200">{promo.sportsbook}</td>
                  <td className="px-3 py-2"><div className="text-slate-200">{promo.promotionName}</div><div className="text-[11px] text-slate-500">{promo.description}</div></td>
                  <td className="px-3 py-2 text-slate-300">{label(promo.promotionType)}</td>
                  <td className="px-3 py-2 text-slate-300">{promo.expirationDate || '—'}</td>
                  <td className="px-3 py-2">{statusBadge(effectivePromotionStatus(promo))}</td>
                  <td className="px-3 py-2"><div className="flex justify-end gap-1"><Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => makeTokenFromPromo(promo)}>Create Token</Button><Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => editPromo(promo)}>Edit</Button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
