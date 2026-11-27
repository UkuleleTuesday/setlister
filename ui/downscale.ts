// An optimisation, never a gate: every failure returns the original file for
// the server to resize, so a scan never fails because the shrink did.

/** Matches the API's own default and the settings field's placeholder. */
export const DEFAULT_MAX_EDGE = 1600;
/** Matches `image.save(..., quality=85)` in utrequests/preprocess.py. */
const JPEG_QUALITY = 0.85;
/** The bounds the API clamps `max_image_edge` to (utrequests/api.py). */
const MIN_EDGE = 256;
const MAX_EDGE = 4096;

// Clamped like the API, so client and server agree on the size.
export function resolveMaxEdge(value: unknown): number {
  const edge = Math.round(Number(value));
  if (!Number.isFinite(edge) || edge <= 0) return DEFAULT_MAX_EDGE;
  return Math.min(Math.max(edge, MIN_EDGE), MAX_EDGE);
}

export function targetSize(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } | null {
  if (!(width > 0) || !(height > 0)) return null;
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return null;
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function jpegName(name: string | null | undefined): string {
  const base = (name || "photo").replace(/\.[^./\\]+$/, "");
  return `${base || "photo"}.jpg`;
}

type Size = { width: number; height: number };

export interface DownscaleDeps {
  createBitmap?: (file: File) => Promise<ImageBitmap>;
  encodeJpeg?: (bitmap: ImageBitmap, size: Size, quality: number) => Promise<Blob | null>;
}

// The re-encode strips EXIF, so bake the rotation into the pixels: the server's
// exif_transpose can't once the tag is gone.
const createBitmap = (file: File) => createImageBitmap(file, { imageOrientation: "from-image" });

// <canvas> fallback for older Safari, which lacks OffscreenCanvas. A missing 2D
// context throws on the `!`, which downscaleImage() turns into the original.
async function encodeJpeg(
  bitmap: ImageBitmap,
  { width, height }: Size,
  quality: number,
): Promise<Blob | null> {
  if (typeof OffscreenCanvas === "function") {
    const canvas = new OffscreenCanvas(width, height);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
    return canvas.convertToBlob({ type: "image/jpeg", quality });
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

export async function downscaleImage(
  file: File,
  {
    maxEdge = DEFAULT_MAX_EDGE,
    quality = JPEG_QUALITY,
    deps = {},
  }: { maxEdge?: number; quality?: number; deps?: DownscaleDeps } = {},
): Promise<File> {
  const toBitmap = deps.createBitmap || createBitmap;
  const encode = deps.encodeJpeg || encodeJpeg;
  // Some pickers let videos and PDFs past accept="image/*".
  if (!file || !file.type?.startsWith("image/")) return file;
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await toBitmap(file);
    const size = targetSize(bitmap.width, bitmap.height, maxEdge);
    if (!size) return file;
    const blob = await encode(bitmap, size, quality);
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
