# /// script
# requires-python = ">=3.12"
# dependencies = ["httpx>=0.28", "google-auth[requests]>=2.0", "openpyxl>=3.1"]
# ///
"""Compare the club's "songs played" tracking sheet against setlister sessions.

The sheet has one tab per night named YYYY/MM/DD; columns A-D are
Page | Song | Artist | Requested By, in play order, with a blank row at the
interval. Sessions are read from production Firestore over the public REST API
(reads are open by design, see firestore.rules), so only the sheet needs auth.

    uv run scripts/compare_played.py --xlsx ~/Downloads/2026\\ Tracking.xlsx
    uv run scripts/compare_played.py               # Sheets API via ADC
    uv run scripts/compare_played.py --since 2026-09-01 --side-by-side

ADC needs the Sheets scope, which plain `gcloud auth application-default login`
doesn't grant; `--xlsx` (File > Download > .xlsx) needs no auth at all.
"""

from __future__ import annotations

import argparse
import itertools
import re
import sys
import unicodedata
from collections import Counter
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import httpx

SHEET_ID = "13_KHJqhhOSZ4Yn0U8wx1MK7FmuOL2rDjR-7SMBjAE0E"  # "2026 Tracking"
FIRESTORE = (
    "https://firestore.googleapis.com/v1/projects/songbook-generator"
    "/databases/(default)/documents"
)
# Nights are labelled by their local date; a late session in UTC could
# otherwise land on the next day.
CLUB_TZ = ZoneInfo("Europe/Dublin")
# Any separator: Excel forbids "/" in tab names, so an .xlsx download renames
# "2026/10/20" tabs.
TAB_RE = re.compile(r"^(\d{4})\D(\d{2})\D(\d{2})$")


# --- Normalisation -----------------------------------------------------------


def norm(title: str) -> str:
    """Comparable key for a song title.

    Parentheticals go because the two sides disagree on them ("Hot Stuff" vs the
    songbook's "Hot Stuff (Single Version)"); nothing in the book is told apart
    only by a parenthetical.
    """
    t = re.sub(r"\([^)]*\)", "", title)
    t = unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]", "", t.lower())


# --- Sheet -------------------------------------------------------------------


@dataclass
class SheetNight:
    songs: list[str]
    break_after: int | None  # index of the interval in `songs`, if marked
    stray: list[str] = field(default_factory=list)  # songs after the list ended


def parse_tab(rows: list[list]) -> SheetNight:
    """Read one night's A-D rows: header, played songs, a blank interval row.

    Rows with only a requester letter are pre-filled placeholders. The list ends
    at the first placeholder/blank after the interval; anything further down is
    reported as stray rather than silently counted.
    """
    songs: list[str] = []
    stray: list[str] = []
    break_after = None
    ended = False
    for row in rows[1:]:
        cells = [str(c).strip() if c is not None else "" for c in row]
        song = cells[1] if len(cells) > 1 else ""
        if not song:
            if not any(cells) and break_after is None and songs:
                break_after = len(songs)
            elif songs:
                ended = ended or break_after is not None
            continue
        (stray if ended else songs).append(song)
    return SheetNight(songs, break_after, stray)


def tab_date(title: str) -> date | None:
    m = TAB_RE.match(title.strip())
    return date(*map(int, m.groups())) if m else None


def load_xlsx(path: str) -> dict[date, list[list]]:
    import openpyxl

    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    out = {}
    for ws in wb.worksheets:
        if d := tab_date(ws.title):
            out[d] = [list(r) for r in ws.iter_rows(max_col=4, values_only=True)]
    return out


def load_sheets_api(sheet_id: str) -> dict[date, list[list]]:
    import google.auth
    from google.auth.transport.requests import AuthorizedSession

    scope = "https://www.googleapis.com/auth/spreadsheets.readonly"
    creds, _ = google.auth.default(scopes=[scope])
    s = AuthorizedSession(creds)
    base = f"https://sheets.googleapis.com/v4/spreadsheets/{sheet_id}"
    meta = s.get(base, params={"fields": "sheets.properties.title"})
    meta.raise_for_status()
    titles = [x["properties"]["title"] for x in meta.json()["sheets"]]
    tabs = {t: d for t in titles if (d := tab_date(t))}
    resp = s.get(
        f"{base}/values:batchGet",
        params=[("ranges", f"'{t}'!A:D") for t in tabs],
    )
    resp.raise_for_status()
    return {
        tabs[t]: vr.get("values", []) for t, vr in zip(tabs, resp.json()["valueRanges"])
    }


# --- Firestore ---------------------------------------------------------------


def decode(value: dict):
    """Firestore REST typed value -> plain Python."""
    kind, v = next(iter(value.items()))
    if kind == "mapValue":
        return {k: decode(x) for k, x in v.get("fields", {}).items()}
    if kind == "arrayValue":
        return [decode(x) for x in v.get("values", [])]
    if kind == "integerValue":
        return int(v)
    if kind == "nullValue":
        return None
    return v


def fetch_sessions(since: date, until: date) -> dict[str, dict]:
    """Sessions created in [since, until], unlisted ones included."""

    def ts(d: date) -> str:
        return datetime.combine(d, datetime.min.time(), CLUB_TZ).isoformat()

    def bound(op: str, d: date) -> dict:
        return {
            "fieldFilter": {
                "field": {"fieldPath": "createdAt"},
                "op": op,
                "value": {"timestampValue": ts(d)},
            }
        }

    query = {
        "structuredQuery": {
            "from": [{"collectionId": "sessions"}],
            "where": {
                "compositeFilter": {
                    "op": "AND",
                    "filters": [
                        bound("GREATER_THAN_OR_EQUAL", since),
                        bound("LESS_THAN", until + timedelta(days=1)),
                    ],
                }
            },
        }
    }
    resp = httpx.post(f"{FIRESTORE}:runQuery", json=query, timeout=60)
    resp.raise_for_status()
    return {
        r["document"]["name"].rsplit("/", 1)[1]: decode({"mapValue": r["document"]})
        for r in resp.json()
        if "document" in r
    }


def session_date(doc: dict) -> date:
    created = datetime.fromisoformat(doc["createdAt"].replace("Z", "+00:00"))
    return created.astimezone(CLUB_TZ).date()


@dataclass
class DbRow:
    title: str
    played: bool
    played_at: str | None
    status: str
    raw: str
    gone: bool  # binned or removed


def db_rows(doc: dict) -> list[DbRow]:
    """Rows in list order (Up next, then Requests)."""
    rows = doc.get("rows", {})
    out = []
    for uid in doc.get("upNextOrder", []) + doc.get("requestsOrder", []):
        r = rows.get(uid)
        if not r:
            continue
        m = r.get("match") or {}
        out.append(
            DbRow(
                title=m.get("title") or r.get("raw_title") or "?",
                played=bool(r.get("played")),
                played_at=r.get("playedAt"),
                status=r.get("status", ""),
                raw=r.get("raw_title") or "",
                gone=bool(r.get("binned") or r.get("removed")),
            )
        )
    return out


# --- Comparison --------------------------------------------------------------


@dataclass
class NightDiff:
    sheet_only: list[str]
    db_only: list[DbRow]
    unticked: list[str]  # in the sheet, on the db's lists but not marked played
    order_same: int
    order_total: int
    played_at: int
    played_count: int


def compare(night: SheetNight, rows: list[DbRow]) -> NightDiff:
    live = [r for r in rows if not r.gone]
    played = [r for r in live if r.played]
    # playedAt is the true play order where it exists; list order otherwise.
    if played and all(r.played_at for r in played):
        played.sort(key=lambda r: r.played_at)
    s = Counter(norm(t) for t in night.songs)
    d = Counter(norm(r.title) for r in played)
    unplayed = {norm(r.title) for r in live if not r.played}

    sheet_only, unticked = [], []
    left = s - d
    for t in night.songs:
        k = norm(t)
        if left[k]:
            left[k] -= 1
            (unticked if k in unplayed else sheet_only).append(t)
    extra = d - s
    db_only = []
    for r in played:
        k = norm(r.title)
        if extra[k]:
            extra[k] -= 1
            db_only.append(r)

    common_s = [norm(t) for t in night.songs if norm(t) in d]
    common_d = [norm(r.title) for r in played if norm(r.title) in s]
    same = sum(a == b for a, b in zip(common_s, common_d))
    return NightDiff(
        sheet_only=sheet_only,
        db_only=db_only,
        unticked=unticked,
        order_same=same,
        order_total=min(len(common_s), len(common_d)),
        played_at=sum(1 for r in played if r.played_at),
        played_count=len(played),
    )


# --- Output ------------------------------------------------------------------


def pick_session(docs: list[tuple[str, dict]]) -> tuple[str, dict]:
    """A date can hold test or duplicate sessions; the real night is the one
    with the most tunes ticked off."""
    return max(docs, key=lambda kv: sum(r.played for r in db_rows(kv[1])))


def print_side_by_side(night: SheetNight, rows: list[DbRow]) -> None:
    left = list(night.songs)
    if night.break_after is not None:
        left.insert(night.break_after, "---- interval ----")
    right = [f"{'B' if r.gone else 'P' if r.played else '.'} {r.title}" for r in rows]
    print("    sheet                                  db (P played, . not, B binned)")
    for a, b in itertools.zip_longest(left, right, fillvalue=""):
        flag = "" if a and b and norm(a) == norm(b[2:]) else "  <>"
        print(f"    {a[:38]:40} {b[:40]:42}{flag}")


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--xlsx", help="downloaded copy of the sheet (no auth needed)")
    p.add_argument("--sheet-id", default=SHEET_ID)
    today = datetime.now(CLUB_TZ).date()
    p.add_argument(
        "--since", type=date.fromisoformat, default=today - timedelta(days=61)
    )
    p.add_argument("--until", type=date.fromisoformat, default=today)
    p.add_argument("--side-by-side", action="store_true")
    a = p.parse_args(argv)

    tabs = load_xlsx(a.xlsx) if a.xlsx else load_sheets_api(a.sheet_id)
    tabs = {d: rows for d, rows in tabs.items() if a.since <= d <= a.until}

    by_date: dict[date, list[tuple[str, dict]]] = {}
    for sid, doc in fetch_sessions(a.since, a.until).items():
        by_date.setdefault(session_date(doc), []).append((sid, doc))

    totals = Counter()
    for d in sorted(set(tabs) | set(by_date)):
        if d not in tabs:
            ids = ", ".join(s for s, _ in by_date[d])
            print(f"\n{d}  db only ({ids}): no sheet tab")
            continue
        if d not in by_date:
            print(f"\n{d}  sheet only: no session")
            continue
        sid, doc = pick_session(by_date[d])
        night, rows = parse_tab(tabs[d]), db_rows(doc)
        diff = compare(night, rows)
        others = [s for s, _ in by_date[d] if s != sid]
        print(
            f"\n{d}  {sid}{f' (also: {", ".join(others)})' if others else ''}"
            f"  sheet {len(night.songs)}, db played {diff.played_count},"
            f" order {diff.order_same}/{diff.order_total},"
            f" playedAt {diff.played_at}/{diff.played_count}"
        )
        for t in diff.sheet_only:
            print(f"    sheet only:      {t}")
        for t in diff.unticked:
            print(f"    sheet, unticked: {t}")
        for r in diff.db_only:
            print(f"    db only:         {r.title}  [{r.status}, read {r.raw!r}]")
        for t in night.stray:
            print(f"    stray sheet row: {t}")
        if a.side_by_side:
            print_side_by_side(night, rows)
        totals.update(
            nights=1,
            sheet=len(night.songs),
            db=diff.played_count,
            diffs=len(diff.sheet_only) + len(diff.unticked) + len(diff.db_only),
        )
    print(
        f"\n{totals['nights']} nights compared: {totals['sheet']} sheet songs,"
        f" {totals['db']} played in db, {totals['diffs']} differences"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
