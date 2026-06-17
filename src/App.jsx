import React, { useEffect, useMemo, useRef, useState } from 'react'
import { usePersistentState, STORAGE_OK, clearAllData, migratePromotions, migrateTokens, loadLegacyPromoTokens } from './storage'
import { Button, Modal } from './components.jsx'
import Dashboard from './tabs/Dashboard.jsx'
import LiveOdds from './tabs/LiveOdds.jsx'
import Sports from './tabs/Sports.jsx'
import PromotionsTokens from './tabs/PromotionsTokens.jsx'
import ArbCalculator from './tabs/ArbCalculator.jsx'
import ArbFinder from './tabs/ArbFinder.jsx'
import FreeBetCalculator from './tabs/FreeBetCalculator.jsx'
import BankrollLedger from './tabs/BankrollLedger.jsx'
import OpportunityLog from './tabs/OpportunityLog.jsx'
import SheetSync from './tabs/SheetSync.jsx'
import { pushBetsToSheet, pullBetsFromSheet } from './sheetsSync'

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'sports', label: 'Sports' },
  { id: 'odds', label: 'Live Odds' },
  { id: 'promos', label: 'Promotions & Tokens' },
  { id: 'arb', label: 'Arb & Boost Calculator' },
  { id: 'finder', label: 'Arb Finder' },
  { id: 'freebet', label: 'Free Bet Calculator' },
  { id: 'ledger', label: 'Bankroll Ledger' },
  { id: 'log', label: 'Opportunity Log' },
  { id: 'sheets', label: 'Google Sheets Sync' },
]

export default function App() {
  const [tab, setTab] = useState('dashboard')

  // Shared persisted data
  const [promos, setPromos] = usePersistentState('promoInventory', [])
  const [tokens, setTokens] = usePersistentState('promoTokens', loadLegacyPromoTokens())
  const [templateLibrary, setTemplateLibrary] = usePersistentState('promoTemplateLibrary', [])
  const [sportsbooks, setSportsbooks] = usePersistentState('sportsbooks', [])
  const [log, setLog] = usePersistentState('opportunityLog', [])
  const [quotes, setQuotes] = usePersistentState('marketQuotes', [])
  const [sheetSyncSettings, setSheetSyncSettings] = usePersistentState('sheetSyncSettings', {
    scriptUrl: '',
    autoSync: false,
  })
  const syncSkipFirst = useRef(true)
  const lastPushedLog = useRef('')

  const promotions = useMemo(() => migratePromotions(promos), [promos])
  const promoTokens = useMemo(() => migrateTokens(tokens, promotions), [tokens, promotions])

  function setPromotions(next) {
    setPromos(next)
  }

  function setPromoTokens(next) {
    setTokens(next)
  }

  // Cross-tab prefill handoffs
  const [arbPrefill, setArbPrefill] = useState(null)
  const [freeBetPrefill, setFreeBetPrefill] = useState(null)
  const [logPrefill, setLogPrefill] = useState(null)

  const [resetOpen, setResetOpen] = useState(false)

  const sportsbookNames = useMemo(
    () => sportsbooks.map((s) => s.name).filter(Boolean),
    [sportsbooks],
  )

  // Navigate to a calculator with prefill from a promo row.
  function useInCalculator(promo) {
    const isFree = ['Free Bet', 'Risk-Free Bet', 'Deposit Match'].includes(promo.promoType)
    if (isFree) {
      setFreeBetPrefill({
        sportsbook: promo.sportsbook,
        freeBetAmount: promo.bonusAmount || '',
        mode: promo.promoType === 'Risk-Free Bet' ? 'riskfree' : 'free',
        promoId: promo.id,
      })
      setTab('freebet')
    } else {
      setArbPrefill({
        sportsbookA: promo.sportsbook,
        boostA: promo.boostPct || 0,
        promoId: promo.id,
      })
      setTab('arb')
    }
  }

  // Save an entry from a calculator into the Opportunity Log.
  function saveToLog(entry) {
    setLogPrefill(entry)
    setTab('log')
  }

  useEffect(() => {
    if (!sheetSyncSettings.autoSync || !sheetSyncSettings.scriptUrl) return undefined
    let cancelled = false
    async function pull() {
      try {
        const next = await pullBetsFromSheet(sheetSyncSettings.scriptUrl, log)
        if (!cancelled) {
          const nextJson = JSON.stringify(next)
          lastPushedLog.current = nextJson
          setLog(next)
        }
      } catch {
        /* keep the dashboard usable if the sheet endpoint is temporarily unavailable */
      }
    }
    pull()
    const id = window.setInterval(pull, 60000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [sheetSyncSettings.autoSync, sheetSyncSettings.scriptUrl])

  useEffect(() => {
    if (!sheetSyncSettings.autoSync || !sheetSyncSettings.scriptUrl) return undefined
    if (syncSkipFirst.current) {
      syncSkipFirst.current = false
      return undefined
    }
    const logJson = JSON.stringify(log)
    if (logJson === lastPushedLog.current) return undefined
    const id = window.setTimeout(() => {
      pushBetsToSheet(sheetSyncSettings.scriptUrl, log)
        .then(() => { lastPushedLog.current = logJson })
        .catch(() => {})
    }, 1500)
    return () => window.clearTimeout(id)
  }, [log, sheetSyncSettings.autoSync, sheetSyncSettings.scriptUrl])

  function handleReset() {
    clearAllData()
    setPromos([])
    setSportsbooks([])
    setLog([])
    setTokens([])
    setTemplateLibrary([])
    setQuotes([])
    setSheetSyncSettings({ scriptUrl: '', autoSync: false })
    setResetOpen(false)
  }

  return (
    <div className="min-h-full">
      {/* Top navigation */}
      <header className="sticky top-0 z-40 border-b border-slate-700 bg-slate-900/95 backdrop-blur">
        <div className="mx-auto max-w-7xl px-3 sm:px-6">
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">📊</span>
              <h1 className="text-base font-bold text-slate-100 sm:text-lg">Promo Arb Dashboard</h1>
            </div>
            <Button variant="ghost" className="text-xs" onClick={() => setResetOpen(true)}>
              ⚙ Reset Data
            </Button>
          </div>
          <nav className="flex gap-1 overflow-x-auto pb-2">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  tab === t.id
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {!STORAGE_OK && (
        <div className="bg-amber-900/40 px-4 py-2 text-center text-xs text-amber-200">
          ⚠ localStorage is unavailable in this environment — data is kept in memory only and will be
          lost on refresh.
        </div>
      )}

      <main className="mx-auto max-w-7xl px-3 py-5 sm:px-6">
        {tab === 'dashboard' && (
          <Dashboard
            promos={promotions}
            tokens={promoTokens}
            sportsbooks={sportsbooks}
            log={log}
            goTo={setTab}
          />
        )}
        {tab === 'sports' && <Sports />}
        {tab === 'odds' && <LiveOdds />}
        {tab === 'promos' && (
          <PromotionsTokens
            promotions={promotions}
            setPromotions={setPromotions}
            tokens={promoTokens}
            setTokens={setPromoTokens}
            sportsbookNames={sportsbookNames}
            setSportsbooks={setSportsbooks}
            log={log}
            templateLibrary={templateLibrary}
            setTemplateLibrary={setTemplateLibrary}
          />
        )}
        {tab === 'arb' && (
          <ArbCalculator
            sportsbookNames={sportsbookNames}
            prefill={arbPrefill}
            clearPrefill={() => setArbPrefill(null)}
            saveToLog={saveToLog}
          />
        )}
        {tab === 'finder' && (
          <ArbFinder
            sportsbookNames={sportsbookNames}
            promos={promos}
            quotes={quotes}
            setQuotes={setQuotes}
            saveToLog={saveToLog}
          />
        )}
        {tab === 'freebet' && (
          <FreeBetCalculator
            sportsbookNames={sportsbookNames}
            prefill={freeBetPrefill}
            clearPrefill={() => setFreeBetPrefill(null)}
            saveToLog={saveToLog}
          />
        )}
        {tab === 'ledger' && (
          <BankrollLedger sportsbooks={sportsbooks} setSportsbooks={setSportsbooks} />
        )}
        {tab === 'sheets' && (
          <SheetSync
            log={log}
            setLog={setLog}
            settings={sheetSyncSettings}
            setSettings={setSheetSyncSettings}
          />
        )}
        {tab === 'log' && (
          <OpportunityLog
            log={log}
            setLog={setLog}
            promos={promotions}
            tokens={promoTokens}
            setTokens={setPromoTokens}
            sportsbookNames={sportsbookNames}
            prefill={logPrefill}
            clearPrefill={() => setLogPrefill(null)}
          />
        )}
      </main>

      <footer className="mx-auto max-w-7xl px-3 py-6 text-center text-xs text-slate-600 sm:px-6">
        Promo Arb Dashboard · all data stored locally in your browser ·{' '}
        <button className="underline hover:text-slate-400" onClick={() => setResetOpen(true)}>
          Reset All Data
        </button>
      </footer>

      <Modal open={resetOpen} onClose={() => setResetOpen(false)} title="Reset All Data?">
        <p className="text-sm text-slate-300">
          This permanently clears all promos, sportsbooks, and opportunity log entries. This cannot be
          undone.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setResetOpen(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleReset}>
            Yes, delete everything
          </Button>
        </div>
      </Modal>
    </div>
  )
}
