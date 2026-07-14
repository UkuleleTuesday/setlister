const editionSelect = document.getElementById("edition");
const photoInput = document.getElementById("photo-input");
const preview = document.getElementById("preview");
const previewWrap = document.getElementById("preview-wrap");
const scanOverlay = document.getElementById("scan-overlay");
const errorBox = document.getElementById("error");
const addSection = document.getElementById("add");
const manualAddHost = document.getElementById("manual-add");
const setlistRows = document.getElementById("setlist-rows");
const setlistEmpty = document.getElementById("setlist-empty");
const clearButton = document.getElementById("clear");
const reviewSection = document.getElementById("review");
const reviewRows = document.getElementById("review-rows");
const reviewConfirm = document.getElementById("review-confirm");
const reviewCancel = document.getElementById("review-cancel");
const editionNote = document.getElementById("edition-note");
const includeCrossed = document.getElementById("include-crossed");
const showSuggestions = document.getElementById("show-suggestions");
const settingsToggle = document.getElementById("settings-toggle");
const settingsPanel = document.getElementById("settings-panel");
const modelSelect = document.getElementById("model");
const disableThinking = document.getElementById("disable-thinking");
const sendCatalogue = document.getElementById("send-catalogue");
const maxImageEdge = document.getElementById("max-image-edge");

const STORAGE_KEY = "setlister.v1";

// The setlist is the durable, primary object. The catalogue/edition are loaded
// once per edition (independent of any scan) and feed matching + manual search.
// `review` holds the rows from the most recent scan while they're being
// validated in the review sheet, before they merge into the setlist.
let app = {
  edition: null,
  catalogue: [],
  catalogueGeneratedAt: "",
  setlist: [],
  review: null,
};

showSuggestions.addEventListener("change", rerender);

// Settings live in a panel behind the gear icon; toggle it and close on
// outside click or Escape so it behaves like a normal popover.
function setSettingsOpen(open) {
  settingsPanel.hidden = !open;
  settingsToggle.setAttribute("aria-expanded", String(open));
}
settingsToggle.addEventListener("click", (event) => {
  event.stopPropagation();
  setSettingsOpen(settingsPanel.hidden);
});
document.addEventListener("click", (event) => {
  if (!settingsPanel.hidden && !settingsPanel.contains(event.target)) {
    setSettingsOpen(false);
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setSettingsOpen(false);
});

// The UI is a static site (GitHub Pages in production), so the API lives on a
// different origin: the deployed Cloud Function, or a local
// `ut-requests serve` when developing.
function getApiBase() {
  if (["localhost", "127.0.0.1"].includes(location.hostname)) {
    return "http://127.0.0.1:8080";
  }
  return "https://europe-west1-songbook-generator.cloudfunctions.net/setlister-api";
}
const API_BASE = getApiBase();

function newUid() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// --- Persistence -----------------------------------------------------------
// The in-progress setlist survives a reload / accidental close: entries carry
// their matched catalogue entry inline, so they render and export even before
// the catalogue reloads over the network.
function persist() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ setlist: app.setlist, edition: app.edition })
    );
  } catch {
    /* storage may be full or blocked (private mode) — non-fatal */
  }
}

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (saved && Array.isArray(saved.setlist)) {
      app.setlist = saved.setlist;
      if (saved.edition) app.edition = saved.edition;
    }
  } catch {
    /* corrupt payload — start fresh */
  }
}

// --- Loading editions + catalogue ------------------------------------------
async function loadEditions() {
  try {
    const res = await fetch(`${API_BASE}/api/editions`);
    const data = await res.json();
    editionSelect.replaceChildren(
      ...data.editions.map((e) => {
        const option = document.createElement("option");
        option.value = e.id;
        option.textContent = e.id;
        option.selected = e.id === (app.edition?.id || "current");
        return option;
      })
    );
  } catch {
    /* keep the hardcoded "current" option */
  }
}

// Load the catalogue for an edition independently of any photo, so manual add
// works before (or without) a scan. Never wipes the setlist.
async function loadCatalogue(edition) {
  try {
    const res = await fetch(
      `${API_BASE}/api/catalogue?edition=${encodeURIComponent(edition)}`
    );
    if (!res.ok) return;
    const data = await res.json();
    app.edition = data.edition;
    app.catalogue = data.catalogue;
    app.catalogueGeneratedAt = data.catalogue_generated_at;
    renderSetlist();
  } catch {
    /* leave any previously loaded catalogue in place */
  }
}

editionSelect.addEventListener("change", () => loadCatalogue(editionSelect.value));

function normalizeText(s) {
  // Mirror the accent-insensitive matching the backend does in matcher.py, so
  // "sara" finds "Sarà" and users don't have to type diacritics on a phone.
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function searchCatalogue(query, limit = 8) {
  const terms = normalizeText(query.trim()).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return app.catalogue
    .filter((entry) => {
      const haystack = normalizeText(`${entry.title} ${entry.artist || ""}`);
      return terms.every((term) => haystack.includes(term));
    })
    .slice(0, limit);
}

// A small custom combobox. We rolled our own instead of a native <datalist>
// because datalist support is unreliable on the mobile browsers this app
// targets (no dropdown on iOS Safari, flaky on Android). Shared by the per-row
// correction picker and the standalone "add a song" field so the two can't
// drift apart.
function makeCombobox({ placeholder, onPick }) {
  const wrap = document.createElement("div");
  wrap.className = "song-picker";

  const input = document.createElement("input");
  input.className = "song-picker-input";
  input.type = "text";
  input.placeholder = placeholder;
  input.autocomplete = "off";
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");

  const menu = document.createElement("ul");
  menu.className = "song-picker-menu";
  menu.setAttribute("role", "listbox");
  menu.hidden = true;

  let matches = [];
  let active = -1;

  function close() {
    menu.hidden = true;
    menu.replaceChildren();
    input.setAttribute("aria-expanded", "false");
    active = -1;
  }

  function pick(entry) {
    input.value = "";
    close();
    onPick(entry);
  }

  function renderMenu() {
    if (!matches.length) return close();
    menu.replaceChildren(
      ...matches.map((entry, i) => {
        const li = document.createElement("li");
        li.className = "song-picker-option" + (i === active ? " active" : "");
        li.setAttribute("role", "option");
        li.setAttribute("aria-selected", i === active ? "true" : "false");
        const name = document.createElement("span");
        name.className = "song-picker-name";
        name.textContent = entry.display;
        const page = document.createElement("span");
        page.className = "page-badge";
        page.textContent = `p.${entry.page}`;
        li.append(name, page);
        // pointerdown fires before the input's blur, so the pick registers
        // instead of the field closing first (works for mouse and touch).
        li.addEventListener("pointerdown", (ev) => {
          ev.preventDefault();
          pick(entry);
        });
        return li;
      })
    );
    menu.hidden = false;
    input.setAttribute("aria-expanded", "true");
  }

  input.addEventListener("input", () => {
    matches = searchCatalogue(input.value);
    active = -1;
    renderMenu();
  });

  input.addEventListener("keydown", (ev) => {
    if (menu.hidden) return;
    if (ev.key === "ArrowDown") {
      ev.preventDefault();
      active = Math.min(active + 1, matches.length - 1);
      renderMenu();
    } else if (ev.key === "ArrowUp") {
      ev.preventDefault();
      active = Math.max(active - 1, 0);
      renderMenu();
    } else if (ev.key === "Enter" && active >= 0) {
      ev.preventDefault();
      pick(matches[active]);
    } else if (ev.key === "Escape") {
      close();
    }
  });

  // Delay so a pending option pointerdown can win the race with blur.
  input.addEventListener("blur", () => setTimeout(close, 120));

  wrap.append(input, menu);
  return wrap;
}

function buildSongPicker(row) {
  return makeCombobox({
    placeholder: "Correct song…",
    onPick: (entry) => setMatch(row, entry),
  });
}

// The standalone add field lives outside any row and creates a new confirmed
// setlist entry instead of correcting an existing one.
function mountManualAdd() {
  manualAddHost.replaceChildren(
    makeCombobox({ placeholder: "Add a tune by name…", onPick: addManualEntry })
  );
}

function addManualEntry(entry) {
  app.setlist.push({
    uid: newUid(),
    source: "manual",
    raw_title: entry.display,
    raw_page: entry.page,
    notes: null,
    crossed_out: false,
    status: "confirmed",
    method: "none",
    confidence: 1,
    match: entry,
    alternatives: [],
    explanation: "Added manually",
    removed: false,
  });
  renderSetlist();
  persist();
}

function setMatch(row, entry) {
  row.match = entry;
  row.status = entry ? "confirmed" : "unmatched";
  row.explanation = entry ? "Manually selected" : "";
  row.alternatives = [];
  rerender();
  persist();
}

// --- Photo scan -> review sheet --------------------------------------------
function rowToEntry(row) {
  return { ...row, uid: newUid(), source: "scan", removed: false };
}

photoInput.addEventListener("change", async () => {
  const file = photoInput.files[0];
  if (!file) return;
  preview.src = URL.createObjectURL(file);
  previewWrap.hidden = false;
  errorBox.hidden = true;
  scanOverlay.hidden = false;

  const form = new FormData();
  form.append("image", file);
  form.append("edition", editionSelect.value);
  // Tuning knobs from the settings panel — the API clamps/ignores anything out
  // of range and falls back to its configured defaults.
  if (modelSelect.value) form.append("model", modelSelect.value);
  form.append("thinking_budget", disableThinking.checked ? "0" : "1024");
  form.append("catalogue_in_prompt", sendCatalogue.checked ? "true" : "false");
  if (maxImageEdge.value) form.append("max_image_edge", maxImageEdge.value);
  try {
    const res = await fetch(`${API_BASE}/api/parse`, { method: "POST", body: form });
    if (!res.ok) {
      const detail = (await res.json().catch(() => ({}))).detail;
      throw new Error(detail || `Server error (${res.status})`);
    }
    const data = await res.json();
    // Refresh catalogue/edition metadata from the parse response.
    app.edition = data.edition;
    app.catalogue = data.catalogue;
    app.catalogueGeneratedAt = data.catalogue_generated_at;
    // Scanned rows go to the review sheet to be validated before merging.
    app.review = { entries: data.rows.map(rowToEntry) };
    openReview();
  } catch (err) {
    errorBox.textContent = err.message;
    errorBox.hidden = false;
  } finally {
    scanOverlay.hidden = true;
    // Reset so re-selecting the same file re-fires `change`.
    photoInput.value = "";
  }
});

function openReview() {
  addSection.hidden = true;
  reviewSection.hidden = false;
  renderReview();
  reviewSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeReview() {
  reviewSection.hidden = true;
  addSection.hidden = false;
  previewWrap.hidden = true;
  app.review = null;
}

function renderReview() {
  if (!app.review) return;
  const kept = app.review.entries.filter((e) => !e.removed).length;
  reviewConfirm.textContent = `➕ Add ${kept} to setlist`;
  reviewConfirm.disabled = kept === 0;
  reviewRows.replaceChildren(
    ...app.review.entries.map((e, i) => renderRow(e, i, "review"))
  );
}

reviewConfirm.addEventListener("click", () => {
  if (!app.review) return;
  const kept = app.review.entries.filter((e) => !e.removed);
  app.setlist.push(...kept);
  closeReview();
  renderSetlist();
  persist();
});

reviewCancel.addEventListener("click", closeReview);

// --- Rendering -------------------------------------------------------------
function rerender() {
  renderSetlist();
  if (app.review) renderReview();
}

function renderSetlist() {
  if (app.edition) {
    editionNote.textContent =
      `Matched against “${app.edition.title}” ` +
      `(generated ${app.catalogueGeneratedAt?.slice(0, 10) || "unknown"})`;
  } else {
    editionNote.textContent = "";
  }
  const hasRows = app.setlist.length > 0;
  setlistEmpty.hidden = hasRows;
  clearButton.hidden = !hasRows;
  setlistRows.replaceChildren(
    ...app.setlist.map((e, i) => renderRow(e, i, "setlist"))
  );
}

function renderRow(row, index, context) {
  const li = document.createElement("li");
  li.className = `row-card ${row.status}`;
  li.dataset.uid = row.uid;
  if (row.crossed_out) li.classList.add("crossed");
  if (row.removed) li.classList.add("removed");

  const top = document.createElement("div");
  top.className = "row-top";
  const title = document.createElement("span");
  title.className = "match-title";
  title.textContent = row.match ? row.match.display : `“${row.raw_title}”`;
  // The warning icon, the "reasons" explanation, and the correct-song picker are
  // validation affordances — they belong to the review sheet only. The setlist
  // is the clean final running order, so they're omitted there.
  if (context === "review" && row.match && row.status !== "confirmed") {
    const warn = document.createElement("span");
    warn.className = "warn-icon";
    warn.textContent = "⚠️";
    warn.title = row.explanation || "Needs a check";
    title.append(" ", warn);
  }
  top.appendChild(title);
  if (row.match) {
    const badge = document.createElement("span");
    badge.className = "page-badge";
    badge.textContent = `p.${row.match.page}`;
    top.appendChild(badge);
  }
  li.appendChild(top);

  const raw = document.createElement("div");
  raw.className = "raw";
  raw.textContent =
    `wrote: “${row.raw_title}”` +
    (row.raw_page ? ` · p.${row.raw_page}` : " · no page") +
    (row.notes ? ` · ${row.notes}` : "") +
    (row.crossed_out ? " · crossed out" : "");
  li.appendChild(raw);

  if (context === "review" && row.explanation) {
    const explanation = document.createElement("div");
    explanation.className = "explanation";
    const confidence = row.confidence ? ` (${Math.round(row.confidence * 100)}%)` : "";
    explanation.textContent = row.explanation + (row.status === "confirmed" ? confidence : "");
    li.appendChild(explanation);
  }

  if (showSuggestions.checked && row.alternatives?.length && !row.removed) {
    const chips = document.createElement("div");
    chips.className = "chips";
    row.alternatives.forEach((alt) => {
      const chip = document.createElement("button");
      chip.textContent = `${alt.entry.title} (p.${alt.entry.page})`;
      chip.onclick = () => setMatch(row, alt.entry);
      chips.appendChild(chip);
    });
    li.appendChild(chips);
  }

  const tools = document.createElement("div");
  tools.className = "row-tools";

  // Reorder controls only make sense on the setlist (the running order), not in
  // the review sheet where rows are still being validated.
  if (context === "setlist") {
    const handle = document.createElement("button");
    handle.className = "drag-handle";
    handle.type = "button";
    handle.textContent = "⠿";
    handle.title = "Drag to reorder";
    handle.setAttribute("aria-label", "Drag to reorder");
    wireDrag(handle, li);

    const up = document.createElement("button");
    up.textContent = "↑";
    up.title = "Move up";
    up.disabled = index === 0;
    up.onclick = () => moveEntry(index, -1);

    const down = document.createElement("button");
    down.textContent = "↓";
    down.title = "Move down";
    down.disabled = index === app.setlist.length - 1;
    down.onclick = () => moveEntry(index, 1);

    tools.append(handle, up, down);
  }

  // The correct-song picker is a review-only affordance; the setlist keeps just
  // the reorder controls and remove.
  if (context === "review") {
    tools.append(buildSongPicker(row));
  }
  const removeButton = document.createElement("button");
  removeButton.textContent = row.removed ? "↩️" : "🗑";
  removeButton.title = row.removed ? "Restore row" : "Remove row";
  removeButton.onclick = () => {
    row.removed = !row.removed;
    rerender();
    persist();
  };
  tools.append(removeButton);
  li.appendChild(tools);

  return li;
}

// --- Reorder (up/down + drag) ----------------------------------------------
function moveEntry(index, delta) {
  const target = index + delta;
  if (target < 0 || target >= app.setlist.length) return;
  const [item] = app.setlist.splice(index, 1);
  app.setlist.splice(target, 0, item);
  renderSetlist();
  persist();
}

function dragAfterElement(container, y) {
  const els = [...container.querySelectorAll(".row-card:not(.dragging)")];
  let closest = { offset: Number.NEGATIVE_INFINITY, element: null };
  for (const child of els) {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      closest = { offset, element: child };
    }
  }
  return closest.element;
}

// Pointer-events drag so touch works on the mobile browsers this app targets
// (HTML5 drag-and-drop is desktop-only on touch). We reorder the DOM live and
// read the final order back into the array on drop.
function wireDrag(handle, li) {
  handle.addEventListener("pointerdown", (ev) => {
    ev.preventDefault();
    li.classList.add("dragging");
    // Capture keeps touch from scrolling the page; move/up listen on the
    // document so events keep flowing even as we reorder the row in the DOM.
    try {
      handle.setPointerCapture(ev.pointerId);
    } catch {
      /* capture unsupported — document listeners still work */
    }

    const onMove = (e) => {
      const after = dragAfterElement(setlistRows, e.clientY);
      if (after == null) setlistRows.appendChild(li);
      else if (after !== li) setlistRows.insertBefore(li, after);
    };
    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
      li.classList.remove("dragging");
      commitDomOrder();
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
  });
}

function commitDomOrder() {
  const order = [...setlistRows.querySelectorAll(".row-card")].map(
    (el) => el.dataset.uid
  );
  app.setlist.sort((a, b) => order.indexOf(a.uid) - order.indexOf(b.uid));
  renderSetlist();
  persist();
}

// --- Clear + export --------------------------------------------------------
clearButton.addEventListener("click", () => {
  if (!app.setlist.length) return;
  if (!confirm("Clear the whole setlist and start over?")) return;
  app.setlist = [];
  renderSetlist();
  persist();
});

function exportedRows() {
  return app.setlist.filter(
    (row) => !row.removed && (includeCrossed.checked || !row.crossed_out)
  );
}

function exportText() {
  return exportedRows()
    .map((row) =>
      row.match
        ? `${row.match.display} (p.${row.match.page})`
        : `?? ${row.raw_title}${row.raw_page ? ` (p.${row.raw_page})` : ""}`
    )
    .join("\n");
}

// Drop the internal UI/provenance fields from the exported JSON.
function stripInternal({ uid, source, removed, ...rest }) {
  return rest;
}

document.getElementById("copy").addEventListener("click", async () => {
  const text = exportText();
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
  const button = document.getElementById("copy");
  const label = button.textContent;
  button.textContent = "✅ Copied!";
  setTimeout(() => (button.textContent = label), 1500);
});

document.getElementById("download").addEventListener("click", () => {
  const payload = {
    edition: app.edition,
    catalogue_generated_at: app.catalogueGeneratedAt,
    rows: exportedRows().map(stripInternal),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "requests.json";
  a.click();
  URL.revokeObjectURL(a.href);
});

// --- Init ------------------------------------------------------------------
(async function init() {
  restore();
  mountManualAdd();
  renderSetlist();
  await loadEditions();
  loadCatalogue(editionSelect.value);
})();
