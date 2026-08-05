// On-device photo downscaling before upload (#44).
//
// The phone shoots 3–8MB; the API immediately resizes to a 1600px long edge
// before the vision call (utrequests/preprocess.py), so every megabyte past
// that is a megabyte the user waits for on pub Wi-Fi and 4G for nothing.
// Shrinking here makes the upload 10–20× smaller — the single biggest win
// available on the scan flow's wall-clock.
//
// Guiding rule: this is an optimisation, never a gate. Every failure path
// (no `createImageBitmap`, a canvas the browser won't read back, a re-encode
// that comes out bigger) returns the ORIGINAL file, and the server resizes as
// it always did. A scan must never fail because the shrink did.
//
// Pure-ish module, no DOM ids and no app state: the browser bits are injected
// so ui/tests can exercise the decisions (same precedent as dupes.js).

/** Matches the API's own default and the settings field's placeholder. */
export const DEFAULT_MAX_EDGE = 1600;
/** Matches `image.save(..., quality=85)` in utrequests/preprocess.py. */
export const JPEG_QUALITY = 0.85;
/** The bounds the API clamps `max_image_edge` to (utrequests/api.py). */
export const MIN_EDGE = 256;
export const MAX_EDGE = 4096;

/**
 * The "Max image edge (px)" setting as a usable number: blank/garbage falls
 * back to the default, anything else is clamped to the range the API accepts
 * so the client and the server agree on the size.
 */
export function resolveMaxEdge(value) {
  const edge = Math.round(Number(value));
  if (!Number.isFinite(edge) || edge <= 0) return DEFAULT_MAX_EDGE;
  return Math.min(Math.max(edge, MIN_EDGE), MAX_EDGE);
}

/**
 * Target dimensions for a photo whose long edge must fit `maxEdge`, or null
 * when it already does (nothing to gain from a re-encode). Aspect ratio is
 * preserved and both sides stay ≥ 1px.
 */
export function targetSize(width, height, maxEdge) {
  if (!(width > 0) || !(height > 0)) return null;
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return null;
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** `board.heic` -> `board.jpg`; the bytes really are JPEG after the re-encode. */
export function jpegName(name) {
  const base = (name || "photo").replace(/\.[^./\\]+$/, "");
  return `${base || "photo"}.jpg`;
}

// EXIF is stripped by the re-encode, so the rotation has to be baked into the
// pixels here — `from-image` is what makes a portrait photo stay portrait.
// (The server's exif_transpose can't save us once the tag is gone.)
const createBitmap = (file) =>
  createImageBitmap(file, { imageOrientation: "from-image" });

// OffscreenCanvas where it exists (no layout, no document), <canvas> otherwise
// — Safari only got OffscreenCanvas recently and phones are the whole point.
async function encodeJpeg(bitmap, { width, height }, quality) {
  if (typeof OffscreenCanvas === "function") {
    const canvas = new OffscreenCanvas(width, height);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
    return canvas.convertToBlob({ type: "image/jpeg", quality });
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/**
 * A JPEG of `file` no larger than `maxEdge` on its long edge, or `file` itself
 * whenever shrinking wouldn't help or didn't work.
 *
 * `deps` exists for the tests; production callers pass the options only.
 */
export async function downscaleImage(
  file,
  { maxEdge = DEFAULT_MAX_EDGE, quality = JPEG_QUALITY, deps = {} } = {}
) {
  const toBitmap = deps.createBitmap || createBitmap;
  const encode = deps.encodeJpeg || encodeJpeg;
  // Videos and PDFs can reach a file input with accept="image/*" on some
  // pickers; hand anything we can't read straight through.
  if (!file || !file.type?.startsWith("image/")) return file;
  let bitmap;
  try {
    bitmap = await toBitmap(file);
    const size = targetSize(bitmap.width, bitmap.height, maxEdge);
    if (!size) return file;
    const blob = await encode(bitmap, size, quality);
    // A re-encode that isn't smaller is pure loss: it costs quality and buys
    // no upload time (screenshots and already-compressed shots do this).
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], jpegName(file.name), {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  } finally {
    bitmap?.close?.();
  }
}
