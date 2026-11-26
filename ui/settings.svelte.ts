// This device's settings: two display toggles and the scan parser's knobs.
// The settings panel edits them in place; save.ts saves them with the night
// (persist()) and restores them on load.

export interface Settings {
  model: string;
  disableThinking: boolean;
  sendCatalogue: boolean;
  showSuggestions: boolean;
  includeCrossed: boolean;
  maxImageEdge: string;
}

export const settings = $state<Settings>({
  model: "",
  disableThinking: true,
  sendCatalogue: true,
  showSuggestions: false,
  includeCrossed: false,
  maxImageEdge: "",
});

/** Restore saved settings; anything of the wrong type is ignored. */
export function applySettings(saved: unknown) {
  if (!saved || typeof saved !== "object") return;
  const s = saved as Record<string, unknown>;
  if (typeof s.model === "string") settings.model = s.model;
  if (typeof s.disableThinking === "boolean") settings.disableThinking = s.disableThinking;
  if (typeof s.sendCatalogue === "boolean") settings.sendCatalogue = s.sendCatalogue;
  if (typeof s.showSuggestions === "boolean") settings.showSuggestions = s.showSuggestions;
  if (typeof s.includeCrossed === "boolean") settings.includeCrossed = s.includeCrossed;
  if (typeof s.maxImageEdge === "string") settings.maxImageEdge = s.maxImageEdge;
}

export function settingsSnapshot(): Settings {
  return $state.snapshot(settings);
}
