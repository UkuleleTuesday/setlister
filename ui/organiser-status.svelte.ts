// Whether this phone runs nights (#150). Read from storage at boot so the first
// paint shows the right view; organiser.svelte.ts confirms it against the row
// and drops it when a write is denied.

const REGISTERED_KEY = "setlister.organiser.v1";

class OrganiserStatus {
  isOrganiser = $state(readRegistered());
  name = $state("");
}

export const organiserStatus = new OrganiserStatus();

export function setOrganiser(on: boolean, name?: string): void {
  organiserStatus.isOrganiser = on;
  if (name !== undefined) organiserStatus.name = name;
  try {
    if (on) localStorage.setItem(REGISTERED_KEY, "1");
    else localStorage.removeItem(REGISTERED_KEY);
  } catch {
    /* storage blocked */
  }
}

function readRegistered(): boolean {
  try {
    return localStorage.getItem(REGISTERED_KEY) === "1";
  } catch {
    return false;
  }
}
