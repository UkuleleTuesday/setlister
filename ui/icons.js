// Control icons for the app (issue #53), backed by lucide (Feather's
// maintained successor). One consistent stroke style replaces the previous
// mix of emoji (⬆️🗑📷) and text glyphs (↑ ✓ ⠿): emoji render differently on
// every platform, are visually louder than their importance, and read
// ambiguously (⬆️ looks like "upload"). Per-icon ESM imports keep the bundle
// small — Vite tree-shakes everything unused.

import {
  ArrowLeft,
  Camera,
  Check,
  ChevronDown,
  ClipboardList,
  Download,
  GripVertical,
  Link,
  ListMinus,
  ListPlus,
  LoaderCircle,
  Pencil,
  Plus,
  RotateCcw,
  Settings,
  Sparkles,
  ThumbsUp,
  TriangleAlert,
  Trash2,
  X,
  createElement,
} from "lucide";

// Semantic names decouple call sites from the icon set: "promote" reads as
// intent, the specific lucide glyph is an implementation detail we can swap.
const ICONS = {
  // Promote/demote move a row across the two lists (not a one-slot nudge), so
  // they borrow the "add to / remove from queue" idiom rather than a bare
  // arrow: +list = put it in the running order, −list = drop it back to the
  // pool. The bin icon owns deletion, so −list can't be misread as "remove".
  promote: ListPlus,
  demote: ListMinus,
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
  chevron: ChevronDown,
  loader: LoaderCircle,
  // "Something shipped" — the What's new banner and sheet.
  news: Sparkles,
  // Session navigation: out to the history list.
  back: ArrowLeft,
  // Correcting a confidently-matched review row.
  edit: Pencil,
  // "I want this one" on a request (#83).
  want: ThumbsUp,
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
