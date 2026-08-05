// On-device downscaling before upload (#44). The decisions under test: what
// size a photo is shrunk to, when shrinking is skipped, and — the important
// one — that every failure hands the ORIGINAL file back instead of breaking
// the scan.
import { describe, expect, it } from "vitest";

import {
  DEFAULT_MAX_EDGE,
  downscaleImage,
  jpegName,
  resolveMaxEdge,
  targetSize,
} from "../downscale.js";

const photo = (over = {}) => {
  const { size = 4_000_000, name = "IMG_0042.HEIC", type = "image/jpeg" } = over;
  const file = new File([new Uint8Array(1)], name, { type });
  // File.size follows the bytes; fake the megabytes rather than allocate them.
  Object.defineProperty(file, "size", { value: size });
  return file;
};

// A stand-in for what createImageBitmap returns, plus the encoder that would
// draw it — the two browser bits downscaleImage takes as deps.
const bitmap = (width, height) => ({ width, height, close() {} });
const deps = (width, height, blobSize) => ({
  createBitmap: async () => bitmap(width, height),
  encodeJpeg: async () => {
    const blob = new Blob([new Uint8Array(1)], { type: "image/jpeg" });
    Object.defineProperty(blob, "size", { value: blobSize });
    return blob;
  },
});

describe("resolveMaxEdge", () => {
  it("falls back to the server's own default when the field is blank", () => {
    expect(resolveMaxEdge("")).toBe(DEFAULT_MAX_EDGE);
    expect(resolveMaxEdge(undefined)).toBe(DEFAULT_MAX_EDGE);
    expect(resolveMaxEdge("not a number")).toBe(DEFAULT_MAX_EDGE);
    expect(resolveMaxEdge("0")).toBe(DEFAULT_MAX_EDGE);
  });

  it("clamps to the range the API accepts, so client and server agree", () => {
    expect(resolveMaxEdge("64")).toBe(256);
    expect(resolveMaxEdge("99999")).toBe(4096);
    expect(resolveMaxEdge("2048")).toBe(2048);
  });
});

describe("targetSize", () => {
  it("fits the long edge and keeps the aspect ratio", () => {
    expect(targetSize(4032, 3024, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(targetSize(3024, 4032, 1600)).toEqual({ width: 1200, height: 1600 });
  });

  it("is null when the photo already fits — a re-encode would only cost quality", () => {
    expect(targetSize(1600, 1200, 1600)).toBeNull();
    expect(targetSize(800, 600, 1600)).toBeNull();
  });

  it("never rounds a side down to zero on an extreme panorama", () => {
    expect(targetSize(20000, 5, 1600).height).toBe(1);
  });

  it("is null for a bitmap with no dimensions", () => {
    expect(targetSize(0, 0, 1600)).toBeNull();
  });
});

describe("jpegName", () => {
  it("re-extensions the file, because the bytes really are JPEG now", () => {
    expect(jpegName("IMG_0042.HEIC")).toBe("IMG_0042.jpg");
    expect(jpegName("board")).toBe("board.jpg");
    expect(jpegName("")).toBe("photo.jpg");
    expect(jpegName(undefined)).toBe("photo.jpg");
  });
});

describe("downscaleImage", () => {
  it("shrinks an oversized photo to the requested edge", async () => {
    const file = photo({ size: 4_000_000 });
    const out = await downscaleImage(file, {
      maxEdge: 1600,
      deps: deps(4032, 3024, 300_000),
    });
    expect(out).not.toBe(file);
    expect(out.type).toBe("image/jpeg");
    expect(out.name).toBe("IMG_0042.jpg");
    expect(out.size).toBe(300_000);
  });

  it("honours a custom max edge from settings", async () => {
    let asked = null;
    await downscaleImage(photo(), {
      maxEdge: 1024,
      deps: {
        createBitmap: async () => bitmap(4032, 3024),
        encodeJpeg: async (_bitmap, dims) => {
          asked = dims;
          return new Blob([]);
        },
      },
    });
    expect(asked).toEqual({ width: 1024, height: 768 });
  });

  it("keeps the original when the photo already fits", async () => {
    const file = photo();
    expect(await downscaleImage(file, { maxEdge: 1600, deps: deps(1200, 900, 1) })).toBe(file);
  });

  it("keeps the original when the re-encode isn't actually smaller", async () => {
    // Screenshots and already-compressed shots do this: re-encoding would lose
    // detail and buy no upload time.
    const file = photo({ size: 200_000 });
    expect(
      await downscaleImage(file, { maxEdge: 1600, deps: deps(4032, 3024, 400_000) })
    ).toBe(file);
  });

  it("keeps the original when the browser can't decode the photo", async () => {
    // The real failure this guards: no createImageBitmap, a tainted canvas, a
    // HEIC the decoder refuses. A scan must never fail because the shrink did.
    const file = photo();
    const out = await downscaleImage(file, {
      maxEdge: 1600,
      deps: {
        createBitmap: async () => {
          throw new Error("decode failed");
        },
      },
    });
    expect(out).toBe(file);
  });

  it("passes non-images straight through", async () => {
    const file = photo({ name: "clip.mov", type: "video/quicktime" });
    expect(await downscaleImage(file, { deps: deps(4032, 3024, 1) })).toBe(file);
  });

  it("releases the bitmap even when encoding blows up", async () => {
    let closed = false;
    await downscaleImage(photo(), {
      maxEdge: 1600,
      deps: {
        createBitmap: async () => ({
          width: 4032,
          height: 3024,
          close: () => {
            closed = true;
          },
        }),
        encodeJpeg: async () => {
          throw new Error("canvas is gone");
        },
      },
    });
    expect(closed).toBe(true);
  });
});
