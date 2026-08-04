// Lazy Firebase / Firestore loader.
//
// Firebase is only needed for multiplayer session sharing — local-only use
// must never trigger a Firestore network request. This module wraps the
// dynamic imports in a single async function so Vite code-splits Firebase
// into a separate chunk that is only fetched on first call.
//
// Usage:
//   const { db, fx } = await getFirestore();
//   const ref = fx.doc(db, "sessions", sessionId);

import { firebaseConfig } from "./firebase-config.js";

// Memoize the initialisation promise so repeated calls share a single load.
let _promise = null;

/**
 * Returns `{ db, fx }` where:
 *   - `db`  is the Firestore database instance
 *   - `fx`  is a namespace of Firestore helper functions so callers never
 *           need to import firebase directly:
 *           { doc, collection, getDoc, getDocs, query, orderBy, limit,
 *             onSnapshot, setDoc, updateDoc, deleteDoc, writeBatch,
 *             runTransaction, serverTimestamp, deleteField, Timestamp }
 *
 * On the first call the Firebase SDK chunks are fetched; subsequent calls
 * return the memoized result instantly.
 *
 * Mirrors the `getApiBase()` localhost-detection pattern in app.js for the
 * emulator: when running on localhost / 127.0.0.1 the Firestore emulator on
 * port 8081 is used instead of production (8080 is the Python API).
 */
export async function getFirestore() {
  if (_promise) return _promise;
  _promise = _init().catch((err) => {
    // Reset so a subsequent call can retry after a transient failure.
    _promise = null;
    throw new Error(`Failed to load Firebase: ${err.message}`);
  });
  return _promise;
}

async function _init() {
  const [{ initializeApp, getApps }, firestoreModule] = await Promise.all([
    import("firebase/app"),
    import("firebase/firestore"),
  ]);
  const {
    getFirestore: _getFirestore,
    connectFirestoreEmulator,
    doc,
    collection,
    getDoc,
    getDocs,
    query,
    orderBy,
    limit,
    onSnapshot,
    setDoc,
    updateDoc,
    deleteDoc,
    writeBatch,
    runTransaction,
    serverTimestamp,
    deleteField,
    Timestamp,
  } = firestoreModule;

  // Re-use an existing Firebase app if one was already initialised (e.g.
  // during hot-module replacement in dev).
  const app =
    getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);

  const db = _getFirestore(app);

  // Connect to the local Firestore emulator when developing — mirrors the
  // getApiBase() localhost-detection pattern in app.js.
  if (["localhost", "127.0.0.1"].includes(location.hostname)) {
    connectFirestoreEmulator(db, "127.0.0.1", 8081);
  }

  const fx = {
    doc,
    collection,
    getDoc,
    getDocs,
    query,
    orderBy,
    limit,
    onSnapshot,
    setDoc,
    updateDoc,
    deleteDoc,
    writeBatch,
    runTransaction,
    serverTimestamp,
    deleteField,
    Timestamp,
  };

  return { db, fx };
}
