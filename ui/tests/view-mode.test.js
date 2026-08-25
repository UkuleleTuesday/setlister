// Room mode (#86): the pure decision logic behind the room view.
// The decisions under test: `?mode=request` puts a device in room mode and
// makes it sticky; the ONLY way out is an explicit `?mode=full`; a plain or
// mangled link follows whatever the flag says; and shareable URLs always set
// `mode` deliberately — `full` on the full-app link (so it overrides a
// clicker's sticky room flag), `request` on the room link.
import { describe, expect, it } from "vitest";

import { buildSessionUrl, resolveMode, sourceLabel } from "../view-mode.js";

const params = (search) => new URLSearchParams(search);

describe("resolveMode", () => {
  it("enters room mode from a ?mode=request link and makes it sticky", () => {
    expect(resolveMode(params("?session=a-b&mode=request"), null)).toEqual({
      mode: "room",
      store: "room",
    });
  });

  it("leaves room mode only through an explicit ?mode=full link", () => {
    expect(resolveMode(params("?session=a-b&mode=full"), "room")).toEqual({
      mode: "full",
      store: null,
    });
  });

  it("keeps a sticky room device in room mode on a plain link", () => {
    expect(resolveMode(params("?session=a-b"), "room")).toEqual({
      mode: "room",
      store: "room",
    });
  });

  it("defaults to the full view with no param and no flag", () => {
    expect(resolveMode(params("?session=a-b"), null)).toEqual({
      mode: "full",
      store: null,
    });
  });

  it("ignores an unrecognised mode value and follows the flag", () => {
    expect(resolveMode(params("?mode=admin"), null).mode).toBe("full");
    expect(resolveMode(params("?mode=admin"), "room").mode).toBe("room");
  });

  it("ignores garbage in the stored flag", () => {
    expect(resolveMode(params(""), "banana")).toEqual({ mode: "full", store: null });
  });
});

describe("buildSessionUrl", () => {
  it("sets mode=full on the full-app link, overriding the sharer's own mode", () => {
    const url = buildSessionUrl(
      "https://club.example/setlister/?session=old-id&mode=request",
      "jolly-walrus"
    );
    expect(url).toBe("https://club.example/setlister/?session=jolly-walrus&mode=full");
  });

  it("sets mode=request on the room link", () => {
    const url = new URL(
      buildSessionUrl("https://club.example/setlister/", "jolly-walrus", { room: true })
    );
    expect(url.searchParams.get("session")).toBe("jolly-walrus");
    expect(url.searchParams.get("mode")).toBe("request");
  });

  it("full-app link pulls a sticky room phone into the full app", () => {
    const url = new URL(buildSessionUrl("https://club.example/setlister/", "jolly-walrus"));
    expect(resolveMode(url.searchParams, "room")).toEqual({ mode: "full", store: null });
  });

  it("preserves the page's subpath and unrelated params", () => {
    const url = new URL(
      buildSessionUrl("https://club.example/setlister/?utm=x", "jolly-walrus")
    );
    expect(url.pathname).toBe("/setlister/");
    expect(url.searchParams.get("utm")).toBe("x");
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
