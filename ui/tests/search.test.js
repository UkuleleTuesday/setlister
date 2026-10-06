// Songbook search: what the type-ahead and the room's songbook sheet find. The
// decisions under test: any-order accent-free words, a bare number finds the
// page, and a shallow stable ranking (page, title prefix, rest; book order
// within each).
import { describe, expect, it } from "vitest";

import { searchSongs } from "../search.js";

const song = (page, title, artist) => ({
  id: `${title}-${artist}`.toLowerCase().replace(/\W+/g, "-"),
  display: `${title} - ${artist}`,
  title,
  artist,
  page,
});

const book = [
  song(4, "9 to 5", "Dolly Parton"),
  song(5, "Hallelujah", "Leonard Cohen"),
  song(6, "Jolene", "Dolly Parton"),
  song(9, "Let It Be", "The Beatles"),
  song(12, "Sarà perché ti amo", "Ricchi e Poveri"),
  song(42, "Here Comes the Sun", "The Beatles"),
  song(55, "Lean on Me", "Bill Withers"),
];

const titles = (results) => results.map((e) => e.title);

describe("searchSongs", () => {
  it("finds nothing for an empty or blank query", () => {
    expect(searchSongs(book, "")).toEqual([]);
    expect(searchSongs(book, "   ")).toEqual([]);
  });

  it("matches every word across title and artist, in any order", () => {
    expect(titles(searchSongs(book, "beatles sun"))).toEqual(["Here Comes the Sun"]);
    expect(titles(searchSongs(book, "dolly"))).toEqual(["9 to 5", "Jolene"]);
  });

  it("ignores accents and case", () => {
    expect(titles(searchSongs(book, "SARA"))).toEqual(["Sarà perché ti amo"]);
  });

  it("puts titles starting with the query first, book order otherwise", () => {
    // "le" is also inside Hallelujah, Jolene and "The Beatles".
    expect(titles(searchSongs(book, "le"))).toEqual([
      "Let It Be",
      "Lean on Me",
      "Hallelujah",
      "Jolene",
      "Here Comes the Sun",
    ]);
  });

  it("finds a page by its number, ahead of titles containing it", () => {
    expect(titles(searchSongs(book, "42"))).toEqual(["Here Comes the Sun"]);
    expect(titles(searchSongs(book, "5"))).toEqual(["Hallelujah", "9 to 5"]);
  });

  it("returns every match by default and honours a limit", () => {
    expect(searchSongs(book, "a")).toHaveLength(book.length);
    expect(searchSongs(book, "a", { limit: 2 })).toHaveLength(2);
  });
});
