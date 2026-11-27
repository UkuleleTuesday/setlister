"""Image preparation before the vision call.

Deliberately no contrast or sharpening: they can erase faint marker strokes.
"""

import io

from PIL import Image, ImageOps, UnidentifiedImageError

from .config import get_settings


class ImageError(ValueError):
    pass


def prepare_image(data: bytes, max_edge: int | None = None) -> tuple[bytes, str]:
    max_edge = max_edge or get_settings().max_image_edge
    try:
        image = Image.open(io.BytesIO(data))
        image = ImageOps.exif_transpose(image)
        image = image.convert("RGB")
    except (UnidentifiedImageError, OSError, ValueError) as e:
        # Shown verbatim in the UI; PIL's own text leaks BytesIO reprs.
        raise ImageError("Could not read that image. Try taking the photo again") from e

    if max(image.size) > max_edge:
        image.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)

    out = io.BytesIO()
    image.save(out, format="JPEG", quality=85)
    return out.getvalue(), "image/jpeg"
