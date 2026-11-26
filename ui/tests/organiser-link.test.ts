// The organiser link (#151): the key is read from the hash, and the hash is
// stripped without touching the route.
import { describe, expect, it } from "vitest";

import { parseOrganiseKey, stripHash } from "../organiser-link.js";

describe("parseOrganiseKey", () => {
  it("reads the key from the hash", () => {
    expect(parseOrganiseKey("#organise=0123abcd")).toBe("0123abcd");
  });

  it("returns null for no hash, another hash or an empty key", () => {
    expect(parseOrganiseKey("")).toBeNull();
    expect(parseOrganiseKey("#")).toBeNull();
    expect(parseOrganiseKey("#top")).toBeNull();
    expect(parseOrganiseKey("#organise=")).toBeNull();
    expect(parseOrganiseKey("#organise=%20")).toBeNull();
  });

  it("rejects an absurdly long key", () => {
    expect(parseOrganiseKey(`#organise=${"a".repeat(201)}`)).toBeNull();
  });
});

describe("stripHash", () => {
  it("drops the hash and keeps the path and the session", () => {
    expect(stripHash("https://club.example/setlister/?session=jolly-walrus#organise=abc")).toBe(
      "https://club.example/setlister/?session=jolly-walrus",
    );
  });

  it("leaves a URL with no hash alone", () => {
    expect(stripHash("https://club.example/setlister/")).toBe("https://club.example/setlister/");
  });
});
