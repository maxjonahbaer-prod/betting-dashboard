"""Flask API that wraps the sportsbook-odds-scraper.

Exposes the scraper to the React dashboard. Each /api/scrape request runs a
fresh EventScraper (the scraper is stateful) and returns normalized odds.

Run:  python server/api.py   (listens on :5174, proxied by Vite under /api)
"""
import math
import os
import sys

from flask import Flask, jsonify, request

# The scraper modules use flat, top-level imports (e.g. `from event_scraper
# import EventScraper`), so they must resolve against this directory.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from event_scraper import EventScraper  # noqa: E402
import competitions  # noqa: E402

app = Flask(__name__)

# Supported books + a sample event URL for each, surfaced to the UI so the
# user knows what to paste. Examples come from the scraper's main.py.
SPORTSBOOKS = [
    {"name": "DraftKings", "region": "US",
     "example": "https://sportsbook.draftkings.com/event/det-lions-%40-kc-chiefs/28867533"},
    {"name": "BetMGM", "region": "US",
     "example": "https://sports.az.betmgm.com/en/sports/events/arizona-diamondbacks-at-los-angeles-dodgers-14545130"},
    {"name": "Caesars", "region": "US",
     "example": "https://sportsbook.caesars.com/us/co/bet/baseball/15bd01e4-8368-4df0-8bcf-61b222df30ee/arizona-diamondbacks-at-los-angeles-dodgers"},
    {"name": "BetRivers", "region": "US",
     "example": "https://co.betrivers.com/?page=sportsbook#event/live/1020060483"},
    {"name": "SuperBook", "region": "US",
     "example": "https://nj.superbook.com/sports/event/290697.1"},
    {"name": "Bovada", "region": "US",
     "example": "https://www.bovada.lv/sports/football/college-football/nc-state-connecticut-202308311930"},
    {"name": "PointsBet", "region": "AU",
     "example": "https://pointsbet.com.au/sports/rugby-league/NRL/2245825"},
    {"name": "SportsBet", "region": "AU",
     "example": "https://www.sportsbet.com.au/betting/basketball-aus-other/fiba-world-cup-men/angola-v-china-7600223"},
    {"name": "TAB", "region": "AU",
     "example": "https://www.tab.com.au/sports/betting/Soccer/competitions/UEFA%20Europa%20League/matches/FK%20Qarabag%20v%20Olimpija"},
    {"name": "Ladbrokes", "region": "AU",
     "example": "https://www.ladbrokes.com.au/sports/rugby-league/nrl/brisbane-broncos-vs-melbourne-storm/bcdbdfbc-98d6-45e3-84a4-66a2b88e69fc"},
]


def _clean(value):
    """JSON-safe value (pandas can emit NaN / numpy types)."""
    if isinstance(value, float) and math.isnan(value):
        return None
    return value


def scrape_one(url):
    """Scrape a single event URL into a plain dict the frontend can render."""
    scraper = EventScraper()
    scraper.scrape(url)

    if scraper.error_message or scraper.odds_df is None:
        return {
            "url": url,
            "ok": False,
            "error": scraper.error_message or "No odds returned.",
        }

    records = []
    for row in scraper.odds_df.to_dict(orient="records"):
        records.append({k: _clean(v) for k, v in row.items()})

    book = scraper.sportsbook.get_name() if scraper.sportsbook else "Unknown"
    jurisdiction = scraper.jurisdiction if scraper.jurisdiction != "Not applicable" else None

    return {
        "url": url,
        "ok": True,
        "sportsbook": book,
        "jurisdiction": jurisdiction,
        "event": scraper.event_name,
        "marketCount": int(scraper.odds_df["market_id"].nunique()),
        "selectionCount": int(len(scraper.odds_df)),
        "odds": records,
    }


@app.get("/api/sportsbooks")
def sportsbooks():
    return jsonify(SPORTSBOOKS)


@app.post("/api/scrape")
def scrape():
    data = request.get_json(silent=True) or {}
    urls = data.get("urls")
    if not urls and data.get("url"):
        urls = [data["url"]]
    urls = [u.strip() for u in (urls or []) if u and u.strip()]

    if not urls:
        return jsonify({"error": "Provide at least one event URL."}), 400

    results = []
    for url in urls:
        try:
            results.append(scrape_one(url))
        except Exception as ex:  # noqa: BLE001 - surface any scraper failure to UI
            results.append({"url": url, "ok": False, "error": str(ex)})

    return jsonify({"results": results})


@app.get("/api/sports")
def sports():
    """Sports + competitions available in the Sports tab."""
    return jsonify(competitions.get_competitions())


@app.post("/api/league")
def league():
    """Scrape all events in a competition for one or more books.

    Body: {sport, competition, books:[...], overrides:{book:id}, region}
    """
    data = request.get_json(silent=True) or {}
    sport = data.get("sport")
    competition = data.get("competition")
    books = data.get("books") or []
    overrides = data.get("overrides") or {}
    region = data.get("region", "nj")

    if not sport or not competition or not books:
        return jsonify({"error": "Provide sport, competition, and at least one book."}), 400

    results = [
        competitions.scrape_competition(
            book, sport, competition,
            override_id=overrides.get(book) or None,
            region=region,
        )
        for book in books
    ]
    return jsonify({"results": results})


def _demo_match(home, away, h_odds, d_odds, a_odds, o_odds, u_odds):
    return {
        "event": f"{home} v {away}",
        "selectionCount": 5,
        "odds": [
            {"market_group": "Match", "market_name": "Match Result (3-Way)",
             "selection_name": home, "odds": h_odds, "line": None},
            {"market_group": "Match", "market_name": "Match Result (3-Way)",
             "selection_name": "Draw", "odds": d_odds, "line": None},
            {"market_group": "Match", "market_name": "Match Result (3-Way)",
             "selection_name": away, "odds": a_odds, "line": None},
            {"market_group": "Goals", "market_name": "Total Goals",
             "selection_name": "Over", "odds": o_odds, "line": 2.5},
            {"market_group": "Goals", "market_name": "Total Goals",
             "selection_name": "Under", "odds": u_odds, "line": 2.5},
        ],
    }


@app.get("/api/sports-demo")
def sports_demo():
    """Sample (non-live) World Cup soccer data for the Sports tab."""
    dk = [
        _demo_match("USA", "England", 3.10, 3.40, 2.30, 1.90, 1.95),
        _demo_match("Brazil", "Argentina", 2.50, 3.20, 2.80, 2.05, 1.80),
        _demo_match("France", "Spain", 2.40, 3.30, 2.95, 1.85, 1.98),
    ]
    fd = [
        _demo_match("USA", "England", 3.05, 3.50, 2.35, 1.87, 2.00),
        _demo_match("Brazil", "Argentina", 2.55, 3.10, 2.75, 2.10, 1.76),
        _demo_match("France", "Spain", 2.45, 3.25, 2.90, 1.83, 2.02),
    ]
    return jsonify({"results": [
        {"ok": True, "book": "DraftKings", "competition": "FIFA World Cup",
         "eventCount": len(dk), "selectionCount": 15, "events": dk},
        {"ok": True, "book": "FanDuel", "competition": "FIFA World Cup",
         "eventCount": len(fd), "selectionCount": 15, "events": fd},
    ]})


# ---------------------------------------------------------------------------
# Screenshot → structured promo token (Claude vision extraction)
# ---------------------------------------------------------------------------

# Mirrors the Token Library schema enums in src/lib/tokenStore.js. The tool
# input schema is the contract Claude fills; keep these in sync with the UI.
_PROMO_TYPES = [
    "profit_boost", "odds_boost", "parlay_boost", "sgp_boost", "free_bet",
    "bonus_bet", "bet_protection", "risk_free_bet", "early_win", "draw_refund",
    "deposit_match", "reload_bonus", "predictions_bonus", "other",
]
_BOOST_APPLIES_TO = ["net_winnings", "gross_payout"]
_PROTECTION_TYPES = ["cash", "bonus_bet"]
_BET_TYPES = ["straight", "parlay", "sgp", "sgpx"]

# Only the fields a screenshot can plausibly contain. created_at/id/status are
# filled client-side. Nothing is `required` — Claude omits what isn't visible.
_PROMO_TOOL_SCHEMA = {
    "type": "object",
    "properties": {
        "sportsbook": {"type": "string", "description": "e.g. FanDuel, DraftKings, BetMGM"},
        "promo_name": {"type": "string", "description": "Official promo name/headline, e.g. '50% Profit Boost'"},
        "promo_type": {"type": "string", "enum": _PROMO_TYPES},
        "token_id": {"type": "string", "description": "Internal token/promo code if shown"},
        "expiry_date": {"type": "string", "description": "Expiry as ISO date YYYY-MM-DD if shown"},
        "boost_percentage": {"type": "number", "description": "e.g. 50 for a 50% boost"},
        "max_wager_amount": {"type": "number", "description": "Max stake the promo applies to, in dollars"},
        "min_odds": {"type": "string", "description": "Minimum odds requirement, American (e.g. -200) or decimal (e.g. 1.50), as written"},
        "max_odds": {"type": "string"},
        "boost_applies_to": {"type": "string", "enum": _BOOST_APPLIES_TO},
        "free_bet_amount": {"type": "number", "description": "Face value of a free/bonus bet, in dollars"},
        "stake_returned_on_free_bet": {"type": "boolean", "description": "True only if the stake is returned with winnings (rare); free/bonus bets are usually profit-only (false)"},
        "protection_amount": {"type": "number"},
        "protection_type": {"type": "string", "enum": _PROTECTION_TYPES, "description": "What a losing bet is refunded as"},
        "protection_max_refund": {"type": "number"},
        "deposit_match_percentage": {"type": "number"},
        "deposit_match_max": {"type": "number"},
        "deposit_match_rollover": {"type": "number", "description": "Playthrough/rollover multiplier, e.g. 10 for 10x"},
        "eligible_sports": {"type": "array", "items": {"type": "string"}, "description": "Empty/omit if all sports"},
        "eligible_leagues": {"type": "array", "items": {"type": "string"}, "description": "e.g. World Cup, MLB, WNBA. Empty/omit if all leagues"},
        "eligible_markets": {"type": "array", "items": {"type": "string"}, "description": "e.g. Moneyline, Spread, Over/Under. Empty/omit if all markets"},
        "eligible_bet_types": {"type": "array", "items": {"type": "string", "enum": _BET_TYPES}},
        "min_legs": {"type": "number", "description": "Minimum legs required for parlays/SGPs, e.g. 3"},
        "excluded_bet_types": {"type": "array", "items": {"type": "string"}, "description": "Ad-hoc exclusions, e.g. odds_boosts, bonus_bets, cashed_out, live"},
        "excluded_markets": {"type": "array", "items": {"type": "string"}},
        "early_win_trigger": {"type": "string", "description": "Plain-English early-settlement condition, if this is an early-win token"},
        "combinable_with_other_promos": {"type": "boolean"},
        "one_time_use": {"type": "boolean"},
        "requires_cash_funds": {"type": "boolean", "description": "True if bonus/site credit is excluded and only cash funds qualify"},
        "notes": {"type": "string", "description": "Any other relevant fine print, restrictions, or gotchas, summarized concisely"},
    },
    "additionalProperties": False,
}

# --- Promo Inventory target ------------------------------------------------
# The simpler schema used by the Promo Inventory tab (src/tabs/PromoInventory.jsx
# / emptyPromo). Enums mirror PROMO_TYPES and SPORTS in src/utils.js.
_PROMO_INVENTORY_TYPES = [
    "Profit Boost", "Odds Boost", "Free Bet", "Risk-Free Bet",
    "Deposit Match", "Parlay Insurance", "Other",
]
_SPORTS = ["NFL", "NBA", "MLB", "NHL", "Tennis", "Soccer", "MMA", "Golf", "Other"]

_PROMO_INVENTORY_TOOL_SCHEMA = {
    "type": "object",
    "properties": {
        "sportsbook": {"type": "string", "description": "e.g. FanDuel, DraftKings, BetMGM"},
        "name": {"type": "string", "description": "Promo name/description headline, e.g. '30% Profit Boost on any NBA parlay'"},
        "promoType": {"type": "string", "enum": _PROMO_INVENTORY_TYPES},
        "boostPct": {"type": "number", "description": "Boost percentage for Profit/Odds Boost, e.g. 30"},
        "bonusAmount": {"type": "number", "description": "Dollar amount of a free bet, bonus, or deposit match"},
        "sport": {"type": "string", "enum": _SPORTS, "description": "Use 'Other' if the sport isn't in the list, and put the real name in sportOther"},
        "sportOther": {"type": "string", "description": "Sport name when sport is 'Other'"},
        "market": {"type": "string", "description": "Market/sub-category, e.g. Moneyline, Spread, Total"},
        "minOdds": {"type": "string", "description": "Minimum odds requirement, American (e.g. -200) or decimal (e.g. 1.50), as written"},
        "maxStake": {"type": "number", "description": "Max stake the promo applies to, in dollars"},
        "expiration": {"type": "string", "description": "Expiry as ISO date (YYYY-MM-DD) or datetime if shown"},
        "notes": {"type": "string", "description": "Restrictions / fine print, summarized concisely"},
    },
    "additionalProperties": False,
}

_PROMO_INVENTORY_INSTRUCTION = (
    "This image is a screenshot of a sportsbook promotion (e.g. from FanDuel, DraftKings, "
    "BetMGM). Read every visible detail — headline, terms, and fine print — and record the "
    "promotion by calling the record_promotion tool.\n\n"
    "Rules:\n"
    "- Only fill fields you can actually see or confidently infer. Omit anything not present.\n"
    "- Choose the single best promoType from the enum.\n"
    "- boostPct is for Profit Boost / Odds Boost; bonusAmount is the dollar value of a free bet, "
    "bonus, or deposit match.\n"
    "- For minOdds, copy the odds exactly as written (keep American +/- signs or the decimal form).\n"
    "- If the sport isn't in the sport enum, set sport to 'Other' and put the real name in sportOther.\n"
    "- Express any expiry as an ISO date (YYYY-MM-DD).\n"
    "- Put miscellaneous restrictions and fine print into notes, summarized concisely."
)

_PROMO_EXTRACT_INSTRUCTION = (
    "This image is a screenshot of a sportsbook promotion (e.g. from FanDuel, DraftKings, "
    "BetMGM). Read every visible detail — headline, terms, and fine print — and record the "
    "promotion by calling the record_promo_token tool.\n\n"
    "Rules:\n"
    "- Only fill fields you can actually see or confidently infer. Omit anything not present; "
    "do not guess values.\n"
    "- Choose the single best promo_type from the enum.\n"
    "- For min_odds/max_odds, copy the odds exactly as written (keep American +/- signs or the "
    "decimal form).\n"
    "- stake_returned_on_free_bet is almost always false (free/bonus bets pay profit only); set "
    "true only if the terms explicitly say the stake is returned.\n"
    "- For SGP/parlay promos set min_legs if a minimum number of legs is stated.\n"
    "- requires_cash_funds is true if the promo excludes bonus/site credit (cash funds only).\n"
    "- If it's an early-win/early-payout token, capture the trigger in early_win_trigger.\n"
    "- Capture any explicitly excluded bet types (e.g. odds_boosts, bonus_bets, cashed_out, live) "
    "in excluded_bet_types.\n"
    "- Express any expiry as an ISO date (YYYY-MM-DD).\n"
    "- Put miscellaneous restrictions and fine print into notes, summarized concisely."
)

# target -> (tool name, tool description, input schema, instruction).
# 'token' fills the rich Token Library schema; 'promo' fills the simpler
# Promo Inventory schema. Both run the same vision call.
_EXTRACTION_TARGETS = {
    "token": (
        "record_promo_token",
        "Record the details of a sportsbook promotional token read from the screenshot.",
        _PROMO_TOOL_SCHEMA,
        _PROMO_EXTRACT_INSTRUCTION,
    ),
    "promo": (
        "record_promotion",
        "Record the details of a sportsbook promotion read from the screenshot.",
        _PROMO_INVENTORY_TOOL_SCHEMA,
        _PROMO_INVENTORY_INSTRUCTION,
    ),
}

_VALID_IMAGE_MEDIA_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
# Anthropic rejects images whose base64 payload exceeds ~5MB; guard before sending.
_MAX_IMAGE_BYTES = 5 * 1024 * 1024


@app.post("/api/parse-promo")
def parse_promo():
    """Extract a structured promo from a screenshot using Claude vision.

    Body: {image_base64: str (no data: prefix), media_type: str, target?: 'token'|'promo'}
    Returns: {ok: true, token: {...partial fields for the chosen target...}}
    """
    data = request.get_json(silent=True) or {}
    image_b64 = data.get("image_base64") or ""
    media_type = (data.get("media_type") or "").lower()
    target = (data.get("target") or "token").lower()

    if target not in _EXTRACTION_TARGETS:
        return jsonify({"ok": False, "error": f"Unknown target '{target}'. Use 'token' or 'promo'."}), 400
    if not image_b64:
        return jsonify({"ok": False, "error": "No image provided."}), 400
    if media_type not in _VALID_IMAGE_MEDIA_TYPES:
        return jsonify({
            "ok": False,
            "error": f"Unsupported image type '{media_type}'. Use PNG, JPEG, GIF, or WebP.",
        }), 400

    # Rough decoded-size check (base64 inflates ~4/3).
    if (len(image_b64) * 3) // 4 > _MAX_IMAGE_BYTES:
        return jsonify({"ok": False, "error": "Image is too large (max ~5MB). Crop or compress it."}), 400

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return jsonify({
            "ok": False,
            "error": "ANTHROPIC_API_KEY is not set on the server. Set it in the environment that "
                     "runs `npm run server`, then retry.",
        }), 400

    # Lazy import so the rest of the API works even before `anthropic` is installed.
    try:
        import anthropic
    except ImportError:
        return jsonify({
            "ok": False,
            "error": "The 'anthropic' package isn't installed. Run `npm run setup:server` "
                     "(or pip install anthropic) and restart the server.",
        }), 500

    tool_name, tool_desc, tool_schema, instruction = _EXTRACTION_TARGETS[target]

    try:
        client = anthropic.Anthropic(api_key=api_key)
        message = client.messages.create(
            model="claude-opus-4-8",
            max_tokens=2000,
            tools=[{
                "name": tool_name,
                "description": tool_desc,
                "input_schema": tool_schema,
            }],
            tool_choice={"type": "tool", "name": tool_name},
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image", "source": {
                        "type": "base64", "media_type": media_type, "data": image_b64,
                    }},
                    {"type": "text", "text": instruction},
                ],
            }],
        )
    except anthropic.APIError as ex:  # noqa: BLE001 - surface API failures to the UI
        return jsonify({"ok": False, "error": f"Claude API error: {ex}"}), 502
    except Exception as ex:  # noqa: BLE001
        return jsonify({"ok": False, "error": f"Extraction failed: {ex}"}), 500

    token = next(
        (block.input for block in message.content if getattr(block, "type", None) == "tool_use"),
        None,
    )
    if token is None:
        return jsonify({"ok": False, "error": "Claude could not read a promo from this image."}), 422

    return jsonify({"ok": True, "token": token})


@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})


def _demo_event(book, jurisdiction, ml_home, ml_away, spread_odds, total_odds):
    """Build one fake scraped event so the UI is explorable offline."""
    return {
        "url": f"demo://{book.lower()}",
        "ok": True,
        "sportsbook": book,
        "jurisdiction": jurisdiction,
        "event": "LA Lakers @ Boston Celtics",
        "marketCount": 3,
        "selectionCount": 6,
        "odds": [
            {"market_id": "ml", "market_group": "Game Lines", "market_name": "Moneyline",
             "selection_id": "1", "selection_name": "Boston Celtics", "odds": ml_home, "line": None},
            {"market_id": "ml", "market_group": "Game Lines", "market_name": "Moneyline",
             "selection_id": "2", "selection_name": "LA Lakers", "odds": ml_away, "line": None},
            {"market_id": "sp", "market_group": "Game Lines", "market_name": "Spread",
             "selection_id": "3", "selection_name": "Boston Celtics", "odds": spread_odds, "line": -4.5},
            {"market_id": "sp", "market_group": "Game Lines", "market_name": "Spread",
             "selection_id": "4", "selection_name": "LA Lakers", "odds": spread_odds, "line": 4.5},
            {"market_id": "tot", "market_group": "Game Lines", "market_name": "Total Points",
             "selection_id": "5", "selection_name": "Over", "odds": total_odds, "line": 224.5},
            {"market_id": "tot", "market_group": "Game Lines", "market_name": "Total Points",
             "selection_id": "6", "selection_name": "Under", "odds": total_odds, "line": 224.5},
        ],
    }


@app.get("/api/demo")
def demo():
    """Sample data (not live) so the UI can be explored without reachable books."""
    return jsonify({"results": [
        _demo_event("DraftKings", "NJ", 1.74, 2.10, 1.91, 1.91),
        _demo_event("BetMGM", "NJ", 1.69, 2.20, 1.95, 1.87),
        _demo_event("Caesars", "CO", 1.77, 2.05, 1.91, 1.95),
    ]})


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5174, debug=True)
