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
} from "@firebase/rules-unit-testing";
import {
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  collection,
  setDoc,
  updateDoc,
  deleteField,
  Timestamp,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const RULES = fileURLToPath(new URL("../../firestore.rules", import.meta.url));

let testEnv;
let db;

const NOW = Timestamp.fromMillis(1_770_000_000_000); // fixed, well in the past

// A minimal valid session doc. Spread and override to build the failing cases,
// so each test states only what it is actually testing.
function session(overrides = {}) {
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
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function indexEntry(overrides = {}) {
  return { v: 1, createdBy: "Alex", createdAt: NOW, ...overrides };
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-setlister",
    firestore: { rules: readFileSync(RULES, "utf8"), host: "127.0.0.1", port: 8081 },
  });
  // Unauthenticated: the app has no auth at all, so this is the only context
  // that matters.
  db = testEnv.unauthenticatedContext().firestore();
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

// Bypasses rules — for seeding the "already exists" state an update test needs.
function seed(fn) {
  return testEnv.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));
}

describe("sessions/{id}", () => {
  it("accepts a session with no expiresAt (the current shape)", async () => {
    await assertSucceeds(setDoc(doc(db, "sessions", "misty-banjo"), session()));
  });

  it("still accepts a legacy doc carrying expiresAt", async () => {
    // A browser running a cached pre-#77 bundle keeps writing this field. CI
    // deploys rules and UI in parallel, so both shapes must validate at once.
    await assertSucceeds(
      setDoc(doc(db, "sessions", "misty-banjo"), session({ expiresAt: NOW }))
    );
  });

  it("lets a legacy doc drop expiresAt on update", async () => {
    await seed((adminDb) =>
      setDoc(doc(adminDb, "sessions", "misty-banjo"), session({ expiresAt: NOW }))
    );
    await assertSucceeds(
      updateDoc(doc(db, "sessions", "misty-banjo"), { expiresAt: deleteField() })
    );
  });

  it("accepts a legacy doc with no name/createdBy/listed/requestsOpen at all", async () => {
    const legacy = session();
    delete legacy.name;
    delete legacy.createdBy;
    delete legacy.listed;
    delete legacy.requestsOpen;
    await assertSucceeds(setDoc(doc(db, "sessions", "misty-banjo"), legacy));
  });

  it("rejects an unknown field", async () => {
    await assertFails(
      setDoc(doc(db, "sessions", "misty-banjo"), session({ sneaky: true }))
    );
  });

  it("rejects an over-long name", async () => {
    await assertFails(
      setDoc(doc(db, "sessions", "misty-banjo"), session({ name: "x".repeat(81) }))
    );
  });

  it("rejects an over-long createdBy", async () => {
    await assertFails(
      setDoc(doc(db, "sessions", "misty-banjo"), session({ createdBy: "x".repeat(61) }))
    );
  });

  it("rejects a non-boolean listed", async () => {
    await assertFails(
      setDoc(doc(db, "sessions", "misty-banjo"), session({ listed: "yes" }))
    );
  });

  it("accepts requestsOpen either way", async () => {
    for (const requestsOpen of [true, false]) {
      await assertSucceeds(
        setDoc(doc(db, "sessions", "misty-banjo"), session({ requestsOpen }))
      );
    }
  });

  it("rejects a non-boolean requestsOpen", async () => {
    await assertFails(
      setDoc(doc(db, "sessions", "misty-banjo"), session({ requestsOpen: "closed" }))
    );
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
    await seed((adminDb) =>
      setDoc(doc(adminDb, "sessionIndex", "misty-banjo"), indexEntry())
    );
    const snap = await assertSucceeds(getDocs(collection(db, "sessionIndex")));
    expect(snap.size).toBe(1);
  });

  it("rejects a malformed id", async () => {
    for (const id of ["mistybanjo", "Misty-Banjo", "misty-banjo-2"]) {
      await assertFails(setDoc(doc(db, "sessionIndex", id), indexEntry()));
    }
  });

  it("rejects an unknown field", async () => {
    await assertFails(
      setDoc(doc(db, "sessionIndex", "misty-banjo"), indexEntry({ rows: {} }))
    );
  });

  it("rejects a name — rows have no names any more, the date is the identity", async () => {
    await assertFails(
      setDoc(doc(db, "sessionIndex", "misty-banjo"), indexEntry({ name: "Open mic night" }))
    );
  });

  it("accepts a future createdAt inside the planning window", async () => {
    // A session can be created ahead of its night (prepping next Tuesday's
    // set); these are real wall-clock offsets, since request.time is the
    // emulator's own clock. One id per case — a second write to the same id
    // would be an update, where createdAt is immutable.
    for (const [days, id] of [[7, "misty-banjo"], [59, "sunny-kazoo"]]) {
      await assertSucceeds(
        setDoc(
          doc(db, "sessionIndex", id),
          indexEntry({ createdAt: Timestamp.fromMillis(Date.now() + days * 86_400_000) })
        )
      );
    }
  });

  it("rejects a createdAt more than 60 days out — no pinning yourself to the top for good", async () => {
    await assertFails(
      setDoc(
        doc(db, "sessionIndex", "misty-banjo"),
        indexEntry({ createdAt: Timestamp.fromMillis(Date.now() + 61 * 86_400_000) })
      )
    );
  });

  it("allows a same-provenance rewrite, but not rewriting provenance", async () => {
    await seed((adminDb) =>
      setDoc(doc(adminDb, "sessionIndex", "misty-banjo"), indexEntry())
    );
    // Re-listing set()s over any row a racing client already wrote — that full
    // overwrite with unchanged provenance must stay legal.
    await assertSucceeds(setDoc(doc(db, "sessionIndex", "misty-banjo"), indexEntry()));
    await assertFails(
      updateDoc(doc(db, "sessionIndex", "misty-banjo"), { createdBy: "Someone else" })
    );
    await assertFails(
      updateDoc(doc(db, "sessionIndex", "misty-banjo"), { createdAt: Timestamp.fromMillis(0) })
    );
  });

  it("allows a delete — this is how a session gets un-listed", async () => {
    await seed((adminDb) =>
      setDoc(doc(adminDb, "sessionIndex", "misty-banjo"), indexEntry())
    );
    await assertSucceeds(deleteDoc(doc(db, "sessionIndex", "misty-banjo")));
  });
});

describe("everything else", () => {
  it("is denied by default", async () => {
    await assertFails(setDoc(doc(db, "whatever", "x"), { a: 1 }));
    await assertFails(getDoc(doc(db, "whatever", "x")));
  });
});
