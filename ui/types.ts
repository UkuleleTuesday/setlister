// The shapes that cross module boundaries: the session doc's rows, votes and
// metadata, and the songbook entries the API hands back.
//
// Catalogue and scan shapes mirror utrequests/models.py; keep them in step.
// The session doc's field list lives in sync.ts's header, and every key there
// must also be in firestore.rules' hasOnly list (see AGENTS.md).
//
// Types only, no runtime code: they describe what this app WRITES. What comes
// back from Firestore is unvalidated (the rules only check top-level keys), so
// it enters through the parse functions in sync.ts and session-index.ts, never
// as a bare cast.

/** One songbook edition (`EditionInfo`). */
export interface Edition {
  id: string;
  title?: string;
  description?: string;
}

/** One tune in the songbook (`CatalogueEntry`). */
export interface CatalogueEntry {
  id: string;
  display: string;
  title: string;
  artist?: string | null;
  page: number;
}

/** A runner-up match for a scanned row (`Candidate`). */
export interface Candidate {
  entry: CatalogueEntry;
  title_score: number;
  page_delta?: number | null;
}

export type MatchStatus = "confirmed" | "needs_review" | "conflict" | "unmatched";
export type MatchMethod = "high_confidence" | "page_recovery" | "title_only" | "conflict" | "none";

/** Where a row came from; drives its provenance label (view-mode.ts). */
export type RowSource = "scan" | "manual" | "room";

/**
 * A song on the night's lists: a scanned or added `MatchedRow` plus the app's
 * own provenance and gig-state fields. Synced whole-row last-write-wins under
 * `rows.<uid>`.
 */
export interface Row {
  uid: string;
  source?: RowSource;
  addedBy?: string;
  raw_title: string;
  raw_page?: number | null;
  notes?: string | null;
  crossed_out?: boolean;
  status: MatchStatus;
  method: MatchMethod;
  confidence: number;
  match: CatalogueEntry | null;
  alternatives: Candidate[];
  explanation: string;
  removed?: boolean;
  played?: boolean;
  binned?: boolean;
  /** ISO-8601 UTC, set with `played` (see gig-state.ts). */
  playedAt?: string;
  /** ISO-8601 UTC, set with `binned`. */
  binnedAt?: string;
}

/** `{ [rowUid]: { [clientId]: true } }`, see votes.ts. */
export type Votes = Record<string, Record<string, true>>;

/** What main.ts holds and renders: the two lists in order. */
export interface ListState {
  upNext: Row[];
  requests: Row[];
  edition: Edition | null;
  votes: Votes;
}

/** The synced part of the session doc, in its stored shape. */
export interface SyncFields {
  rows: Record<string, Row>;
  upNextOrder: string[];
  requestsOrder: string[];
  edition: Edition | null;
  votes: Votes;
}

/** Session metadata: on the doc, but outside the synced list state. */
export interface SessionMeta {
  createdBy: string;
  listed: boolean;
  /** true = forced open, false = forced closed, null = auto (request-window.ts). */
  requestsOpen: boolean | null;
  requestsOpensAt: Date | null;
  requestsClosesAt: Date | null;
  /** No `listed` field at all: predates visibility (see sync.ts readMeta). */
  legacy: boolean;
}
