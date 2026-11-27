export async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // The Clipboard API needs a secure context and permission; older mobile
    // browsers only have execCommand.
    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}

// True when copied, so the button can flash a confirmation; a share sheet confirms itself.
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
