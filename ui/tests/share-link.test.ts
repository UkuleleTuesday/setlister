import { describe, expect, it } from "vitest";
import { buildSessionUrl } from "../share-link.js";

describe("buildSessionUrl", () => {
  it("points the sharer's URL at the session", () => {
    expect(buildSessionUrl("https://club.example/setlister/?session=old-id", "jolly-walrus")).toBe(
      "https://club.example/setlister/?session=jolly-walrus",
    );
  });

  it("preserves the page's subpath and unrelated params", () => {
    const url = new URL(buildSessionUrl("https://club.example/setlister/?utm=x", "jolly-walrus"));
    expect(url.pathname).toBe("/setlister/");
    expect(url.searchParams.get("utm")).toBe("x");
    expect(url.searchParams.get("session")).toBe("jolly-walrus");
  });
});
