from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

router = APIRouter(tags=["documentation"])

PDF_PATH = Path(__file__).resolve().parents[3] / "data" / "docs" / "doc.pdf"


@router.get("/documentation/doc.pdf")
async def ustavy_pdf() -> FileResponse:
    if not PDF_PATH.is_file():
        raise HTTPException(404, "Файл устава не найден")
    return FileResponse(
        PDF_PATH,
        media_type="application/pdf",
        filename="doc.pdf",
        content_disposition_type="inline",
    )
