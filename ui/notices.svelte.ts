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
  // Long enough to read across the room, short enough not to look permanent.
  requests: new Notice(8000),
  songbook: new Notice(6000),
  /** Why the last route bounced back home (a bad link, a deleted session). */
  home: new Notice(),
  /** The session view's error line; scan failures land here too. */
  session: new Notice(),
};
