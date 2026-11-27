// Off hides the UI only: the `listed` flag, sessionIndex and the rules stay live,
// so flipping one back needs no data change.
export const features = {
  /** The Visibility picker on New session and the share panel. */
  unlistedSessions: false,
  /** Runner-up matches as one-tap chips in scan review, on rows that aren't a clean match. */
  reviewSuggestions: true,
  /** Copy and Download on Up next and the recap. Off until export matches the live-gig lists (#91). */
  exportButtons: false,
};
