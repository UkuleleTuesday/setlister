import importlib.util
import sys
from datetime import date
from pathlib import Path

_path = Path(__file__).parent.parent / "scripts" / "compare_played.py"
_spec = importlib.util.spec_from_file_location("compare_played", _path)
cp = importlib.util.module_from_spec(_spec)
# dataclasses resolve string annotations through sys.modules.
sys.modules[_spec.name] = cp
_spec.loader.exec_module(cp)


def row(title, played=True, played_at=None, gone=False):
    return cp.DbRow(title, played, played_at, "confirmed", title, gone)


def test_norm_ignores_parentheticals_case_and_accents():
    assert cp.norm("Hot Stuff (Single Version)") == cp.norm("hot stuff")
    assert cp.norm("Sarà Perché Ti Amo") == cp.norm("Sara Perche Ti Amo")


def test_tab_date_accepts_xlsx_renamed_tabs():
    assert cp.tab_date("2026/10/20") == date(2026, 10, 20)
    assert cp.tab_date("2026_10_20") == date(2026, 10, 20)
    assert cp.tab_date("Template") is None


def test_parse_tab_interval_placeholders_and_stray_rows():
    rows = [
        ["Page", "Song", "Artist", "Requested By"],
        ["1", "A", "x", "G"],
        ["2", "B", "x", "A"],
        [],
        ["3", "C", "x", "A"],
        ["", "", "", "A"],
        [None, None, None, None],
        ["4", "Stray", "x"],
    ]
    night = cp.parse_tab(rows)
    assert night.songs == ["A", "B", "C"]
    assert night.break_after == 2
    assert night.stray == ["Stray"]


def test_compare_splits_differences():
    night = cp.SheetNight(["A", "B", "C", "Happy Birthday", "Happy Birthday"], 2)
    rows = [
        row("A"),
        row("C"),
        row("B"),
        row("Happy Birthday"),
        row("Extra"),
        row("C", played=False),
        row("Binned", gone=True),
    ]
    d = cp.compare(night, rows)
    # One of the two birthdays wasn't ticked; C was ticked once, so its
    # unticked duplicate doesn't make it "sheet, unticked".
    assert d.sheet_only == ["Happy Birthday"]
    assert d.unticked == []
    assert [r.title for r in d.db_only] == ["Extra"]
    assert (d.order_same, d.order_total) == (2, 4)


def test_compare_uses_played_at_order_when_complete():
    night = cp.SheetNight(["A", "B"], None)
    rows = [
        row("B", played_at="2026-11-03T20:00Z"),
        row("A", played_at="2026-11-03T19:00Z"),
    ]
    d = cp.compare(night, rows)
    assert (d.order_same, d.order_total, d.played_at) == (2, 2, 2)
