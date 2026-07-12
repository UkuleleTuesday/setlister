from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.staticfiles import StaticFiles

from .catalogue import CatalogueError, list_editions
from .models import EditionInfo, ParseResponse
from .pipeline import parse_photo
from .preprocess import ImageError
from .vision import VisionConfigError, VisionError

app = FastAPI(title="UT Whiteboard Song Request Parser")


@app.get("/healthz")
def healthz() -> dict:
    return {"ok": True}


@app.get("/api/editions")
def editions() -> dict[str, list[EditionInfo]]:
    return {"editions": list_editions()}


@app.post("/api/parse")
async def parse(
    image: UploadFile = File(...),
    edition: str = Form("current"),
) -> ParseResponse:
    data = await image.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty upload")
    try:
        return parse_photo(data, edition)
    except ImageError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except CatalogueError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    except VisionConfigError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except VisionError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


# Mounted last so API routes take precedence.
app.mount("/", StaticFiles(directory=Path(__file__).parent / "static", html=True))
