// Home's read-only view of tonight's session doc, for its card. Apart from
// sync.ts on purpose: home never joins the session, pushes or persists.

/* eslint-disable svelte/prefer-svelte-reactivity */

import { getFirestore } from "./firebase.js";
import * as sync from "./sync.js";
import { type TonightSummary, tonightSummary } from "./tonight.js";
import type { SessionMeta } from "./types.js";

class TonightCard {
  /** null until the first snapshot: the card then shows no status or summary. */
  id = $state<string | null>(null);
  meta = $state.raw<SessionMeta | null>(null);
  summary = $state.raw<TonightSummary | null>(null);
  /** Ticked each minute: requests can open or close with no snapshot. */
  now = $state.raw(new Date());
}

export const tonightCard = new TonightCard();

/** Follows `sessions/{id}` until the returned function is called. */
export function followTonight(id: string): () => void {
  let stopped = false;
  let unsubscribe: (() => void) | null = null;
  tonightCard.id = id;
  tonightCard.meta = null;
  tonightCard.summary = null;
  tonightCard.now = new Date();
  const clock = setInterval(() => (tonightCard.now = new Date()), 60_000);

  getFirestore()
    .then(({ db, fx }) => {
      if (stopped) return;
      unsubscribe = fx.onSnapshot(
        fx.doc(db, "sessions", id),
        (snap) => {
          if (!snap.exists()) return;
          const data = snap.data();
          tonightCard.meta = sync.readMeta(data);
          tonightCard.summary = tonightSummary(sync.deserialize(data));
          tonightCard.now = new Date();
        },
        // Offline or denied: the card just says less.
        () => {},
      );
    })
    .catch(() => {});

  return () => {
    stopped = true;
    clearInterval(clock);
    unsubscribe?.();
    if (tonightCard.id === id) {
      tonightCard.id = null;
      tonightCard.meta = null;
      tonightCard.summary = null;
    }
  };
}
