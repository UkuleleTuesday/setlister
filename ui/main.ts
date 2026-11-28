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

// First: strip an organiser key from the address bar.
takeOrganiseLink();
restore();
// After restore(): needs the saved name.
startRegistration();
// Search the cached catalogue at once: a Cloud Function cold start can take
// seconds. A session with a different book re-scopes when its doc arrives.
hydrateCatalogue(night.edition?.id || "current");
// The view before any network work, so a cold open shows the history at once.
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

// Independent requests, so no waterfall: Firestore must not gate the catalogue.
navigateTo(routeId, { replace: true });
loadEditions();
loadCatalogue(catalogue.editionId);
restoreOrganiser();
