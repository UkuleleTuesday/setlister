"""Lightweight image preparation before the vision call.

Honour EXIF orientation and cap the long edge; deliberately no contrast or
sharpening tricks, which can erase faint marker strokes.
"""

import io

from PIL import Image, ImageOps, UnidentifiedImageError

from .config import get_settings


class ImageError(ValueError):
    pass


def prepare_image(data: bytes, max_edge: int | None = None) -> tuple[bytes, str]:
    """Return (jpeg_bytes, mime_type) for an orientation-corrected, resized photo."""
    max_edge = max_edge or get_settings().max_image_edge
    try:
        image = Image.open(io.BytesIO(data))
        image = ImageOps.exif_transpose(image)
        image = image.convert("RGB")
    except (UnidentifiedImageError, OSError, ValueError) as e:
        # The message travels verbatim to the UI's error box, so keep it human —
        # PIL's own text leaks internals (BytesIO reprs) that mean nothing there.
        raise ImageError(
            "Could not read that image — try taking the photo again"
        ) from e

    if max(image.size) > max_edge:
        image.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)

    out = io.BytesIO()
    image.save(out, format="JPEG", quality=85)
    return out.getvalue(), "image/jpeg"
