<!--
  The whiteboard scan, start to finish: the photo and its scanning overlay
  (#add), then the review sheet for the rows that need a look (#review).

  The flow is ONE explicit phase rather than a handful of flags, so an
  impossible mix (reviewing while scanning, an overlay over nothing) can't be
  represented:
    idle      nothing in flight; maybe a result line or an error showing
    scanning  the photo is up and the overlay sweeps; Cancel or the timeout
              aborts
    reviewing the flagged rows wait in #review; #add steps aside
    failed    the scan errored: the photo stays up beside the error
  The error box doubles as the session view's error line (main.ts's
  showSessionError), so it lives outside the phase.

  What a scan DOES to the night (the API call, the catalogue it brings back,
  the rows that go straight in) is main.ts's `scan`; what review keeps is
  main.ts's `onConfirm`. This component is the screens and their states.

  The ids and classes are load-bearing: style.css and the e2e suite select on
  them. No scoped <style> here; the global stylesheet stays global.
-->
<script lang="ts">
  import { tick } from "svelte";
  import Icon from "./Icon.svelte";
  import ReviewRow from "./ReviewRow.svelte";
  import { findDuplicate, rowKey } from "./dupes.js";
  import { reviewNote, scanResultMessage } from "./scan.js";
  import type { CatalogueStatus } from "./songbook.js";
  import type { CatalogueEntry, Row } from "./types.js";

  /** What a finished scan left for review (main.ts has added the rest). */
  export interface ScanOutcome {
    flagged: Row[];
    autoAdded: number;
    autoSkipped: number;
  }

  /** The night as review rows need it: duplicates, the picker, suggestions. */
  export interface ScanContext {
    upNext: Row[];
    requests: Row[];
    catalogue: CatalogueEntry[];
    catalogueStatus: CatalogueStatus;
    showSuggestions: boolean;
  }

  type Phase =
    | { kind: "idle" }
    | { kind: "scanning"; imageUrl: string }
    | { kind: "reviewing"; imageUrl: string; autoAdded: number; autoSkipped: number }
    | { kind: "failed"; imageUrl: string };

  let {
    scan,
    onConfirm,
    onShowPhoto,
    onReviewChange,
  }: {
    /** Run the scan for this photo; reject to fail it (abort included). */
    scan: (file: File, signal: AbortSignal) => Promise<ScanOutcome>;
    /** The rows review kept, as plain objects. */
    onConfirm: (kept: Row[]) => void;
    /** A flagged row's warning was tapped: show the photo full-screen. */
    onShowPhoto: (imageUrl: string) => void;
    /** Review opened or closed (the session view's fresh state depends on it). */
    onReviewChange: (reviewing: boolean) => void;
  } = $props();

  // A hung request used to sweep the beam forever with no way out but a
  // reload (#44). Two escapes: this ceiling (generous, because a cold Cloud
  // Function plus a thinking model legitimately takes tens of seconds) and
  // the overlay's Cancel.
  const SCAN_TIMEOUT_MS = 90_000;
  // Long waits feel shorter with signs of life. The copy advances rather than
  // cycling, and stops on the last message.
  const SCAN_MESSAGES = [
    "Reading the board…",
    "Deciphering the handwriting…",
    "Matching against the songbook…",
    "Nearly there…",
  ];
  const STATUS_STEP_MS = 4000;
  // Post-scan feedback: long enough to read across the room, gone before it
  // reads as a permanent fixture.
  const RESULT_MS = 8000;

  let phase = $state<Phase>({ kind: "idle" });
  // The flagged rows under review; deep state, since remove/restore and
  // corrections edit them in place.
  let entries: Row[] = $state([]);
  let context: ScanContext = $state.raw({
    upNext: [],
    requests: [],
    catalogue: [],
    catalogueStatus: "loading",
    showSuggestions: false,
  });
  let error = $state("");
  let result = $state("");
  let statusIndex = $state(0);

  let statusTimer: ReturnType<typeof setInterval> | undefined;
  let resultTimer: ReturnType<typeof setTimeout> | undefined;
  let abort: AbortController | null = null;
  // Which escape aborted the scan, since fetch reports both as AbortError.
  let endedBy: "cancel" | "timeout" | null = null;

  let photoInput: HTMLInputElement | undefined = $state();
  let previewWrap: HTMLDivElement | undefined = $state();
  let reviewSection: HTMLElement | undefined = $state();

  const imageUrl = $derived(phase.kind === "idle" ? null : phase.imageUrl);
  const kept = $derived(entries.filter((e) => !e.removed).length);

  /** Open the camera / photo picker (the "Snap the board" button). */
  export function pickPhoto() {
    photoInput?.click();
  }

  /** The session view's error line (also the scan's own failures). */
  export function showError(message: string) {
    error = message;
  }

  export function clearError() {
    error = "";
  }

  /** Fresh lists or catalogue from main.ts. */
  export function refresh(next: ScanContext) {
    context = next;
  }

  export function isReviewing() {
    return phase.kind === "reviewing";
  }

  /** Drop the review (and its photo), back to idle. */
  export function closeReview() {
    if (phase.kind !== "reviewing") return;
    // The photo is only reachable from the review sheet: release it with it.
    URL.revokeObjectURL(phase.imageUrl);
    phase = { kind: "idle" };
    entries = [];
    onReviewChange(false);
  }

  function flashResult(message: string) {
    result = message;
    clearTimeout(resultTimer);
    resultTimer = setTimeout(() => (result = ""), RESULT_MS);
  }

  function abortScan(reason: "cancel" | "timeout") {
    if (!abort) return;
    endedBy = reason;
    abort.abort();
  }

  async function onPhoto() {
    const file = photoInput?.files?.[0];
    if (!file) return;
    // A fresh scan replaces any photo still up (a failed one): release its
    // object URL before minting a new one. Kept while reviewing, so a flagged
    // row can reopen it to eyeball a match against the handwriting.
    if (phase.kind === "failed") URL.revokeObjectURL(phase.imageUrl);
    const url = URL.createObjectURL(file);
    phase = { kind: "scanning", imageUrl: url };
    error = "";
    result = "";
    statusIndex = 0;
    statusTimer = setInterval(() => {
      statusIndex = Math.min(statusIndex + 1, SCAN_MESSAGES.length - 1);
    }, STATUS_STEP_MS);
    // Bring the photo (and its sweep) into view: it can sit below the lists.
    await tick();
    previewWrap?.scrollIntoView({ behavior: "smooth", block: "center" });

    endedBy = null;
    abort = new AbortController();
    const timeout = setTimeout(() => abortScan("timeout"), SCAN_TIMEOUT_MS);
    try {
      const outcome = await scan(file, abort.signal);
      if (outcome.flagged.length) {
        entries = outcome.flagged;
        phase = {
          kind: "reviewing",
          imageUrl: url,
          autoAdded: outcome.autoAdded,
          autoSkipped: outcome.autoSkipped,
        };
        onReviewChange(true);
        await tick();
        reviewSection?.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        // Nothing to check: no review sheet, just say what happened. The
        // photo has no reachable viewer without a review, so release it.
        URL.revokeObjectURL(url);
        phase = { kind: "idle" };
        flashResult(scanResultMessage(outcome.autoAdded, outcome.autoSkipped));
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        // Only the timeout is a failure worth an error box: a deliberate
        // cancel just puts the camera back, with a line saying nothing was
        // read.
        URL.revokeObjectURL(url);
        phase = { kind: "idle" };
        if (endedBy === "timeout") {
          error = "That scan took too long. Check your signal and snap it again.";
        } else {
          flashResult("Scan cancelled. Nothing was added.");
        }
      } else {
        // A fetch that never reached the server rejects with a TypeError and
        // an unhelpful message ("Failed to fetch"): word it for humans.
        // Server errors carry a user-facing `detail` and pass through.
        phase = { kind: "failed", imageUrl: url };
        error =
          err instanceof TypeError
            ? "Couldn't reach the server. Check your signal and try again."
            : (err as Error).message;
      }
    } finally {
      clearTimeout(timeout);
      clearInterval(statusTimer);
      abort = null;
      // Reset so re-selecting the same file fires `change` again.
      if (photoInput) photoInput.value = "";
    }
  }

  function confirmReview() {
    if (phase.kind !== "reviewing") return;
    const keep = $state.snapshot(entries).filter((e) => !e.removed);
    closeReview();
    onConfirm(keep);
  }

  // Cancelling throws away the flagged rows (and the wait for the scan): one
  // stray tap shouldn't do that silently. The clear matches are already safe
  // in Requests (#80), and the prompt says so.
  function cancelReview() {
    if (phase.kind !== "reviewing") return;
    const message = phase.autoAdded
      ? "Discard the rows still needing a check? The clear matches already added stay in Requests."
      : "Discard this scan?";
    if (confirm(message)) closeReview();
  }

  function setMatch(row: Row, entry: CatalogueEntry) {
    row.match = entry;
    row.status = "confirmed";
    row.explanation = "Manually selected";
    row.alternatives = [];
  }
</script>

<section id="add" hidden={phase.kind === "reviewing"}>
  <input
    id="photo-input"
    type="file"
    accept="image/*"
    capture="environment"
    hidden
    bind:this={photoInput}
    onchange={onPhoto}
  />
  <!-- Post-scan feedback for the no-review path: when every row matched
       confidently they go straight into Requests (#80) and this line is the
       only acknowledgement, duplicates skipped included (#52). aria-live so
       the news reaches screen readers without moving focus. -->
  <p id="scan-result" class="flash-note" aria-live="polite" hidden={!result}>{result}</p>

  <div
    id="preview-wrap"
    class="preview-wrap"
    hidden={phase.kind === "idle"}
    bind:this={previewWrap}
  >
    <img id="preview" alt="" src={imageUrl ?? undefined} />
    <!-- The overlay itself is inert (pointer-events: none) so the sweep never
         eats a tap; only Cancel opts back in. It can't be aria-hidden as a
         whole (that would bury a focusable control), so the decorative sweep
         is hidden piece by piece. -->
    <div id="scan-overlay" class="scan-overlay" hidden={phase.kind !== "scanning"}>
      <div class="scan-beam" aria-hidden="true"></div>
      <div class="scan-corner tl" aria-hidden="true"></div>
      <div class="scan-corner tr" aria-hidden="true"></div>
      <div class="scan-corner bl" aria-hidden="true"></div>
      <div class="scan-corner br" aria-hidden="true"></div>
      <div class="scan-hud">
        <div class="scan-status" role="status">
          <span class="dot" aria-hidden="true"></span><span id="scan-status-text">
            {SCAN_MESSAGES[statusIndex]}
          </span>
        </div>
        <!-- The way out of a hung scan without reloading the page (#44). -->
        <button
          id="scan-cancel"
          class="scan-cancel"
          type="button"
          onclick={() => abortScan("cancel")}
        >
          Cancel scan
        </button>
      </div>
    </div>
  </div>
  <div id="error" class="error" hidden={!error}>{error}</div>
</section>
<section id="review" hidden={phase.kind !== "reviewing"} bind:this={reviewSection}>
  <h2>Review scan</h2>
  <p id="review-note" class="note">
    {phase.kind === "reviewing" ? reviewNote(phase.autoAdded, phase.autoSkipped) : reviewNote(0, 0)}
  </p>
  <ul id="review-rows">
    {#each entries as row (row.uid)}
      <ReviewRow
        {row}
        duplicate={row.match ? findDuplicate(context.upNext, context.requests, rowKey(row)) : null}
        showSuggestions={context.showSuggestions}
        catalogue={context.catalogue}
        catalogueStatus={context.catalogueStatus}
        upNext={context.upNext}
        requests={context.requests}
        onShowPhoto={() => imageUrl && onShowPhoto(imageUrl)}
        onSetMatch={(entry) => setMatch(row, entry)}
        onToggleRemoved={() => (row.removed = !row.removed)}
      />
    {/each}
  </ul>
  <div class="actions">
    <button id="review-confirm" disabled={kept === 0} onclick={confirmReview}>
      <Icon name="add" /><span class="btn-label">Add {kept} to Requests</span>
    </button>
    <button id="review-cancel" class="secondary" onclick={cancelReview}>Cancel</button>
  </div>
</section>
