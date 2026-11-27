// save.ts persists these with the night.

export interface Settings {
  model: string;
  disableThinking: boolean;
  sendCatalogue: boolean;
  showSuggestions: boolean;
  maxImageEdge: string;
}

export const settings = $state<Settings>({
  model: "",
  disableThinking: true,
  sendCatalogue: true,
  showSuggestions: false,
  maxImageEdge: "",
});

export function applySettings(saved: unknown) {
  if (!saved || typeof saved !== "object") return;
  const s = saved as Record<string, unknown>;
  if (typeof s.model === "string") settings.model = s.model;
  if (typeof s.disableThinking === "boolean") settings.disableThinking = s.disableThinking;
  if (typeof s.sendCatalogue === "boolean") settings.sendCatalogue = s.sendCatalogue;
  if (typeof s.showSuggestions === "boolean") settings.showSuggestions = s.showSuggestions;
  if (typeof s.maxImageEdge === "string") settings.maxImageEdge = s.maxImageEdge;
}

export function settingsSnapshot(): Settings {
  return $state.snapshot(settings);
}
