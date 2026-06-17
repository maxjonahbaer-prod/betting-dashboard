import React, { useState } from 'react'
import { Button, Card, Field, TextInput } from '../components.jsx'
import { pushBetsToSheet, pullBetsFromSheet, syncBetsWithSheet, BET_SHEET_HEADERS } from '../sheetsSync'

export default function SheetSync({ log, setLog, settings, setSettings }) {
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setSettings((prev) => ({ ...prev, [k]: v }))

  function validateScriptUrl() {
    if (!settings.scriptUrl) return 'Paste your deployed Apps Script Web App URL first.'
    if (settings.scriptUrl.includes('docs.google.com/spreadsheets')) {
      return 'That is the Google Sheet URL. Deploy the Apps Script as a Web App, then paste the script.google.com/macros/.../exec URL here.'
    }
    if (!settings.scriptUrl.includes('script.google.com/macros/')) {
      return 'This should be a Google Apps Script Web App URL that starts with https://script.google.com/macros/.'
    }
    return ''
  }

  async function run(label, fn) {
    const validation = validateScriptUrl()
    if (validation) {
      setStatus(validation)
      return
    }
    setBusy(true)
    setStatus(`${label}...`)
    try {
      const result = await fn()
      setStatus(result)
    } catch (err) {
      setStatus(`Sync failed: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-100">Google Sheets Sync</h2>
        <p className="text-sm text-slate-400">Keep your Opportunity Log and bet-tracking Google Sheet in sync.</p>
      </div>

      <Card className="p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
          <Field label="Google Apps Script Web App URL">
            <TextInput
              value={settings.scriptUrl || ''}
              onChange={(e) => set('scriptUrl', e.target.value)}
              placeholder="https://script.google.com/macros/s/.../exec (not the spreadsheet URL)"
            />
          </Field>
          <div className="flex items-end">
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200">
              <input type="checkbox" checked={Boolean(settings.autoSync)} onChange={(e) => set('autoSync', e.target.checked)} />
              Auto sync
            </label>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            disabled={busy || !settings.scriptUrl}
            onClick={() => run('Pulling from Google Sheets', async () => {
              const next = await pullBetsFromSheet(settings.scriptUrl, log)
              setLog(next)
              return `Pulled and merged ${next.length} bets from Google Sheets.`
            })}
          >
            Pull from Sheet
          </Button>
          <Button
            variant="secondary"
            disabled={busy || !settings.scriptUrl}
            onClick={() => run('Pushing to Google Sheets', async () => {
              const result = await pushBetsToSheet(settings.scriptUrl, log)
              return `Pushed ${result.count ?? log.length} bets to Google Sheets.`
            })}
          >
            Push to Sheet
          </Button>
          <Button
            variant="secondary"
            disabled={busy || !settings.scriptUrl}
            onClick={() => run('Syncing both ways', async () => {
              const next = await syncBetsWithSheet(settings.scriptUrl, log)
              setLog(next)
              return `Synced ${next.length} bets both ways.`
            })}
          >
            Sync Both Ways
          </Button>
        </div>
        {status && <div className="mt-3 rounded bg-slate-900 px-3 py-2 text-xs text-slate-300">{status}</div>}
      </Card>

      <Card className="p-4">
        <h3 className="text-sm font-semibold text-slate-200">Sheet Setup</h3>
        <p className="mt-2 text-sm text-slate-400">
          Open Extensions, then Apps Script in this spreadsheet, paste the included script, deploy it as a Web App, then paste the script.google.com Web App URL above. Do not paste the normal docs.google.com spreadsheet URL.
        </p>
        <div className="mt-3 rounded bg-slate-950/70 p-3 font-mono text-[11px] text-slate-300">
          {BET_SHEET_HEADERS.join(' | ')}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          The script will create/use a tab named Bets. If your existing Sheet has similar headers, it will map them into this app shape.
        </p>
      </Card>
    </div>
  )
}
