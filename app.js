const editionSelect = document.getElementById("edition");
const photoInput = document.getElementById("photo-input");
const preview = document.getElementById("preview");
const previewWrap = document.getElementById("preview-wrap");
const scanOverlay = document.getElementById("scan-overlay");
const errorBox = document.getElementById("error");
const resultsSection = document.getElementById("results");
const rowsList = document.getElementById("rows");
const editionNote = document.getElementById("edition-note");
const catalogueList = document.getElementById("catalogue-list");
const includeCrossed = document.getElementById("include-crossed");
const settingsToggle = document.getElementById("settings-toggle");
const settingsPanel = document.getElementById("settings-panel");

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
  previewWrap.hidden = false;
  errorBox.hidden = true;
  resultsSection.hidden = true;
  scanOverlay.hidden = false;

  const form = new FormData();
  form.append("image", file);
  form.append("edition", editionSelect.value);
  try {
    const res = await fetch(`${API_BASE}/api/parse`, { method: "POST", body: form });
    if (!res.ok) {
      const detail = (await res.json().catch(() => ({}))).detail;
      throw new Error(detail || `Server error (${res.status})`);
    }
    state = await res.json();
    state.rows.forEach((row) => (row.removed = false));
    renderResults();
  } catch (err) {
    errorBox.textContent = err.message;
    errorBox.hidden = false;
  } finally {
    scanOverlay.hidden = true;
  }
});

function entryByDisplay(display) {
  return state.catalogue.find((e) => e.display === display) || null;
}

function setMatch(row, entry) {
  row.match = entry;
  row.status = entry ? "confirmed" : "unmatched";
  row.explanation = entry ? "Manually selected" : "";
  row.alternatives = [];
  renderResults();
}

function renderResults() {
  editionNote.textContent =
    `Matched against “${state.edition.title}” ` +
    `(generated ${state.catalogue_generated_at?.slice(0, 10) || "unknown"})`;

  catalogueList.replaceChildren(
    ...state.catalogue.map((e) => {
      const option = document.createElement("option");
      option.value = e.display;
      return option;
    })
  );

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

  if (row.alternatives?.length && !row.removed) {
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
  const input = document.createElement("input");
  input.setAttribute("list", "catalogue-list");
  input.placeholder = "Correct song…";
  input.addEventListener("change", () => {
    const entry = entryByDisplay(input.value);
    if (entry) setMatch(row, entry);
  });
  const removeButton = document.createElement("button");
  removeButton.textContent = row.removed ? "↩️" : "🗑";
  removeButton.title = row.removed ? "Restore row" : "Remove row";
  removeButton.onclick = () => {
    row.removed = !row.removed;
    renderResults();
  };
  tools.append(input, removeButton);
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
