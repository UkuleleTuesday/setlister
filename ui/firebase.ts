// Lazy Firebase loader. Dynamic imports, so Vite splits Firestore and Auth
// into their own chunks, fetched on first call; only organiser phones load
// Auth.
//
// Usage:
//   const { db, fx } = await getFirestore();
//   const ref = fx.doc(db, "sessions", sessionId);

import type { FirebaseApp } from "firebase/app";
import type { Auth } from "firebase/auth";
import type { Firestore } from "firebase/firestore";
import { firebaseConfig } from "./firebase-config.js";

// localhost uses the emulators. A function: this module is imported under node.
const onLocalhost = () => ["localhost", "127.0.0.1"].includes(location.hostname);

let _app: Promise<FirebaseApp> | null = null;

// One app for both SDKs; reuses an existing one (HMR).
function getApp(): Promise<FirebaseApp> {
  _app ??= import("firebase/app").then(({ initializeApp, getApps }) =>
    getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig),
  );
  return _app;
}

/** The Firestore helpers callers use instead of importing firebase directly. */
export type Fx = Awaited<ReturnType<typeof _init>>["fx"];

/** What getFirestore() resolves to. */
export interface FirestoreHandle {
  db: Firestore;
  fx: Fx;
}

// Memoize the initialisation promise so repeated calls share a single load.
let _promise: Promise<FirestoreHandle> | null = null;

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
 * Mirrors the localhost detection of `API_BASE` in api.ts for the
 * emulator: when running on localhost / 127.0.0.1 the Firestore emulator on
 * port 8081 is used instead of production (8080 is the Python API).
 */
export async function getFirestore(): Promise<FirestoreHandle> {
  if (_promise) return _promise;
  _promise = _init().catch((err: Error) => {
    // Reset so a subsequent call can retry after a transient failure.
    _promise = null;
    throw new Error(`Failed to load Firebase: ${err.message}`);
  });
  return _promise;
}

async function _init() {
  const [app, firestoreModule] = await Promise.all([getApp(), import("firebase/firestore")]);
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

  const db = _getFirestore(app);

  // The local Firestore emulator when developing (see getFirestore).
  if (onLocalhost()) {
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

export interface AuthHandle {
  auth: Auth;
  signInAnonymously: typeof import("firebase/auth").signInAnonymously;
}

let _auth: Promise<AuthHandle> | null = null;

/** Resolves once a persisted sign-in is restored, so `currentUser` is final. */
export async function getAuth(): Promise<AuthHandle> {
  if (_auth) return _auth;
  _auth = _initAuth().catch((err: Error) => {
    _auth = null;
    throw new Error(`Failed to load Firebase Auth: ${err.message}`);
  });
  return _auth;
}

async function _initAuth(): Promise<AuthHandle> {
  const [app, { getAuth: _getAuth, connectAuthEmulator, signInAnonymously }] = await Promise.all([
    getApp(),
    import("firebase/auth"),
  ]);
  const auth = _getAuth(app);
  if (onLocalhost() && !auth.emulatorConfig) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  }
  await auth.authStateReady();
  return { auth, signInAnonymously };
}
