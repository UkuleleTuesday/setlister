import { describe, expect, it } from "vitest";

import { DEFAULT_MAX_EDGE, downscaleImage, jpegName, targetSize } from "../downscale.js";

const photo = (over: { size?: number; name?: string; type?: string } = {}) => {
  const { size = 4_000_000, name = "IMG_0042.HEIC", type = "image/jpeg" } = over;
  const file = new File([new Uint8Array(1)], name, { type });
  // Fake the megabytes rather than allocate them.
  Object.defineProperty(file, "size", { value: size });
  return file;
};

const bitmap = (width: number, height: number): ImageBitmap => ({ width, height, close() {} });
const deps = (width: number, height: number, blobSize: number) => ({
  createBitmap: async () => bitmap(width, height),
  encodeJpeg: async () => {
    const blob = new Blob([new Uint8Array(1)], { type: "image/jpeg" });
    Object.defineProperty(blob, "size", { value: blobSize });
    return blob;
  },
});

describe("targetSize", () => {
  it("fits the long edge and keeps the aspect ratio", () => {
    expect(targetSize(4032, 3024, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(targetSize(3024, 4032, 1600)).toEqual({ width: 1200, height: 1600 });
  });

  it("is null when the photo already fits", () => {
    expect(targetSize(1600, 1200, 1600)).toBeNull();
    expect(targetSize(800, 600, 1600)).toBeNull();
  });

  it("never rounds a side down to zero on an extreme panorama", () => {
    expect(targetSize(20000, 5, 1600)!.height).toBe(1);
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

  it("defaults to the API's max edge, since scans no longer send their own", async () => {
    let asked: unknown = null;
    await downscaleImage(photo(), {
      deps: {
        createBitmap: async () => bitmap(4032, 3024),
        encodeJpeg: async (_bitmap, dims) => {
          asked = dims;
          return new Blob([]);
        },
      },
    });
    expect(DEFAULT_MAX_EDGE).toBe(1600);
    expect(asked).toEqual({ width: 1600, height: 1200 });
  });

  it("honours a custom max edge", async () => {
    let asked: unknown = null;
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
    const file = photo({ size: 200_000 });
    expect(await downscaleImage(file, { maxEdge: 1600, deps: deps(4032, 3024, 400_000) })).toBe(
      file,
    );
  });

  it("keeps the original when the browser can't decode the photo", async () => {
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

  it("keeps the original when the canvas won't read back", async () => {
    const file = photo();
    const out = await downscaleImage(file, {
      maxEdge: 1600,
      deps: { createBitmap: async () => bitmap(4032, 3024), encodeJpeg: async () => null },
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
