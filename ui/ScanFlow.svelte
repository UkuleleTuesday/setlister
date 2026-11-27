<!--
  One phase rather than flags, so impossible mixes can't be represented. The
  error box is the session view's (notices.session), so it sits outside it.
-->
<script lang="ts">
  import { onMount, tick } from "svelte";
  import Icon from "./Icon.svelte";
  import ReviewRow from "./ReviewRow.svelte";
  import { findDuplicate, rowKey } from "./dupes.js";
  import { catalogue } from "./catalogue.svelte.js";
  import { night } from "./night.svelte.js";
  import { notices } from "./notices.svelte.js";
  import { reviewNote, scanResultMessage } from "./scan.js";
  import { settings } from "./settings.svelte.js";
  import type { CatalogueEntry, Row } from "./types.js";

  /** What a finished scan left for review (`scan` has added the rest). */
  export interface ScanOutcome {
    flagged: Row[];
    autoAdded: number;
    autoSkipped: number;
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
    onShowPhoto: (imageUrl: string) => void;
    onReviewChange: (reviewing: boolean) => void;
  } = $props();

  // Generous: a cold Cloud Function plus a thinking model takes tens of seconds.
  const SCAN_TIMEOUT_MS = 90_000;
  const SCAN_MESSAGES = [
    "Reading the board…",
    "Deciphering the handwriting…",
    "Matching against the songbook…",
    "Nearly there…",
  ];
  const STATUS_STEP_MS = 4000;
  // Matches notices.requests.
  const RESULT_MS = 8000;

  let phase = $state<Phase>({ kind: "idle" });
  // Deep state: remove/restore and corrections edit rows in place.
  let entries: Row[] = $state([]);
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

  export function pickPhoto() {
    photoInput?.click();
  }

  // Leaving the session drops a review in progress: its rows belong to that night.
  onMount(() => () => {
    if (phase.kind !== "idle") URL.revokeObjectURL(phase.imageUrl);
    if (phase.kind === "reviewing") onReviewChange(false);
  });

  function closeReview() {
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
    // Not a reviewing photo: a flagged row can still reopen that one.
    if (phase.kind === "failed") URL.revokeObjectURL(phase.imageUrl);
    const url = URL.createObjectURL(file);
    phase = { kind: "scanning", imageUrl: url };
    notices.session.clear();
    result = "";
    statusIndex = 0;
    statusTimer = setInterval(() => {
      statusIndex = Math.min(statusIndex + 1, SCAN_MESSAGES.length - 1);
    }, STATUS_STEP_MS);
    // The photo can sit below the lists.
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
        // Without a review the photo has no viewer.
        URL.revokeObjectURL(url);
        phase = { kind: "idle" };
        flashResult(scanResultMessage(outcome.autoAdded, outcome.autoSkipped));
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        // A deliberate cancel isn't worth an error box.
        URL.revokeObjectURL(url);
        phase = { kind: "idle" };
        if (endedBy === "timeout") {
          notices.session.show("That scan took too long. Check your signal and snap it again.");
        } else {
          flashResult("Scan cancelled. Nothing was added.");
        }
      } else {
        // A fetch that never reached the server is a TypeError ("Failed to
        // fetch"). Server errors carry a user-facing message.
        phase = { kind: "failed", imageUrl: url };
        notices.session.show(
          err instanceof TypeError
            ? "Couldn't reach the server. Check your signal and try again."
            : (err as Error).message,
        );
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

  // One stray tap shouldn't silently throw away the flagged rows.
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
  <p id="scan-result" class="flash-note callout" aria-live="polite" hidden={!result}>{result}</p>

  <div
    id="preview-wrap"
    class="preview-wrap"
    hidden={phase.kind === "idle"}
    bind:this={previewWrap}
  >
    <img id="preview" alt="" src={imageUrl ?? undefined} />
    <!-- Not aria-hidden as a whole: that would bury Cancel. The decorative
         pieces are hidden one by one. -->
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
  <div id="error" class="error" hidden={!notices.session.text}>{notices.session.text}</div>
</section>
<section id="review" hidden={phase.kind !== "reviewing"} bind:this={reviewSection}>
  <h2 class="eyebrow">Review scan</h2>
  <p id="review-note" class="note">
    {phase.kind === "reviewing" ? reviewNote(phase.autoAdded, phase.autoSkipped) : reviewNote(0, 0)}
  </p>
  <ul id="review-rows">
    {#each entries as row (row.uid)}
      <ReviewRow
        {row}
        duplicate={row.match ? findDuplicate(night.upNext, night.requests, rowKey(row)) : null}
        showSuggestions={settings.showSuggestions}
        catalogue={catalogue.entries}
        catalogueStatus={catalogue.status}
        upNext={night.upNext}
        requests={night.requests}
        onShowPhoto={() => imageUrl && onShowPhoto(imageUrl)}
        onSetMatch={(entry) => setMatch(row, entry)}
        onToggleRemoved={() => (row.removed = !row.removed)}
      />
    {/each}
  </ul>
  <div class="actions">
    <button
      id="review-confirm"
      class="btn btn-primary"
      disabled={kept === 0}
      onclick={confirmReview}
    >
      <Icon name="add" /><span class="btn-label">Add {kept} to Requests</span>
    </button>
    <button id="review-cancel" class="btn btn-soft" onclick={cancelReview}>Cancel</button>
  </div>
</section>
