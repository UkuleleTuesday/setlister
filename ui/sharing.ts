// The share panel's link and its three session metadata writes. Metadata
// travels by sync's own writes, never the debounced row push (see sync.ts).

import { notices } from "./notices.svelte.js";
import { loseOrganiserAccess } from "./organiser.svelte.js";
import { readSync, session } from "./session.svelte.js";
import { offerLink } from "./share-link.js";
import * as sync from "./sync.js";
import type { RequestsSwitch } from "./types.js";
import { buildSessionUrl } from "./view-mode.js";

// The session link, for everyone: organisers get the full app, the room the
// request view (#150).
export async function shareSessionLink(): Promise<boolean> {
  const id = sync.getSessionId();
  if (!id) return false;
  const label = session.label;
  return offerLink(
    buildSessionUrl(location.href, id),
    label ? `Requests for ${label} · Ukulele Tuesday` : "Ukulele Tuesday requests",
  );
}

// SharePanel shows each pick at once and reverts it if the write rejects:
// one tap that has to survive flaky pub wifi. Unlisted removes the row from
// the club's list only: the link keeps working, which the panel says out
// loud.
export async function changeVisibility(listed: boolean) {
  await metadataWrite("the session’s visibility", () => sync.setSessionListed(listed));
}

// Auto / Taking requests / View only. View only takes the add button off
// every room phone on the session (live, through onMetaChange) and points
// them at the whiteboard; forcing it open does the opposite whatever the
// schedule; auto hands control back to the window.
export async function changeRequestsMode(mode: RequestsSwitch) {
  await metadataWrite("the request link", () => sync.setRequestsMode(mode));
}

// The two override time fields. The panel always sends both sides' current
// values, so one save can't silently clear the other.
export async function changeRequestsWindow(times: { opensAt: Date | null; closesAt: Date | null }) {
  await metadataWrite("the request window", () => sync.setRequestsWindow(times));
}

async function metadataWrite(what: string, write: () => Promise<void>) {
  notices.session.clear();
  try {
    await write();
  } catch (err) {
    if (sync.isPermissionDenied(err)) {
      loseOrganiserAccess();
    } else {
      const reason = err instanceof Error ? err.message : String(err);
      notices.session.show(`Couldn’t change ${what}: ${reason}`);
    }
    throw err;
  }
  // sync applies its own write to its copy at once; the snapshot announcing
  // it can take a round trip, and the panel shouldn't wait for that.
  readSync();
}
