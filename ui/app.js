const editionSelect = document.getElementById("edition");
const photoInput = document.getElementById("photo-input");
const preview = document.getElementById("preview");
const previewWrap = document.getElementById("preview-wrap");
const scanOverlay = document.getElementById("scan-overlay");
const errorBox = document.getElementById("error");
const resultsSection = document.getElementById("results");
const rowsList = document.getElementById("rows");
const editionNote = document.getElementById("edition-note");
const includeCrossed = document.getElementById("include-crossed");
const showSuggestions = document.getElementById("show-suggestions");
const settingsToggle = document.getElementById("settings-toggle");
const settingsPanel = document.getElementById("settings-panel");
const modelSelect = document.getElementById("model");
const disableThinking = document.getElementById("disable-thinking");
const sendCatalogue = document.getElementById("send-catalogue");
const maxImageEdge = document.getElementById("max-image-edge");
const cameraButton = document.getElementById("camera-button");
const photoControls = document.getElementById("photo-controls");
const togglePhoto = document.getElementById("toggle-photo");

showSuggestions.addEventListener("change", renderResults);

// After a scan the photo is hidden to keep the match list prominent; this
// button reveals or re-hides the full image on demand.
togglePhoto.addEventListener("click", () => {
  const show = previewWrap.hidden;
  previewWrap.hidden = !show;
  togglePhoto.textContent = show ? "🙈 Hide photo" : "🖼 Show photo";
});

let state = null; // last ParseResponse, mutated by user edits

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

async function loadEditions() {
  try {
    const res = await fetch(`${API_BASE}/api/editions`);
    const data = await res.json();
    editionSelect.replaceChildren(
      ...data.editions.map((e) => {
        const option = document.createElement("option");
        option.value = e.id;
        option.textContent = e.id;
        option.selected = e.id === "current";
        return option;
      })
    );
  } catch {
    /* keep the hardcoded "current" option */
  }
}
loadEditions();

photoInput.addEventListener("change", async () => {
  const file = photoInput.files[0];
  if (!file) return;
  preview.src = URL.createObjectURL(file);
  // Scanning view: show the full image with the scan overlay, no controls.
  previewWrap.hidden = false;
  cameraButton.hidden = true;
  photoControls.hidden = true;
  errorBox.hidden = true;
  resultsSection.hidden = true;
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
    state = await res.json();
    state.rows.forEach((row) => (row.removed = false));
    renderResults();
    // Hide the photo so the match list is the prominent thing; the controls
    // row lets the user reveal it again or take a new one.
    previewWrap.hidden = true;
    photoControls.hidden = false;
    togglePhoto.textContent = "🖼 Show photo";
  } catch (err) {
    errorBox.textContent = err.message;
    errorBox.hidden = false;
    // Keep the image visible so the user can see what failed, but still offer
    // the controls to hide it or retake.
    photoControls.hidden = false;
    togglePhoto.textContent = "🙈 Hide photo";
  } finally {
    scanOverlay.hidden = true;
  }
});

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
  return state.catalogue
    .filter((entry) => {
      const haystack = normalizeText(`${entry.title} ${entry.artist || ""}`);
      return terms.every((term) => haystack.includes(term));
    })
    .slice(0, limit);
}

// A small custom combobox. We rolled our own instead of a native <datalist>
// because datalist support is unreliable on the mobile browsers this app
// targets (no dropdown on iOS Safari, flaky on Android).
function buildSongPicker(row) {
  const wrap = document.createElement("div");
  wrap.className = "song-picker";

  const input = document.createElement("input");
  input.className = "song-picker-input";
  input.type = "text";
  input.placeholder = "Correct song…";
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
          setMatch(row, entry);
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
      setMatch(row, matches[active]);
    } else if (ev.key === "Escape") {
      close();
    }
  });

  // Delay so a pending option pointerdown can win the race with blur.
  input.addEventListener("blur", () => setTimeout(close, 120));

  wrap.append(input, menu);
  return wrap;
}

function setMatch(row, entry) {
  row.match = entry;
  row.status = entry ? "confirmed" : "unmatched";
  row.explanation = entry ? "Manually selected" : "";
  row.alternatives = [];
  renderResults();
}

function renderResults() {
  // The suggestions/crossed-out toggles now live in the always-open settings
  // panel, so a change can fire before any photo has been scanned.
  if (!state) return;
  editionNote.textContent =
    `Matched against “${state.edition.title}” ` +
    `(generated ${state.catalogue_generated_at?.slice(0, 10) || "unknown"})`;

  rowsList.replaceChildren(...state.rows.map(renderRow));
  resultsSection.hidden = false;
}

function renderRow(row, index) {
  const li = document.createElement("li");
  li.className = `row-card ${row.status}`;
  if (row.crossed_out) li.classList.add("crossed");
  if (row.removed) li.classList.add("removed");

  const top = document.createElement("div");
  top.className = "row-top";
  const title = document.createElement("span");
  title.className = "match-title";
  title.textContent = row.match ? row.match.display : `“${row.raw_title}”`;
  // Matched rows are all "green"; a mismatch (needs_review/conflict) is flagged
  // with a warning icon rather than a different colour.
  if (row.match && row.status !== "confirmed") {
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

  if (row.explanation) {
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
  const picker = buildSongPicker(row);
  const removeButton = document.createElement("button");
  removeButton.textContent = row.removed ? "↩️" : "🗑";
  removeButton.title = row.removed ? "Restore row" : "Remove row";
  removeButton.onclick = () => {
    row.removed = !row.removed;
    renderResults();
  };
  tools.append(picker, removeButton);
  li.appendChild(tools);

  return li;
}

function exportedRows() {
  return state.rows.filter(
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
  const payload = { ...state, rows: exportedRows() };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "requests.json";
  a.click();
  URL.revokeObjectURL(a.href);
});
