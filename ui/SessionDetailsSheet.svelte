<script lang="ts">
  import Icon from "./Icon.svelte";
  import Sheet from "./Sheet.svelte";
  import { catalogue } from "./catalogue.svelte.js";
  import { editionLabel } from "./editions.js";
  import { features } from "./features.js";
  import { linkStateText } from "./request-window.js";
  import { BLURB_MAX, DEFAULT_BLURB, cleanBlurb, sessionLongDate } from "./session-index.js";
  import { session } from "./session.svelte.js";
  import { view } from "./view.svelte.js";

  let {
    onEdition,
    onVisibility,
    onBlurb,
    onRequestLink,
    onclose,
  }: {
    onEdition: (editionId: string) => void;
    /** Rejects if the write didn't land, and the select reverts. */
    onVisibility: (listed: boolean) => Promise<void>;
    /** Rejects if the write didn't land; the draft stays put. */
    onBlurb: (text: string) => Promise<void>;
    onRequestLink: () => void;
    onclose: () => void;
  } = $props();

  // A past night's book is part of its record: change it only while editing.
  const locked = $derived(session.past && !view.editingPast);

  // The session's book may be missing from the listing; list it anyway so the
  // select doesn't silently snap to another book.
  const editionOptions = $derived.by(() => {
    const id = catalogue.editionId;
    const known = catalogue.editions.length ? catalogue.editions : [{ id: "current" }];
    const all = known.some((e) => e.id === id) ? known : [...known, { id }];
    return all.map((e) => ({ id: e.id, label: editionLabel(e) }));
  });

  // Optimistic: shows a pick at once and reverts if the write fails.
  let visibility: "shared" | "unlisted" = $derived(session.meta.listed ? "shared" : "unlisted");
  let visibilityBusy = $state(false);

  async function changeVisibility(next: "shared" | "unlisted") {
    visibility = next;
    const listed = next === "shared";
    visibilityBusy = true;
    try {
      await onVisibility(listed);
    } catch {
      visibility = listed ? "unlisted" : "shared";
    } finally {
      visibilityBusy = false;
    }
  }

  // A draft, saved on blur, Enter or Close: a write per keystroke would flood peers.
  let blurbDraft = $state(session.meta.blurb);
  let blurbBusy = $state(false);
  const blurbDirty = $derived(cleanBlurb(blurbDraft) !== session.meta.blurb);

  async function saveBlurb() {
    if (!blurbDirty || blurbBusy) return;
    blurbBusy = true;
    try {
      await onBlurb(blurbDraft);
      blurbDraft = session.meta.blurb;
    } catch {
      /* sharing.ts shows why; the draft stays to retry */
    } finally {
      blurbBusy = false;
    }
  }

  // One line on the card: Enter finishes the note, which saves it.
  function onBlurbKeydown(event: KeyboardEvent & { currentTarget: HTMLTextAreaElement }) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    event.currentTarget.blur();
  }

  function close() {
    void saveBlurb();
    onclose();
  }
</script>

<Sheet
  id="session-details-sheet"
  labelledby="session-details-title"
  holdsInput={blurbDirty}
  onclose={close}
>
  <h2 id="session-details-title">Session details</h2>
  <p class="detail-row">
    <span class="detail-label">Date</span>
    <span id="session-details-date">{sessionLongDate(session.createdAt) || session.label}</span>
  </p>

  {#if !session.past}
    <label class="field blurb-field">
      <span>Note for the room</span>
      <textarea
        id="session-blurb"
        rows="2"
        maxlength={BLURB_MAX}
        placeholder={DEFAULT_BLURB}
        disabled={blurbBusy}
        bind:value={blurbDraft}
        onchange={saveBlurb}
        onkeydown={onBlurbKeydown}></textarea>
    </label>
    <p class="note">Shows under the night on everyone’s home screen.</p>
  {/if}

  <label class="field" id="edition-setting">
    <span>Songbook</span>
    <select id="edition" disabled={locked} bind:value={() => catalogue.editionId, onEdition}>
      {#each editionOptions as option (option.id)}
        <option value={option.id}>{option.label}</option>
      {/each}
    </select>
  </label>
  <p class="note">
    {locked
      ? "Tap Edit on the night to change its songbook."
      : "Changes the songbook for everyone in this session."}
  </p>

  {#if features.unlistedSessions}
    <!-- Not a privacy control: the link works either way (see firestore.rules). -->
    <label class="field">
      <span>Visibility</span>
      <select
        id="session-visibility"
        value={visibility}
        disabled={visibilityBusy}
        onchange={(event) => changeVisibility(event.currentTarget.value as "shared" | "unlisted")}
      >
        <option value="shared">Shared</option>
        <option value="unlisted">Unlisted</option>
      </select>
    </label>
    <p class="note">Anyone with the link can open it either way.</p>
  {/if}

  {#if !session.past}
    <ul class="inset-list session-details-links">
      <li>
        <button
          type="button"
          id="session-details-request-link"
          class="session-item"
          onclick={onRequestLink}
        >
          <span class="session-item-text">
            <span class="session-item-name">Request link</span>
            <span class="session-item-meta">{linkStateText(session.link.status)}</span>
          </span>
          <Icon name="forward" extraClass="session-item-chevron" />
        </button>
      </li>
    </ul>
  {/if}

  <div class="actions">
    <button type="button" id="session-details-close" class="btn btn-soft" onclick={close}>
      Close
    </button>
  </div>
</Sheet>
