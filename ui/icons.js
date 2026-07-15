// Control icons for the app (issue #53), backed by lucide (Feather's
// maintained successor). One consistent stroke style replaces the previous
// mix of emoji (⬆️🗑📷) and text glyphs (↑ ✓ ⠿): emoji render differently on
// every platform, are visually louder than their importance, and read
// ambiguously (⬆️ looks like "upload"). Per-icon ESM imports keep the bundle
// small — Vite tree-shakes everything unused.

import {
  ArrowDownToLine,
  ArrowUpToLine,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Download,
  GripVertical,
  Link,
  LoaderCircle,
  Plus,
  RotateCcw,
  Settings,
  TriangleAlert,
  Trash2,
  X,
  createElement,
} from "lucide";

// Semantic names decouple call sites from the icon set: "promote" reads as
// intent, ArrowUpToLine is an implementation detail we can swap later.
const ICONS = {
  "move-up": ChevronUp,
  "move-down": ChevronDown,
  // Promote/demote move a row across lists — the bar marks the "destination
  // edge" so they can't be confused with the plain reorder chevrons.
  promote: ArrowUpToLine,
  demote: ArrowDownToLine,
  played: Check,
  check: Check,
  bin: Trash2,
  restore: RotateCcw,
  drag: GripVertical,
  warn: TriangleAlert,
  camera: Camera,
  settings: Settings,
  share: Link,
  copy: ClipboardList,
  download: Download,
  add: Plus,
  close: X,
  loader: LoaderCircle,
};

// Build a fresh <svg> element for `name`. Icons inherit the button's text
// colour (stroke: currentColor) and are aria-hidden — the accessible name
// always lives on the button, never on the glyph.
export function icon(name, extraClass = "") {
  const svg = createElement(ICONS[name]);
  svg.classList.add("icon");
  if (extraClass) svg.classList.add(extraClass);
  svg.setAttribute("aria-hidden", "true");
  return svg;
}

// Convenience for buttons that pair an icon with a text label.
export function iconLabel(name, label) {
  const span = document.createElement("span");
  span.className = "btn-label";
  span.textContent = label;
  return [icon(name), span];
}
