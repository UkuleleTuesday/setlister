import { describe, expect, it } from "vitest";
import { catalogueEmptyMessage, tonightTagLabel } from "../songbook.js";

describe("catalogueEmptyMessage", () => {
  it("says the book is still loading, or failed, before blaming the query", () => {
    expect(catalogueEmptyMessage("loading", "jolene")).toBe("Loading the songbook…");
    expect(catalogueEmptyMessage("error", "jolene")).toBe(
      "Couldn't load the songbook. Check your connection",
    );
  });

  it("names the query on a genuine no-match, trimmed", () => {
    expect(catalogueEmptyMessage("ready", "  zzz ")).toBe("No matches for “zzz”");
  });

  it("calls out an empty book when nothing was searched", () => {
    expect(catalogueEmptyMessage("ready", "  ")).toBe("This songbook has no tunes in it yet");
  });
});

describe("tonightTagLabel", () => {
  it("tags each kind of copy on the night", () => {
    expect(tonightTagLabel("played")).toBe("played");
    expect(tonightTagLabel("upnext")).toBe("up next");
    expect(tonightTagLabel("requests")).toBe("requested");
  });
});
