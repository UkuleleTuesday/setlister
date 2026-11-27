// Boot: restore this device's copy of the night, mount the page, follow the
// session, and go wherever the URL says. The state lives in the *.svelte.ts
// modules, App.svelte draws it, and the actions that change it are their own
// modules (adds, rows, routing, sharing, ...).

import { mount } from "svelte";
import App from "./App.svelte";
import {
  catalogue,
  hydrateCatalogue,
  loadCatalogue,
  loadEditions,
  refreshCatalogueIfStale,
} from "./catalogue.svelte.js";
import { followSession } from "./live.js";
import { night } from "./night.svelte.js";
import {
  followOrganiseLinks,
  restoreOrganiser,
  startRegistration,
  takeOrganiseLink,
} from "./organiser.svelte.js";
import { currentRouteId, followBackButton, navigateTo, setView } from "./routing.js";
import { restore } from "./save.js";
import { retireModeLinks } from "./view-mode.js";

// First: strip an organiser key from the address bar.
takeOrganiseLink();
retireModeLinks();
restore();
// After restore(): needs the saved name.
startRegistration();
// Search from the cached catalogue at once; the network fetch below replaces
// it (a Cloud Function cold start can take several seconds). Keyed by the
// edition restore() brought back: joining a session with a different book
// re-scopes when its doc arrives.
hydrateCatalogue(night.edition?.id || "current");
// The right view before any network work, so a cold open shows the history
// (with its own loading note) straight away. The route lives in the URL, so a
// mid-gig reload lands back in the session it was in.
const routeId = currentRouteId();
setView(routeId ? "session" : "home");

mount(App, { target: document.body });

followSession();
followBackButton();
followOrganiseLinks();
// A phone "reopens" the app by foregrounding a tab it never reloaded, so this,
// not a page load, is when a new night usually starts.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") refreshCatalogueIfStale();
});

// Routing, editions and the catalogue are independent requests: don't
// waterfall them. Firestore is on the critical path for every user (the
// history needs it), so it must not gate the catalogue.
navigateTo(routeId, { replace: true });
loadEditions();
loadCatalogue(catalogue.editionId);
restoreOrganiser();
