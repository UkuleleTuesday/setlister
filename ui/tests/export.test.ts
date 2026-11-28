import { describe, expect, it } from "vitest";
import { exportPayload, exportText, exportedRows } from "../export.js";
import { row, song } from "./fixtures.js";

describe("exportedRows", () => {
  it("runs Up next first, and keeps crossed-out rows", () => {
    const a = row({ uid: "a" });
    const b = row({ uid: "b" });
    const c = row({ uid: "c", crossed_out: true });
    const d = row({ uid: "d" });
    expect(exportedRows([a, b], [c, d]).map((r) => r.uid)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("exportText", () => {
  it("lists matched tunes with their page, and flags the unmatched", () => {
    const matched = row({ match: song({ display: "Jolene - Dolly Parton", page: 12 }) });
    const unmatched = row({ match: null, raw_title: "Mystery", raw_page: 40 });
    const bare = row({ match: null, raw_title: "Mystery", raw_page: null });
    expect(exportText([matched, unmatched, bare])).toBe(
      "Jolene - Dolly Parton (p.12)\n?? Mystery (p.40)\n?? Mystery",
    );
  });
});

describe("exportPayload", () => {
  it("keeps the night's record but not the app's own fields", () => {
    const played = row({
      uid: "a",
      source: "manual",
      addedBy: "Alex",
      played: true,
      playedAt: "t",
    });
    const payload = exportPayload({ id: "current" }, "2026-11-25", [played]);
    expect(payload.edition).toEqual({ id: "current" });
    expect(payload.catalogue_generated_at).toBe("2026-11-25");
    expect(payload.rows[0]).toMatchObject({ playedAt: "t" });
    for (const key of ["uid", "source", "addedBy", "removed", "played", "binned"]) {
      expect(payload.rows[0]).not.toHaveProperty(key);
    }
  });
});
