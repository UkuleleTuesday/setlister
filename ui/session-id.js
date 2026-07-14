// Human-friendly session ids for shared multiplayer sessions (epic #25).
//
// Sessions live at `sessions/{id}` in Firestore and travel in share URLs
// (`?session=`), so the id has to survive being read aloud across a pub table:
// two lowercase words, dash-separated, e.g. `misty-banjo`. Cardinality is only
// ~10,000 combos, which is plenty for a small ukulele club — collision
// handling at create time is the caller's job (#29 retries with a fresh id
// inside a Firestore transaction).
//
// The shape regex below MUST stay in sync with `firestore.rules`
// (`isValidSession` → `id.matches('^[a-z]+-[a-z]+$')`): the rules are the
// entire access-control layer, so an id this module can mint but the rules
// reject would be unwritable.

// Curated for saying out loud, not just typing: friendly words, easy to spell,
// no ambiguous homophones, and nothing embarrassing when two are paired at
// random. Nouns lean into music/ukulele flavour (banjo, kazoo, strum, ...).
const ADJECTIVES = [
  "mellow", "sunny", "happy", "jolly", "cosy", "breezy", "gentle", "merry",
  "bright", "cheery", "snappy", "jazzy", "funky", "groovy", "bouncy", "lively",
  "plucky", "chirpy", "peppy", "zesty", "mighty", "nifty", "dandy", "snug",
  "comfy", "tidy", "cosmic", "dreamy", "misty", "foggy", "frosty", "silky",
  "velvet", "golden", "silver", "ruby", "amber", "coral", "minty", "lemon",
  "honey", "maple", "cocoa", "mocha", "spicy", "sweet", "salty", "tangy",
  "crispy", "toasty", "warm", "cool", "calm", "quiet", "humble", "noble",
  "royal", "loyal", "brave", "clever", "witty", "quirky", "quaint", "wobbly",
  "giddy", "dizzy", "sleepy", "drowsy", "spry", "eager", "keen", "bold",
  "swift", "nimble", "agile", "sturdy", "hardy", "rugged", "rustic", "folksy",
  "tuneful", "humming", "dancing", "skipping", "hopping", "roaming", "rolling",
  "drifting", "floating", "glowing", "shining", "sparkly", "shiny", "twinkly",
  "dapper", "spiffy", "natty", "sprightly", "chipper", "jaunty",
];

const NOUNS = [
  "banjo", "ukulele", "guitar", "kazoo", "fiddle", "mandolin", "harp", "drum",
  "piano", "flute", "trumpet", "trombone", "cello", "violin", "bugle", "tuba",
  "oboe", "harmonica", "tambourine", "triangle", "cymbal", "bongo", "maraca",
  "whistle", "recorder", "chord", "strum", "melody", "harmony", "rhythm",
  "tempo", "ballad", "chorus", "verse", "refrain", "tune", "anthem", "jingle",
  "lyric", "note", "beat", "riff", "solo", "encore", "medley", "singalong",
  "hymn", "lullaby", "waltz", "polka", "shanty", "jig", "reel", "tango",
  "samba", "calypso", "ragtime", "blues", "swing", "boogie", "stage", "busker",
  "minstrel", "troubadour", "songbird", "robin", "sparrow", "finch", "lark",
  "wren", "cricket", "teapot", "kettle", "biscuit", "crumpet", "scone",
  "muffin", "pancake", "pretzel", "bagel", "cupcake", "pickle", "peanut",
  "acorn", "pebble", "meadow", "pocket", "lantern", "compass", "anchor",
  "sailor", "pirate", "penguin", "otter", "badger", "hedgehog", "walrus",
  "dolphin", "seagull", "seashell",
];

// Same feature-detection posture as `newUid()` in app.js: prefer the crypto
// API, fall back to Math.random only where it's genuinely missing. Ids are
// low-stakes (guessable by design — see firestore.rules), but crypto gives an
// unbiased, uniform spread across the wordlists.
function randomIndex(length) {
  const crypto = globalThis.crypto;
  if (crypto && crypto.getRandomValues) {
    // Rejection-sample so the modulo doesn't bias the tail of the list toward
    // the first `2^32 % length` words.
    const limit = Math.floor(0xffffffff / length) * length;
    const buf = new Uint32Array(1);
    let n;
    do {
      crypto.getRandomValues(buf);
      n = buf[0];
    } while (n >= limit);
    return n % length;
  }
  return Math.floor(Math.random() * length);
}

function pick(list) {
  return list[randomIndex(list.length)];
}

// Matches `firestore.rules` exactly: shape only, no wordlist membership check.
// Remote sessions can outlive edits to the wordlists above, so an id minted by
// an older/newer build must still validate as long as it's `word-word`.
const SESSION_ID_RE = /^[a-z]+-[a-z]+$/;

export function generateSessionId() {
  return `${pick(ADJECTIVES)}-${pick(NOUNS)}`;
}

export function isValidSessionId(s) {
  return typeof s === "string" && SESSION_ID_RE.test(s);
}
