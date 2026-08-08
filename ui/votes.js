// Upvotes on requests (#83).
//
// Upvote only, deliberately: on a small club's song requests a downvote reads
// as a vote against the person who asked, and it doubles the UI for a signal
// nobody wanted.
//
// The shape is `{ [rowUid]: { [clientId]: true } }`, living in its own
// top-level field on the session doc rather than on the row. That is not
// tidiness — `diff()` in sync.js replaces `rows.<uid>` wholesale on any change,
// so votes stored on a row would clobber each other in exactly the moment this
// feature exists for (the room all voting at once). As its own map it is
// written with nested field paths, which Firestore merges per key, and a row
// edit can never carry votes away with it. ui/tests/rules.test.js pins that
// behaviour down against the emulator.
//
// One vote per person is keyed on presence's client id, the only opaque stable
// id the app has. It is honour-system, like room mode's brakes: private
// browsing gets a fresh id per load, and one person on two phones votes twice.
// Cheap to shrug at, since the cost of a miscount is a song played slightly out
// of order.
//
// Pure module, no DOM: exported for ui/tests (the dupes.js precedent).

/** The map for one row, or an empty object — callers never see undefined. */
function rowVotes(votes, uid) {
  const entry = votes && typeof votes === "object" ? votes[uid] : null;
  return entry && typeof entry === "object" ? entry : {};
}

/** How many people want this song. */
export function voteCount(votes, uid) {
  return Object.keys(rowVotes(votes, uid)).length;
}

export function hasVoted(votes, uid, clientId) {
  return rowVotes(votes, uid)[clientId] === true;
}

// Add or remove this client's vote, returning a NEW map — the caller assigns it
// so the change flows through the usual render/persist path. Copying rather
// than mutating also keeps sync.js's diff honest: it compares against the last
// server state, which must not be edited underneath it.
export function toggleVote(votes, uid, clientId) {
  const next = { ...(votes && typeof votes === "object" ? votes : {}) };
  const row = { ...rowVotes(votes, uid) };
  if (row[clientId] === true) delete row[clientId];
  else row[clientId] = true;
  // Drop the row's key entirely once its last vote goes, so an untouched
  // session doesn't accumulate empty objects for every song ever un-voted.
  if (Object.keys(row).length) next[uid] = row;
  else delete next[uid];
  return next;
}

// A row's asker always counts as one, which is what keeps the two ways of
// requesting on equal footing. Someone using the app can add a song and then
// thumb it up — two taps — while whoever wrote on the whiteboard isn't in the
// app to do either, so without this the pool quietly sorts app requests above
// board ones. Seeding the vote also spends the requester's own tap, so adding
// then upvoting stops being a free extra.
//
// Scanned rows use this reserved voter instead of a client id: one photo makes
// twenty rows and the person holding the camera didn't ask for any of them.
// Nobody's thumb lights up for it and no tap can take it away. Safe as a key
// because client ids are UUIDs or `c-<n>-<n>`, never this.
export const ASKER = "asker";

/** Add `voter`'s vote to a brand-new row, leaving an existing one alone. */
export function seedAsker(votes, uid, voter) {
  if (hasVoted(votes, uid, voter)) return votes;
  return toggleVote(votes, uid, voter);
}

// Most-wanted first, for rendering only — `requestsOrder` stays arrival order.
// Sorting the real array would rewrite that order array on every vote, and it
// is whole-array last-writer-wins, so vote churn would fight every concurrent
// edit in the room.
//
// The sort is stable, which is what makes ties keep arrival order: two songs on
// three votes each stay in the order they were asked for, rather than shuffling
// under the MC's thumb every time an unrelated row is voted.
export function sortForDisplay(rows, votes) {
  return [...rows].sort((a, b) => voteCount(votes, b.uid) - voteCount(votes, a.uid));
}
