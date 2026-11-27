// Lucide, not emoji (#53): emoji render differently per platform, shout, and
// read ambiguously (⬆️ looks like "upload").

import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Download,
  GripVertical,
  Link,
  ListMinus,
  ListMusic,
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

export const ICONS = {
  // They cross lists, not nudge a slot, so the queue idiom, not an arrow. The
  // bin owns deletion, so −list can't be misread as "remove".
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
  forward: ChevronRight,
  loader: LoaderCircle,
  news: Sparkles,
  back: ArrowLeft,
  // Played order is a nudge by one slot, so arrows here are right.
  earlier: ArrowUp,
  later: ArrowDown,
  unplayed: ListMusic,
  edit: Pencil,
  want: ThumbsUp,
  search: Search,
};

export type IconName = keyof typeof ICONS;
