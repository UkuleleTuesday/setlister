// Handing a link or the setlist to the phone: the native share sheet where
// there is one (the primary target), else the clipboard.

export async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // The Clipboard API needs a secure context and permission; fall back to
    // the legacy execCommand path so copy still works on older mobile browsers.
    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}

// Returns whether it was copied, so the button that was tapped can flash a
// confirmation (SharePanel.svelte does). A share sheet confirms itself.
export async function offerLink(url: string, title: string): Promise<boolean> {
  if (navigator.share) {
    try {
      await navigator.share({ title, url });
    } catch {
      /* dismissed, or the payload was rejected: no-op */
    }
    return false;
  }
  await copyToClipboard(url);
  return true;
}
