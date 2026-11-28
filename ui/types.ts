// Catalogue and scan shapes mirror utrequests/models.py; keep them in step.
// Every session doc key must be in firestore.rules' hasOnly list (AGENTS.md).
// These describe what the app writes: Firestore reads are unvalidated, so they
// go through the parsers in sync.ts and session-index.ts, never a bare cast.

/** models.py `EditionInfo`. */
export interface Edition {
  id: string;
  title?: string;
  description?: string;
}

export interface CatalogueEntry {
  id: string;
  display: string;
  title: string;
  artist?: string | null;
  page: number;
}

export interface Candidate {
  entry: CatalogueEntry;
  title_score: number;
  page_delta?: number | null;
}

export type MatchStatus = "confirmed" | "needs_review" | "conflict" | "unmatched";
export type MatchMethod = "high_confidence" | "page_recovery" | "title_only" | "conflict" | "none";

export type RowSource = "scan" | "manual" | "room";

/** models.py `MatchedRow` plus app fields. Synced whole, last write wins. */
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
  /** ISO-8601 UTC, set with `played`. */
  playedAt?: string;
  /** ISO-8601 UTC, set with `binned`. */
  binnedAt?: string;
}

export type RequestsSwitch = "auto" | "open" | "closed";

/** Row uid, then client id. */
export type Votes = Record<string, Record<string, true>>;

export interface ListState {
  upNext: Row[];
  requests: Row[];
  edition: Edition | null;
  votes: Votes;
}

export interface SyncFields {
  rows: Record<string, Row>;
  upNextOrder: string[];
  requestsOrder: string[];
  edition: Edition | null;
  votes: Votes;
}

export interface SessionMeta {
  createdBy: string;
  listed: boolean;
  /** The organisers' note on home's card for this night; "" shows the default. */
  blurb: string;
  /** true = forced open, false = forced closed, null = auto (request-window.ts). */
  requestsOpen: boolean | null;
  requestsOpensAt: Date | null;
  requestsClosesAt: Date | null;
}
