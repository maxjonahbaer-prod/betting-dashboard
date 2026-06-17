"""Competition (league) scraping for DraftKings and FanDuel.

The upstream sportsbook-odds-scraper only handles a *single event* URL. This
module adds the ability to pull *every event in a competition* (e.g. all World
Cup soccer matches) and to support FanDuel, which the upstream repo does not.

IMPORTANT — these endpoints could not be tested from the build machine because
its network (a FortiGate firewall) blocks gambling domains. The request shapes
below match DraftKings' and FanDuel's real public APIs as of late 2025, but the
per-competition IDs change every tournament and MUST be verified once you are on
an un-filtered network. Each competition's ID is configurable in COMPETITIONS
below and can also be overridden per-request from the UI.
"""
import requests
from requests.adapters import HTTPAdapter
from urllib3 import Retry

# ---------------------------------------------------------------------------
# Config: sports -> competitions -> per-book identifiers.
#
#   dk_league_id : numeric leagueId used by DraftKings' sportscontent API.
#   fd_page_id   : customPageId slug used by FanDuel's content-managed-page API.
#
# These are best-effort defaults. Verify/replace them once reachable (see the
# `find_ids` notes at the bottom of this file).
# ---------------------------------------------------------------------------
COMPETITIONS = {
    "Soccer": [
        {
            "name": "FIFA World Cup",
            "dk_league_id": "102832",   # VERIFY: DK soccer World Cup leagueId
            "fd_page_id": "fifa-world-cup",  # VERIFY: FanDuel custom page slug
        },
    ],
}

# FanDuel's public web API key (constant, shipped in their JS bundle).
FANDUEL_AK = "FhMFpcPWXMeyZxOx"

_session = requests.Session()
_session.mount("https://", HTTPAdapter(max_retries=Retry(total=2)))

_HEADERS = {
    "Accept": "application/json",
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
    ),
}


def get_competitions():
    """Sports + competitions exposed to the UI."""
    return {
        sport: [{"name": c["name"]} for c in comps]
        for sport, comps in COMPETITIONS.items()
    }


def _find_competition(sport, name):
    for c in COMPETITIONS.get(sport, []):
        if c["name"] == name:
            return c
    return None


def _to_float(value):
    try:
        return float(str(value).replace(",", ""))
    except (TypeError, ValueError):
        return None


def _american_to_decimal(american):
    a = _to_float(american)
    if a is None or a == 0:
        return None
    return 1 + (a / 100 if a > 0 else 100 / abs(a))


# ---------------------------------------------------------------------------
# DraftKings — sportscontent "leagues" API (returns all events in a league).
# ---------------------------------------------------------------------------
def scrape_draftkings_league(league_id, jurisdiction="dkusoh"):
    url = (
        f"https://sportsbook-nash.draftkings.com/api/sportscontent/"
        f"{jurisdiction}/v1/leagues/{league_id}"
    )
    resp = _session.get(url, headers=_HEADERS, timeout=15)
    resp.raise_for_status()
    return _parse_draftkings_league(resp.json())


def _dk_selection_decimal(sel):
    odds = sel.get("displayOdds") or sel.get("trueOdds") or {}
    dec = _to_float(odds.get("decimal"))
    if dec:
        return dec
    return _american_to_decimal(odds.get("american"))


def _parse_draftkings_league(data):
    events = {str(e.get("id")): (e.get("name") or e.get("eventName"))
              for e in data.get("events", [])}
    markets = {str(m.get("id")): m for m in data.get("markets", [])}

    by_event = {}
    for sel in data.get("selections", []):
        market = markets.get(str(sel.get("marketId")))
        if not market:
            continue
        event_name = events.get(str(market.get("eventId")), "Unknown event")
        dec = _dk_selection_decimal(sel)
        if not dec:
            continue
        by_event.setdefault(event_name, []).append({
            "market_group": market.get("marketCategory", "Match"),
            "market_name": market.get("name") or market.get("marketType", {}).get("name"),
            "selection_name": sel.get("label") or sel.get("name"),
            "odds": dec,
            "line": sel.get("points") if sel.get("points") is not None else sel.get("line"),
        })
    return _as_events(by_event)


# ---------------------------------------------------------------------------
# FanDuel — content-managed-page API (all events for a custom competition page).
# ---------------------------------------------------------------------------
def scrape_fanduel_competition(page_id, region="nj"):
    url = f"https://sbapi.{region}.sportsbook.fanduel.com/api/content-managed-page"
    params = {
        "page": "CUSTOM",
        "customPageId": page_id,
        "_ak": FANDUEL_AK,
        "timezone": "America/New_York",
    }
    resp = _session.get(url, headers=_HEADERS, params=params, timeout=15)
    resp.raise_for_status()
    return _parse_fanduel(resp.json())


def _fd_runner_decimal(runner):
    win = runner.get("winRunnerOdds") or {}
    # FanDuel nests decimal odds a few levels deep; try the known paths.
    true_odds = win.get("trueOdds", {}).get("decimalOdds", {})
    dec = _to_float(true_odds.get("decimalOdds"))
    if dec:
        return dec
    american = win.get("americanDisplayOdds", {}).get("americanOdds")
    return _american_to_decimal(american)


def _parse_fanduel(data):
    att = data.get("attachments", {})
    events = att.get("events", {})
    markets = att.get("markets", {})

    by_event = {}
    for market in markets.values():
        ev = events.get(str(market.get("eventId"))) or {}
        event_name = ev.get("name", "Unknown event")
        market_name = market.get("marketName")
        for runner in market.get("runners", []):
            dec = _fd_runner_decimal(runner)
            if not dec:
                continue
            by_event.setdefault(event_name, []).append({
                "market_group": market.get("marketType", "Match"),
                "market_name": market_name,
                "selection_name": runner.get("runnerName"),
                "odds": dec,
                "line": runner.get("handicap"),
            })
    return _as_events(by_event)


def _as_events(by_event):
    return [
        {"event": name, "odds": rows, "selectionCount": len(rows)}
        for name, rows in by_event.items()
    ]


# ---------------------------------------------------------------------------
# Public entrypoint used by the API layer.
# ---------------------------------------------------------------------------
def scrape_competition(book, sport, competition, override_id=None, region="nj"):
    """Return {ok, book, competition, events:[...]} or {ok:False, error}."""
    conf = _find_competition(sport, competition)
    if not conf and not override_id:
        return {"ok": False, "book": book, "error": f"Unknown competition: {sport} / {competition}"}

    try:
        if book == "DraftKings":
            league_id = override_id or conf["dk_league_id"]
            events = scrape_draftkings_league(league_id)
        elif book == "FanDuel":
            page_id = override_id or conf["fd_page_id"]
            events = scrape_fanduel_competition(page_id, region=region)
        else:
            return {"ok": False, "book": book, "error": f"Unsupported book: {book}"}
    except requests.HTTPError as ex:
        return {"ok": False, "book": book, "error": f"Server returned {ex.response.status_code}. The competition ID may be wrong or the page is unavailable."}
    except requests.RequestException as ex:
        return {"ok": False, "book": book, "error": f"Could not reach {book}: {ex}. (A network firewall may be blocking gambling sites.)"}
    except Exception as ex:  # noqa: BLE001 - surface parse failures to the UI
        return {"ok": False, "book": book, "error": f"Failed to parse {book} response: {ex}"}

    return {
        "ok": True,
        "book": book,
        "competition": competition,
        "eventCount": len(events),
        "selectionCount": sum(e["selectionCount"] for e in events),
        "events": events,
    }
