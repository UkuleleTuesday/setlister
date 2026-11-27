import { describe, expect, it } from "vitest";
import { generateSessionId, isValidSessionId } from "../session-id.js";

describe("generateSessionId", () => {
  it("mints ids that validate", () => {
    for (let i = 0; i < 50; i++) expect(isValidSessionId(generateSessionId())).toBe(true);
  });
});

describe("isValidSessionId", () => {
  it("accepts any word-word, so ids outlive wordlist edits", () => {
    expect(isValidSessionId("zzyzx-qwop")).toBe(true);
  });

  it("rejects anything else", () => {
    for (const id of ["Misty-Banjo", "misty", "misty-banjo-2", "misty_banjo", "misty-banjo-", ""]) {
      expect(isValidSessionId(id), id).toBe(false);
    }
    expect(isValidSessionId(null)).toBe(false);
    expect(isValidSessionId(42)).toBe(false);
  });
});
