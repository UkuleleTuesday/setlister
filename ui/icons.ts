// Control icons for the app (#53), from lucide: one consistent stroke style
// rather than emoji, which render differently on every platform, are louder
// than their importance and read ambiguously (⬆️ looks like "upload").
// Per-icon ESM imports keep the bundle small: Vite tree-shakes the rest.
// Icon.svelte draws them.

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
  Search,
  Settings,
  Sparkles,
  ThumbsUp,
  TriangleAlert,
  Trash2,
  X,
} from "lucide";

// Semantic names decouple call sites from the icon set: "promote" reads as
// intent, the specific lucide glyph is an implementation detail we can swap.
export const ICONS = {
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
  // "Something shipped": the What's new banner and sheet.
  news: Sparkles,
  // Session navigation: out to the history list.
  back: ArrowLeft,
  // Correcting a confidently-matched review row.
  edit: Pencil,
  // "I want this one" on a request (#83).
  want: ThumbsUp,
  // The room's "find a tune in the songbook" trigger.
  search: Search,
};

export type IconName = keyof typeof ICONS;
