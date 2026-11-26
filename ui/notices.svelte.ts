// The app's short messages: why an add did or didn't land, why a songbook tap
// didn't add, and the error lines on home and in a session. The actions set
// them; the component that owns the spot shows them.

/** A line that retires itself `ms` after it's shown (never, for 0). */
class Notice {
  text = $state("");
  #ms: number;
  #timer: ReturnType<typeof setTimeout> | undefined;

  constructor(ms = 0) {
    this.#ms = ms;
  }

  show(text: string) {
    this.text = text;
    clearTimeout(this.#timer);
    if (this.#ms) this.#timer = setTimeout(() => (this.text = ""), this.#ms);
  }

  clear() {
    clearTimeout(this.#timer);
    this.text = "";
  }
}

export const notices = {
  // Long enough to read across the room, gone before it reads as a permanent
  // fixture.
  requests: new Notice(8000),
  songbook: new Notice(6000),
  /** Why the last route bounced back home (a bad link, a deleted session). */
  home: new Notice(),
  /** The session view's error line, shared with the scan's own failures. */
  session: new Notice(),
};
