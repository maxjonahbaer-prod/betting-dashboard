# Live Odds backend

A small Flask API that wraps [sportsbook-odds-scraper](https://github.com/declanwalpole/sportsbook-odds-scraper)
and serves normalized odds to the dashboard's **Live Odds** tab.

The scraper modules (`event_scraper.py`, `sportsbook.py`, `sportsbook_implementations/`,
etc.) are vendored here from that repo.

## Run

```bash
# one-time: create the venv and install deps
npm run setup:server

# start the API on http://127.0.0.1:5174  (Vite proxies /api -> here)
npm run server
```

Then in another terminal start the frontend with `npm run dev` and open the
**Live Odds** tab.

## Endpoints

| Method | Path               | Body / Result |
| ------ | ------------------ | ------------- |
| GET    | `/api/health`      | `{status:"ok"}` |
| GET    | `/api/sportsbooks` | list of single-event books + a sample event URL |
| POST   | `/api/scrape`      | `{urls:[...]}` → `{results:[{ok, sportsbook, event, odds:[...]}, ...]}` |
| GET    | `/api/demo`        | sample (non-live) single-event data (Live Odds tab) |
| GET    | `/api/sports`      | `{Soccer:[{name:"FIFA World Cup"}], ...}` — competitions per sport |
| POST   | `/api/league`      | `{sport, competition, books:[...], overrides, region}` → all matches per book |
| GET    | `/api/sports-demo` | sample (non-live) World Cup data (Sports tab) |

Each `odds` row: `market_group, market_name, selection_name, odds (decimal), line`.

## Sports tab (DraftKings + FanDuel competitions)

`competitions.py` lists every event in a competition. DraftKings uses its
`sportscontent/.../leagues/{leagueId}` API; FanDuel (not in the upstream repo)
uses `content-managed-page?customPageId={slug}`. The World Cup IDs in
`COMPETITIONS` are best-effort placeholders — **per-tournament IDs change**, so
verify them once reachable and either edit `COMPETITIONS` or paste the correct
ID into the tab's **Advanced** panel.

## ⚠ Known blocker on this machine: gambling sites are firewalled

This machine's network runs a **FortiGate firewall** that SSL-intercepts and
**blocks DraftKings/FanDuel** (returns a 403 block page; the served TLS cert is
issued by `Fortinet`, not the book). Because the scraper runs locally, **no live
odds can be fetched here.** Both tabs surface this gracefully as a per-source
error and offer "Load sample data" so the UI stays usable.

To get live data, run the app from a network **without** the gambling filter
(and in a jurisdiction where you hold accounts). No code change is needed — the
scrapers will start returning real odds once the books are reachable.

## Notes / limitations

Sportsbook APIs are undocumented and geo-restricted. A scrape will only succeed
when:

- you're in (or routed through) a jurisdiction the book serves, and
- the event URL is for a **current** event page (not a league/sport page).

If a request fails you'll see the reason per-URL in the UI (connection error,
server error, parsing error). This is expected behavior inherited from the
upstream scraper — it has no guaranteed uptime.
