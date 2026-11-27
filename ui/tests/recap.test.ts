import { describe, expect, it } from "vitest";
import { movePlayed, playedOrder } from "../recap.js";
import type { Row } from "../types.js";

const row = (uid: string, extra: Partial<Row> = {}): Row =>
  ({ uid, played: false, binned: false, ...extra }) as Row;
const playedAt = (minute: number) => new Date(Date.UTC(2026, 10, 24, 20, minute)).toISOString();
const uids = (rows: Row[]) => rows.map((r) => r.uid);

describe("playedOrder", () => {
  it("orders by the time each tune was ticked, not the running order", () => {
    const rows = [
      row("a", { played: true, playedAt: playedAt(30) }),
      row("b", { played: true, playedAt: playedAt(10) }),
      row("queued"),
      row("c", { played: true, playedAt: playedAt(20) }),
    ];
    expect(uids(playedOrder(rows))).toEqual(["b", "c", "a"]);
  });

  it("falls back to the running order when any time is missing", () => {
    const rows = [
      row("a", { played: true, playedAt: playedAt(30) }),
      row("b", { played: true }),
      row("c", { played: true, playedAt: playedAt(10) }),
    ];
    expect(uids(playedOrder(rows))).toEqual(["a", "b", "c"]);
  });

  it("keeps the running order for tunes ticked in the same instant", () => {
    const rows = [
      row("a", { played: true, playedAt: playedAt(5) }),
      row("b", { played: true, playedAt: playedAt(5) }),
    ];
    expect(uids(playedOrder(rows))).toEqual(["a", "b"]);
  });

  it("leaves out queued and binned tunes, and doesn't reorder the list it's given", () => {
    const rows = [row("q"), row("x", { binned: true }), row("p", { played: true })];
    expect(uids(playedOrder(rows))).toEqual(["p"]);
    expect(uids(rows)).toEqual(["q", "x", "p"]);
  });
});

describe("movePlayed", () => {
  it("swaps the tick times, so the times shown stay real", () => {
    const rows = [
      row("a", { played: true, playedAt: playedAt(10) }),
      row("b", { played: true, playedAt: playedAt(20) }),
    ];
    expect(movePlayed(rows, "b", -1)).toBe(true);
    expect(uids(playedOrder(rows))).toEqual(["b", "a"]);
    expect(rows.find((r) => r.uid === "b")!.playedAt).toBe(playedAt(10));
    expect(rows.find((r) => r.uid === "a")!.playedAt).toBe(playedAt(20));
  });

  it("moves untimed tunes by swapping their running-order slots", () => {
    const rows = [row("a", { played: true }), row("q"), row("b", { played: true })];
    expect(movePlayed(rows, "a", 1)).toBe(true);
    expect(uids(rows)).toEqual(["b", "q", "a"]);
    expect(rows.every((r) => !("playedAt" in r))).toBe(true);
  });

  it("moves tunes ticked in the same instant", () => {
    const rows = [
      row("a", { played: true, playedAt: playedAt(5) }),
      row("b", { played: true, playedAt: playedAt(5) }),
    ];
    movePlayed(rows, "b", -1);
    expect(uids(playedOrder(rows))).toEqual(["b", "a"]);
  });

  it("does nothing past either end, or for an unknown tune", () => {
    const rows = [row("a", { played: true }), row("b", { played: true })];
    expect(movePlayed(rows, "a", -1)).toBe(false);
    expect(movePlayed(rows, "b", 1)).toBe(false);
    expect(movePlayed(rows, "nope", 1)).toBe(false);
    expect(uids(rows)).toEqual(["a", "b"]);
  });
});
