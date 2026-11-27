// One session link for everyone (#152): the view follows organiser status, and
// old `?mode=` links still open their session.
import { describe, expect, it } from "vitest";

import { buildSessionUrl, sourceLabel, withoutModeParam } from "../view-mode.js";

describe("buildSessionUrl", () => {
  it("drops an old mode param from the sharer's URL", () => {
    expect(
      buildSessionUrl(
        "https://club.example/setlister/?session=old-id&mode=request",
        "jolly-walrus",
      ),
    ).toBe("https://club.example/setlister/?session=jolly-walrus");
  });

  it("preserves the page's subpath and unrelated params", () => {
    const url = new URL(buildSessionUrl("https://club.example/setlister/?utm=x", "jolly-walrus"));
    expect(url.pathname).toBe("/setlister/");
    expect(url.searchParams.get("utm")).toBe("x");
    expect(url.searchParams.get("session")).toBe("jolly-walrus");
  });
});

describe("withoutModeParam", () => {
  it("strips mode=full and mode=request, keeping the session", () => {
    for (const mode of ["full", "request"]) {
      expect(withoutModeParam(`https://club.example/setlister/?session=a-b&mode=${mode}`)).toBe(
        "https://club.example/setlister/?session=a-b",
      );
    }
  });

  it("leaves a URL with no mode alone", () => {
    expect(withoutModeParam("https://club.example/setlister/?session=a-b")).toBeNull();
  });
});

describe("sourceLabel", () => {
  it("names each source, so a new one can't read as the whiteboard", () => {
    expect(sourceLabel("manual")).toBe("added manually");
    expect(sourceLabel("room")).toBe("from the room");
    expect(sourceLabel("scan")).toBe("from the whiteboard");
    expect(sourceLabel(undefined)).toBe("from the whiteboard");
  });
});
