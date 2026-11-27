// Metadata goes by sync's own writes, never the debounced row push.

import { notices } from "./notices.svelte.js";
import { loseOrganiserAccess } from "./organiser.svelte.js";
import { readSync, session } from "./session.svelte.js";
import { offerLink } from "./share-link.js";
import * as sync from "./sync.js";
import type { RequestsSwitch } from "./types.js";
import { buildSessionUrl } from "./view-mode.js";

export async function shareSessionLink(): Promise<boolean> {
  const id = sync.getSessionId();
  if (!id) return false;
  const label = session.label;
  return offerLink(
    buildSessionUrl(location.href, id),
    label ? `Requests for ${label} · Ukulele Tuesday` : "Ukulele Tuesday requests",
  );
}

export async function changeVisibility(listed: boolean) {
  await metadataWrite("the session’s visibility", () => sync.setSessionListed(listed));
}

export async function changeRequestsMode(mode: RequestsSwitch) {
  await metadataWrite("the request link", () => sync.setRequestsMode(mode));
}

// The panel sends both times, so one save can't clear the other.
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
  // Sync applied the write locally; don't wait a round trip for the snapshot.
  readSync();
}
