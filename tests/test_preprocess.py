import io

import pytest
from PIL import Image

from utrequests.preprocess import ImageError, prepare_image


def make_jpeg(width, height, exif_orientation=None) -> bytes:
    image = Image.new("RGB", (width, height), "white")
    out = io.BytesIO()
    kwargs = {}
    if exif_orientation is not None:
        exif = Image.Exif()
        exif[0x0112] = exif_orientation
        kwargs["exif"] = exif
    image.save(out, format="JPEG", **kwargs)
    return out.getvalue()


def open_result(data: bytes) -> Image.Image:
    return Image.open(io.BytesIO(data))


def test_resizes_long_edge():
    jpeg, mime = prepare_image(make_jpeg(4000, 3000), max_edge=1600)
    assert mime == "image/jpeg"
    result = open_result(jpeg)
    assert max(result.size) == 1600
    assert result.size == (1600, 1200)  # aspect ratio preserved


def test_small_image_not_upscaled():
    jpeg, _ = prepare_image(make_jpeg(800, 600), max_edge=1600)
    assert open_result(jpeg).size == (800, 600)


def test_exif_orientation_applied():
    # orientation 6 = rotate 90 CW: a landscape source becomes portrait
    jpeg, _ = prepare_image(make_jpeg(400, 200, exif_orientation=6), max_edge=1600)
    assert open_result(jpeg).size == (200, 400)


def test_garbage_input_raises_image_error():
    with pytest.raises(ImageError):
        prepare_image(b"not an image")
