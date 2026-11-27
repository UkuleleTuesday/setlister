import { afterEach, describe, expect, it, vi } from "vitest";
import { planScan, requestParse, reviewNote, scanResultMessage } from "../scan.js";
import type { Row } from "../types.js";
import { row, song } from "./fixtures.js";

const jolene = song({ id: "jolene", title: "Jolene", page: 6 });
const africa = song({ id: "africa", title: "Africa", page: 2 });
const hey = song({ id: "hey-jude", title: "Hey Jude", page: 30 });

const scanned = (uid: string, match: typeof jolene | null, status: Row["status"]) =>
  row({ uid, match, status, raw_title: match?.title ?? "scribble" });

describe("planScan", () => {
  it("sends confident new rows straight in and the rest to review", () => {
    const plan = planScan(
      [scanned("a", jolene, "confirmed"), scanned("b", africa, "needs_review")],
      [],
      [],
    );
    expect(plan.fresh.map((r) => r.uid)).toEqual(["a"]);
    expect(plan.flagged.map((r) => r.uid)).toEqual(["b"]);
    expect(plan.skipped).toBe(0);
  });

  it("skips confident rows already listed, or repeated on the board", () => {
    const listed = scanned("x", jolene, "confirmed");
    const plan = planScan(
      [
        scanned("a", jolene, "confirmed"),
        scanned("b", hey, "confirmed"),
        scanned("c", hey, "confirmed"),
      ],
      [],
      [listed],
    );
    expect(plan.fresh.map((r) => r.uid)).toEqual(["b"]);
    expect(plan.skipped).toBe(2);
  });

  it("pre-removes flagged duplicates, counting this scan's own fresh rows", () => {
    const plan = planScan(
      [
        scanned("a", hey, "confirmed"),
        scanned("b", hey, "conflict"),
        scanned("c", africa, "conflict"),
      ],
      [],
      [],
    );
    expect(plan.flagged.find((r) => r.uid === "b")?.removed).toBe(true);
    expect(plan.flagged.find((r) => r.uid === "c")?.removed).toBeFalsy();
  });

  it("sends crossed-out confirmed rows straight in, flag kept", () => {
    const crossed = row({ uid: "a", match: jolene, status: "confirmed", crossed_out: true });
    const plan = planScan([crossed], [], []);
    expect(plan.fresh).toEqual([crossed]);
    expect(plan.flagged).toEqual([]);
  });

  it("leaves unmatched flagged rows alone: nothing to compare", () => {
    const plan = planScan([scanned("a", null, "unmatched")], [], []);
    expect(plan.flagged[0].removed).toBeFalsy();
  });
});

describe("requestParse", () => {
  const options = {
    edition: "uke-9",
    model: "",
    disableThinking: false,
    sendCatalogue: true,
    maxImageEdge: 1600,
  };
  const failWith = (status: number, body: unknown) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(body), { status })),
    );
  const parse = () => requestParse("", new Blob(["x"]), options, new AbortController().signal);

  afterEach(() => vi.unstubAllGlobals());

  it("throws the server's detail as the message", async () => {
    failWith(422, { detail: "That photo is too blurry." });
    await expect(parse()).rejects.toThrow("That photo is too blurry.");
  });

  it("falls back to the status when the server gives no detail", async () => {
    failWith(502, "not json");
    await expect(parse()).rejects.toThrow("Server error (502)");
  });
});

describe("scanResultMessage", () => {
  it("says what was added, and what was skipped", () => {
    expect(scanResultMessage(3, 0)).toBe("Added 3 from the board");
    expect(scanResultMessage(3, 2)).toBe("Added 3 from the board · skipped 2 already listed");
  });

  it("explains an empty outcome instead of staying silent", () => {
    expect(scanResultMessage(0, 2)).toBe("Nothing new. Everything on the board is already listed.");
    expect(scanResultMessage(0, 0)).toBe(
      "Couldn't read any songs off that photo. Try a closer, straighter shot.",
    );
  });
});

describe("reviewNote", () => {
  it("orients first: how many already went in, and how many were listed", () => {
    expect(reviewNote(1, 0)).toBe(
      "1 clear match went straight to Requests. These need a look first.",
    );
    expect(reviewNote(4, 2)).toBe(
      "4 clear matches went straight to Requests (2 already listed). These need a look first.",
    );
    expect(reviewNote(0, 1)).toBe("1 from the board was already listed. These need a look first.");
    expect(reviewNote(0, 0)).toBe(
      "Fix any misreads, drop what you don't want, then add them to Requests.",
    );
  });
});
