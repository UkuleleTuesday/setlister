// The organiser link (#151): the key is read from the hash, and the hash is
// stripped without touching the route.
import { describe, expect, it } from "vitest";

import {
  TimeoutError,
  describeRegistrationError,
  parseOrganiseInput,
  parseOrganiseKey,
  stripHash,
  withTimeout,
} from "../organiser-link.js";

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

describe("parseOrganiseInput", () => {
  it("takes the key from a pasted link, with or without a session", () => {
    expect(parseOrganiseInput("https://club.example/setlister/#organise=abc12345")).toBe(
      "abc12345",
    );
    expect(
      parseOrganiseInput("  https://club.example/setlister/?session=a-b#organise=abc12345 \n"),
    ).toBe("abc12345");
  });

  it("takes a bare key", () => {
    expect(parseOrganiseInput("0123456789abcdef0123456789abcdef")).toBe(
      "0123456789abcdef0123456789abcdef",
    );
  });

  it("rejects anything else", () => {
    expect(parseOrganiseInput("")).toBeNull();
    expect(parseOrganiseInput("https://club.example/setlister/")).toBeNull();
    expect(parseOrganiseInput("https://club.example/setlister/?session=a-b")).toBeNull();
    expect(parseOrganiseInput("hello there")).toBeNull();
    expect(parseOrganiseInput("short")).toBeNull();
  });
});

describe("withTimeout", () => {
  it("passes a prompt result through", async () => {
    await expect(withTimeout(Promise.resolve(7), 1000)).resolves.toBe(7);
  });

  it("rejects with a TimeoutError when the promise never settles", async () => {
    await expect(withTimeout(new Promise(() => {}), 5)).rejects.toBeInstanceOf(TimeoutError);
  });
});

describe("describeRegistrationError", () => {
  const coded = (code: string, message = `Firebase: Error (${code}).`) =>
    Object.assign(new Error(message), { code });

  it("says to check the connection when offline or timed out", () => {
    for (const err of [
      new TimeoutError(),
      coded("auth/network-request-failed"),
      coded("unavailable"),
    ]) {
      expect(describeRegistrationError(err)).toEqual({
        message: "Couldn’t reach Setlister. Check your signal or wifi, then try again.",
        action: "retry",
      });
    }
  });

  it("asks for a reload when the app was updated under an open tab", () => {
    for (const message of [
      "Failed to load Firebase Auth: Failed to fetch dynamically imported module: http://x/a.js",
      "Importing a module script failed.",
      "error loading dynamically imported module",
    ]) {
      expect(describeRegistrationError(new Error(message)).action).toBe("reload");
    }
  });

  it("blames the setup, not the organiser, when sign-in is off or the key is wrong", () => {
    for (const code of [
      "auth/admin-restricted-operation",
      "auth/operation-not-allowed",
      "auth/invalid-api-key",
      "auth/api-key-not-valid.-please-pass-a-valid-api-key.",
    ]) {
      expect(describeRegistrationError(coded(code)).message).toMatch(/isn’t switched on yet/);
    }
  });

  it("never shows raw Firebase text", () => {
    const { message } = describeRegistrationError(coded("internal", "Firebase: Error (internal)."));
    expect(message).toBe("Something went wrong. Try again, or tap the link again later.");
    expect(describeRegistrationError("weird").message).not.toMatch(/Firebase|weird/);
  });
});
