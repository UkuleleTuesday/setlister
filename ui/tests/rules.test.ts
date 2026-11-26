// Executable coverage for firestore.rules.
//
// These rules ARE the app's access-control layer — the browser writes Firestore
// directly, there is no backend to fall back on — so this is the one file in
// the repo where a silent regression is a security bug rather than a broken
// screen. Run it against the emulator:
//
//   npm run test:emulator          (from ui/)
//
// A bare `npm test` will fail these with a connection error, which is the
// intended outcome: skipping the security suite must never look like passing.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  type Firestore,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  collection,
  setDoc,
  updateDoc,
  deleteField,
  arrayUnion,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const RULES = fileURLToPath(new URL("../../firestore.rules", import.meta.url));

let testEnv: RulesTestEnvironment;
let db: Firestore;

// The test contexts are typed as the compat SDK, but the modular functions
// used throughout accept them at runtime (the library's own recommended use).
const modular = (compat: unknown) => compat as Firestore;

// Test docs are deliberately loose: many cases ARE the malformed shapes.
type Doc = Record<string, unknown>;

const NOW = Timestamp.fromMillis(1_770_000_000_000); // fixed, well in the past

const ORGANISER = "org";
const CURRENT_KEY = "0123456789abcdef0123456789abcdef";

// A minimal valid session doc. Spread and override to build the failing cases,
// so each test states only what it is actually testing.
function session(overrides: Doc = {}): Doc {
  return {
    v: 1,
    rows: {},
    upNextOrder: [],
    requestsOrder: [],
    edition: null,
    // Legacy field: current clients never write a name, but docs carrying one
    // must keep validating (see isValidSession).
    name: "Tuesday 4 August 2026",
    createdBy: "Alex",
    listed: true,
    requestsOpen: true,
    votes: {},
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function indexEntry(overrides: Doc = {}): Doc {
  return { v: 1, createdBy: "Alex", createdAt: NOW, ...overrides };
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-setlister",
    firestore: { rules: readFileSync(RULES, "utf8"), host: "127.0.0.1", port: 8081 },
  });
  // An organiser's phone (#150): the row seeded below makes it one.
  db = modular(testEnv.authenticatedContext(ORGANISER).firestore());
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await seed(async (adminDb) => {
    await setDoc(doc(adminDb, "clubConfig", "organiserKey"), { key: CURRENT_KEY });
    await setDoc(doc(adminDb, "organisers", ORGANISER), {
      name: "Org",
      createdAt: NOW,
      key: CURRENT_KEY,
    });
  });
});

// Bypasses rules — for seeding the "already exists" state an update test needs.
function seed(fn: (adminDb: Firestore) => Promise<unknown>) {
  return testEnv.withSecurityRulesDisabled(async (ctx) => {
    await fn(modular(ctx.firestore()));
  });
}

describe("sessions/{id}", () => {
  it("accepts a session with no expiresAt (the current shape)", async () => {
    await assertSucceeds(setDoc(doc(db, "sessions", "misty-banjo"), session()));
  });

  it("still accepts a legacy doc carrying expiresAt", async () => {
    // A browser running a cached pre-#77 bundle keeps writing this field. CI
    // deploys rules and UI in parallel, so both shapes must validate at once.
    await assertSucceeds(setDoc(doc(db, "sessions", "misty-banjo"), session({ expiresAt: NOW })));
  });

  it("lets a legacy doc drop expiresAt on update", async () => {
    await seed((adminDb) =>
      setDoc(doc(adminDb, "sessions", "misty-banjo"), session({ expiresAt: NOW })),
    );
    await assertSucceeds(
      updateDoc(doc(db, "sessions", "misty-banjo"), { expiresAt: deleteField() }),
    );
  });

  it("accepts a legacy doc with no name/createdBy/listed/requestsOpen/window fields at all", async () => {
    const legacy = session();
    delete legacy.name;
    delete legacy.createdBy;
    delete legacy.listed;
    delete legacy.requestsOpen;
    delete legacy.requestsOpensAt;
    delete legacy.requestsClosesAt;
    await assertSucceeds(setDoc(doc(db, "sessions", "misty-banjo"), legacy));
  });

  it("rejects an unknown field", async () => {
    await assertFails(setDoc(doc(db, "sessions", "misty-banjo"), session({ sneaky: true })));
  });

  it("rejects an over-long name", async () => {
    await assertFails(
      setDoc(doc(db, "sessions", "misty-banjo"), session({ name: "x".repeat(81) })),
    );
  });

  it("rejects an over-long createdBy", async () => {
    await assertFails(
      setDoc(doc(db, "sessions", "misty-banjo"), session({ createdBy: "x".repeat(61) })),
    );
  });

  it("rejects a non-boolean listed", async () => {
    await assertFails(setDoc(doc(db, "sessions", "misty-banjo"), session({ listed: "yes" })));
  });

  it("accepts requestsOpen either way", async () => {
    for (const requestsOpen of [true, false]) {
      await assertSucceeds(setDoc(doc(db, "sessions", "misty-banjo"), session({ requestsOpen })));
    }
  });

  it("rejects a non-boolean requestsOpen", async () => {
    await assertFails(
      setDoc(doc(db, "sessions", "misty-banjo"), session({ requestsOpen: "closed" })),
    );
  });

  it("accepts requestsOpensAt/requestsClosesAt as timestamps, and a doc with neither", async () => {
    const ref = doc(db, "sessions", "misty-banjo");
    await assertSucceeds(setDoc(ref, session({ requestsOpensAt: NOW, requestsClosesAt: NOW })));
    const noWindow = session();
    delete noWindow.requestsOpensAt;
    delete noWindow.requestsClosesAt;
    await assertSucceeds(setDoc(ref, noWindow));
  });

  it("rejects a non-timestamp requestsOpensAt or requestsClosesAt", async () => {
    await assertFails(
      setDoc(doc(db, "sessions", "misty-banjo"), session({ requestsOpensAt: "soon" })),
    );
    await assertFails(
      setDoc(doc(db, "sessions", "misty-banjo"), session({ requestsClosesAt: "late" })),
    );
  });

  it("accepts a votes map, and a doc with no votes at all", async () => {
    const ref = doc(db, "sessions", "misty-banjo");
    await assertSucceeds(setDoc(ref, session({ votes: { "row-1": { "client-1": true } } })));
    const legacy = session();
    delete legacy.votes;
    await assertSucceeds(setDoc(ref, legacy));
  });

  it("rejects a non-map votes", async () => {
    await assertFails(setDoc(doc(db, "sessions", "misty-banjo"), session({ votes: 3 })));
  });

  // The whole reason votes live in their own top-level map instead of on the
  // row: nested field paths merge per key, so the room all voting at once
  // converges instead of last-writer-wins. Both path segments are UUIDs with
  // hyphens, which is the part worth proving rather than assuming.
  it("merges concurrent votes written as nested field paths", async () => {
    const ref = doc(db, "sessions", "misty-banjo");
    const row = "c028d0b7-0206-48a6-bd90-e9cf7cd8afc6";
    const a = "9f1c2d3e-aaaa-4bbb-8ccc-111111111111";
    const b = "7e2b1a0f-dddd-4eee-9fff-222222222222";
    const base = session();
    delete base.votes;
    await setDoc(ref, base);

    await assertSucceeds(updateDoc(ref, { [`votes.${row}.${a}`]: true }));
    await assertSucceeds(updateDoc(ref, { [`votes.${row}.${b}`]: true }));
    expect((await getDoc(ref)).data()!.votes[row]).toEqual({ [a]: true, [b]: true });

    // Un-voting takes out one leaf and leaves the other standing.
    await assertSucceeds(updateDoc(ref, { [`votes.${row}.${a}`]: deleteField() }));
    expect((await getDoc(ref)).data()!.votes[row]).toEqual({ [b]: true });

    // And a whole-row write can't take votes with it.
    await assertSucceeds(updateDoc(ref, { [`rows.${row}`]: { uid: row } }));
    expect((await getDoc(ref)).data()!.votes[row]).toEqual({ [b]: true });
  });

  // Row contents are an unvalidated map, so gig-state.ts's timestamps need no
  // hasOnly entry — pinned here so a future row-schema rule can't quietly
  // break "mark played" for a bundle that already writes them.
  it("accepts a row carrying played/binned times", async () => {
    const ref = doc(db, "sessions", "misty-banjo");
    await setDoc(ref, session());
    await assertSucceeds(
      updateDoc(ref, {
        "rows.r1": { uid: "r1", played: true, playedAt: "2026-10-21T20:42:11.000Z" },
        "rows.r2": { uid: "r2", binned: true, binnedAt: "2026-10-21T20:45:00.000Z" },
      }),
    );
    expect((await getDoc(ref)).data()!.rows.r1.playedAt).toBe("2026-10-21T20:42:11.000Z");
  });

  it("rejects a malformed id", async () => {
    for (const id of ["mistybanjo", "Misty-Banjo", "misty-banjo-2"]) {
      await assertFails(setDoc(doc(db, "sessions", id), session()));
    }
  });

  it("never allows a delete — history is kept forever", async () => {
    await seed((adminDb) => setDoc(doc(adminDb, "sessions", "misty-banjo"), session()));
    await assertFails(deleteDoc(doc(db, "sessions", "misty-banjo")));
  });

  it("is publicly readable", async () => {
    await seed((adminDb) => setDoc(doc(adminDb, "sessions", "misty-banjo"), session()));
    await assertSucceeds(getDoc(doc(db, "sessions", "misty-banjo")));
  });
});

describe("sessionIndex/{id}", () => {
  it("accepts a well-formed listing row", async () => {
    await assertSucceeds(setDoc(doc(db, "sessionIndex", "misty-banjo"), indexEntry()));
  });

  it("is listable — this is what the home screen does", async () => {
    await seed((adminDb) => setDoc(doc(adminDb, "sessionIndex", "misty-banjo"), indexEntry()));
    const snap = await assertSucceeds(getDocs(collection(db, "sessionIndex")));
    expect(snap.size).toBe(1);
  });

  it("rejects a malformed id", async () => {
    for (const id of ["mistybanjo", "Misty-Banjo", "misty-banjo-2"]) {
      await assertFails(setDoc(doc(db, "sessionIndex", id), indexEntry()));
    }
  });

  it("rejects an unknown field", async () => {
    await assertFails(setDoc(doc(db, "sessionIndex", "misty-banjo"), indexEntry({ rows: {} })));
  });

  it("rejects a name — rows have no names any more, the date is the identity", async () => {
    await assertFails(
      setDoc(doc(db, "sessionIndex", "misty-banjo"), indexEntry({ name: "Open mic night" })),
    );
  });

  it("accepts a future createdAt inside the planning window", async () => {
    // A session can be created ahead of its night (prepping next Tuesday's
    // set); these are real wall-clock offsets, since request.time is the
    // emulator's own clock. One id per case — a second write to the same id
    // would be an update, where createdAt is immutable.
    for (const [days, id] of [
      [7, "misty-banjo"],
      [59, "sunny-kazoo"],
    ] as const) {
      await assertSucceeds(
        setDoc(
          doc(db, "sessionIndex", id),
          indexEntry({ createdAt: Timestamp.fromMillis(Date.now() + days * 86_400_000) }),
        ),
      );
    }
  });

  it("rejects a createdAt more than 60 days out — no pinning yourself to the top for good", async () => {
    await assertFails(
      setDoc(
        doc(db, "sessionIndex", "misty-banjo"),
        indexEntry({ createdAt: Timestamp.fromMillis(Date.now() + 61 * 86_400_000) }),
      ),
    );
  });

  it("allows a same-provenance rewrite, but not rewriting provenance", async () => {
    await seed((adminDb) => setDoc(doc(adminDb, "sessionIndex", "misty-banjo"), indexEntry()));
    // Re-listing set()s over any row a racing client already wrote — that full
    // overwrite with unchanged provenance must stay legal.
    await assertSucceeds(setDoc(doc(db, "sessionIndex", "misty-banjo"), indexEntry()));
    await assertFails(
      updateDoc(doc(db, "sessionIndex", "misty-banjo"), { createdBy: "Someone else" }),
    );
    await assertFails(
      updateDoc(doc(db, "sessionIndex", "misty-banjo"), { createdAt: Timestamp.fromMillis(0) }),
    );
  });

  it("allows a delete — this is how a session gets un-listed", async () => {
    await seed((adminDb) => setDoc(doc(adminDb, "sessionIndex", "misty-banjo"), indexEntry()));
    await assertSucceeds(deleteDoc(doc(db, "sessionIndex", "misty-banjo")));
  });
});

// Who may write a session (#152). The room (unauthenticated, signed in without
// a row, or holding a retired key) may only add one request and toggle votes,
// in the shapes sync.ts writes them; organisers may do anything valid.
describe("session writes: organisers and the room", () => {
  const ID = "misty-banjo";
  const OLD_KEY = "ffffffffffffffffffffffffffffffff";

  const contexts = () => ({
    anonymous: modular(testEnv.unauthenticatedContext().firestore()),
    signedIn: modular(testEnv.authenticatedContext("guest").firestore()),
    retired: modular(testEnv.authenticatedContext("old").firestore()),
  });

  const existing = (uid: string): Doc => ({
    uid,
    source: "scan",
    raw_title: "Jolene",
    removed: false,
    played: false,
    binned: false,
  });

  // What adds.ts builds for a room request.
  const roomRow = (uid: string, overrides: Doc = {}): Doc => ({
    uid,
    source: "room",
    addedBy: "Sam",
    raw_title: "Creep",
    raw_page: 12,
    notes: null,
    crossed_out: false,
    status: "confirmed",
    method: "none",
    confidence: 1,
    match: { title: "Creep", page: 12 },
    alternatives: [],
    explanation: "Added manually",
    removed: false,
    played: false,
    binned: false,
    ...overrides,
  });

  // sync.ts roomRequestUpdates().
  const addRequest = (client: Firestore, uid: string, row: Doc = roomRow(uid)) =>
    updateDoc(doc(client, "sessions", ID), {
      [`rows.${uid}`]: row,
      requestsOrder: arrayUnion(uid),
      [`votes.${uid}.c1`]: true,
      updatedAt: serverTimestamp(),
    });

  // sync.ts roomVoteUpdates().
  const vote = (client: Firestore, uid: string, on: boolean) =>
    updateDoc(doc(client, "sessions", ID), {
      [`votes.${uid}.c1`]: on ? true : deleteField(),
      updatedAt: serverTimestamp(),
    });

  const write = (client: Firestore, updates: Doc) =>
    updateDoc(doc(client, "sessions", ID), { ...updates, updatedAt: serverTimestamp() });

  beforeEach(() =>
    seed(async (adminDb) => {
      await setDoc(doc(adminDb, "organisers", "old"), { name: "Ex", createdAt: NOW, key: OLD_KEY });
      await setDoc(
        doc(adminDb, "sessions", ID),
        session({
          rows: { r1: existing("r1"), r2: existing("r2") },
          requestsOrder: ["r1", "r2"],
          votes: { r1: { asker: true } },
        }),
      );
    }),
  );

  it("lets the room add one request with its vote, and toggle a vote", async () => {
    for (const [name, client] of Object.entries(contexts())) {
      const uid = `new-${name}`;
      await assertSucceeds(addRequest(client, uid));
      await assertSucceeds(vote(client, "r2", true));
      await assertSucceeds(vote(client, "r2", false));
    }
  });

  it("lets the room add to a legacy session with no votes field", async () => {
    const legacy = session({ expiresAt: NOW });
    delete legacy.votes;
    delete legacy.listed;
    await seed((adminDb) => setDoc(doc(adminDb, "sessions", ID), legacy));
    const { anonymous } = contexts();
    await assertSucceeds(addRequest(anonymous, "fresh"));
  });

  it("refuses a room request that isn't one plain new row", async () => {
    const { anonymous } = contexts();
    const bad: Doc[] = [
      roomRow("x", { admin: true }),
      roomRow("x", { source: "manual" }),
      roomRow("x", { played: true }),
      roomRow("x", { binned: true }),
      roomRow("x", { removed: true }),
      roomRow("x", { raw_title: 42 }),
      roomRow("x", { raw_title: "x".repeat(201) }),
      roomRow("x", { addedBy: "x".repeat(61) }),
      roomRow("x", { notes: "x".repeat(121) }),
      roomRow("not-x"),
    ];
    for (const row of bad) await assertFails(addRequest(anonymous, "x", row));
    // Two rows at once.
    await assertFails(
      write(anonymous, {
        "rows.a": roomRow("a"),
        "rows.b": roomRow("b"),
        requestsOrder: arrayUnion("a", "b"),
      }),
    );
    // A row with no place in the order.
    await assertFails(write(anonymous, { "rows.a": roomRow("a") }));
  });

  it("refuses every other room write", async () => {
    const { anonymous, signedIn, retired } = contexts();
    const writes: Doc[] = [
      { "rows.r1.played": true },
      { "rows.r1": deleteField() },
      { votes: {} },
      { "votes.r1.c1": true, "votes.r2.c1": true },
      { "votes.r1": deleteField() },
      { "votes.ghost.c1": true },
      { requestsOrder: ["r2", "r1"] },
      { requestsOrder: [] },
      { upNextOrder: ["r1"] },
      { edition: { id: "x" } },
      { listed: false },
      { requestsOpen: false },
      { requestsOpensAt: NOW },
      { requestsClosesAt: NOW },
    ];
    for (const client of [anonymous, signedIn, retired]) {
      for (const updates of writes) await assertFails(write(client, updates));
      await assertFails(
        updateDoc(doc(client, "sessions", ID), { "votes.r2.c1": true, updatedAt: NOW }),
      );
      await assertFails(setDoc(doc(client, "sessions", "other-night"), session()));
      await assertFails(setDoc(doc(client, "sessionIndex", "other-night"), indexEntry()));
      await assertFails(deleteDoc(doc(client, "sessionIndex", ID)));
    }
  });

  it("lets an organiser do all of it", async () => {
    await assertSucceeds(addRequest(db, "org-row"));
    await assertSucceeds(write(db, { "rows.r1.played": true }));
    await assertSucceeds(write(db, { "rows.r2": deleteField() }));
    await assertSucceeds(write(db, { requestsOrder: ["org-row"], upNextOrder: ["r1"] }));
    await assertSucceeds(write(db, { votes: {}, listed: false, requestsOpen: true }));
    await assertSucceeds(setDoc(doc(db, "sessions", "other-night"), session()));
    await assertSucceeds(setDoc(doc(db, "sessionIndex", "other-night"), indexEntry()));
    await assertSucceeds(deleteDoc(doc(db, "sessionIndex", "other-night")));
  });

  it("treats an organiser as the room once the key changes", async () => {
    await seed((adminDb) =>
      setDoc(doc(adminDb, "clubConfig", "organiserKey"), {
        key: "a-brand-new-key-0000000000000000",
      }),
    );
    await assertFails(write(db, { listed: false }));
    await assertSucceeds(addRequest(db, "still-room"));
  });
});

// Organiser registration (#151): writing the key into your own row proves you hold it.
describe("organisers/{uid}", () => {
  const KEY = "0123456789abcdef0123456789abcdef";
  const OLD_KEY = "ffffffffffffffffffffffffffffffff";

  const as = (uid: string) => modular(testEnv.authenticatedContext(uid).firestore());

  const row = (overrides: Doc = {}): Doc => ({
    name: "Alex",
    createdAt: serverTimestamp(),
    key: KEY,
    ...overrides,
  });

  const setKey = (key: string) =>
    seed((adminDb) => setDoc(doc(adminDb, "clubConfig", "organiserKey"), { key }));

  beforeEach(() => setKey(KEY));

  it("lets a phone register its own row with the current key", async () => {
    await assertSucceeds(setDoc(doc(as("alex"), "organisers", "alex"), row()));
  });

  it("rejects a wrong key", async () => {
    await assertFails(setDoc(doc(as("alex"), "organisers", "alex"), row({ key: OLD_KEY })));
  });

  it("rejects writing someone else's row", async () => {
    await assertFails(setDoc(doc(as("alex"), "organisers", "sam"), row()));
  });

  it("rejects an unauthenticated write, even with the right key", async () => {
    await assertFails(setDoc(doc(db, "organisers", "alex"), row()));
  });

  it("rejects extra keys", async () => {
    await assertFails(setDoc(doc(as("alex"), "organisers", "alex"), row({ admin: true })));
  });

  it("rejects a createdAt other than the server's time", async () => {
    await assertFails(setDoc(doc(as("alex"), "organisers", "alex"), row({ createdAt: NOW })));
  });

  it("rejects a missing, non-string or over-long name", async () => {
    const ref = doc(as("alex"), "organisers", "alex");
    const { name: _name, ...noName } = row();
    await assertFails(setDoc(ref, noName));
    await assertFails(setDoc(ref, row({ name: 42 })));
    await assertFails(setDoc(ref, row({ name: "x".repeat(61) })));
    await assertSucceeds(setDoc(ref, row({ name: "x".repeat(60) })));
  });

  it("denies every registration while no key is set", async () => {
    await seed((adminDb) => deleteDoc(doc(adminDb, "clubConfig", "organiserKey")));
    await assertFails(setDoc(doc(as("alex"), "organisers", "alex"), row()));
  });

  it("re-registers after a key change with the new key, never the old one", async () => {
    const ref = doc(as("alex"), "organisers", "alex");
    await assertSucceeds(setDoc(ref, row()));
    await setKey(OLD_KEY.replace(/f/g, "e"));
    await assertFails(setDoc(ref, row()));
    await assertSucceeds(setDoc(ref, row({ key: OLD_KEY.replace(/f/g, "e") })));
  });

  it("lets a phone read its own row, and only its own", async () => {
    await seed((adminDb) => setDoc(doc(adminDb, "organisers", "sam"), row({ createdAt: NOW })));
    await assertSucceeds(setDoc(doc(as("alex"), "organisers", "alex"), row()));
    await assertSucceeds(getDoc(doc(as("alex"), "organisers", "alex")));
    await assertFails(getDoc(doc(as("alex"), "organisers", "sam")));
    await assertFails(getDoc(doc(db, "organisers", "sam")));
    await assertFails(getDocs(collection(as("alex"), "organisers")));
  });

  it("never allows a delete: rows go from the console, and rotating the key is what removes anyone", async () => {
    await assertSucceeds(setDoc(doc(as("alex"), "organisers", "alex"), row()));
    await assertFails(deleteDoc(doc(as("alex"), "organisers", "alex")));
  });
});

describe("clubConfig/{doc}", () => {
  it("is closed to every client, signed in or not", async () => {
    await seed((adminDb) => setDoc(doc(adminDb, "clubConfig", "organiserKey"), { key: "k" }));
    const signedIn = modular(testEnv.authenticatedContext("alex").firestore());
    for (const client of [db, signedIn]) {
      await assertFails(getDoc(doc(client, "clubConfig", "organiserKey")));
      await assertFails(setDoc(doc(client, "clubConfig", "organiserKey"), { key: "mine" }));
    }
  });
});

describe("everything else", () => {
  it("is denied by default", async () => {
    await assertFails(setDoc(doc(db, "whatever", "x"), { a: 1 }));
    await assertFails(getDoc(doc(db, "whatever", "x")));
  });
});
