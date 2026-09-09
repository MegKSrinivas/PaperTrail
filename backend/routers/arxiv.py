from fastapi import APIRouter, Query, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db
from models.paper import Paper
from models.user import User
from routers.auth import get_current_user
from services.arxiv_service import search_arxiv, download_arxiv_pdf
from services.pipeline import run_ingestion_pipeline

router = APIRouter(prefix="/arxiv", tags=["arxiv"])


@router.get("/search")
def search(
    query: str = Query(..., description="Search terms, e.g. 'attention mechanism'"),
    max_results: int = Query(10, ge=1, le=50),
    current_user: User = Depends(get_current_user),
):
    results = search_arxiv(query, max_results=max_results)
    return {"results": results}


class AddToLibraryRequest(BaseModel):
    arxiv_id: str
    title: str
    authors: list[str]
    abstract: str
    pdf_url: str


@router.post("/add")
def add_to_library(
    request: AddToLibraryRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        saved_path = download_arxiv_pdf(request.pdf_url)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to download PDF from ArXiv: {e}")

    new_paper = Paper(
        title=request.title,
        authors=request.authors,
        abstract=request.abstract,
        arxiv_id=request.arxiv_id,
        upload_source="arxiv",
        s3_url=saved_path,
        ingestion_status="pending",
        user_id=current_user.id,
    )
    db.add(new_paper)
    db.commit()
    db.refresh(new_paper)

    run_ingestion_pipeline(db, new_paper, saved_path)
    db.refresh(new_paper)

    return {
        "id": str(new_paper.id),
        "title": new_paper.title,
        "ingestion_status": new_paper.ingestion_status,
    }
