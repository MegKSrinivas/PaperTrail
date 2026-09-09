from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models.paper import Paper
from models.chunk import Chunk
from models.user import User
from routers.auth import get_current_user
from services.pipeline import run_ingestion_pipeline
from services.ingestion import index as pinecone_index
from services import storage

router = APIRouter(prefix="/papers", tags=["papers"])


@router.post("/upload")
async def upload_paper(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    data = await file.read()
    r2_key = storage.upload_bytes(data, file.filename)

    new_paper = Paper(
        title=file.filename,
        authors=[],
        abstract=None,
        upload_source="upload",
        s3_url=r2_key,
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


@router.get("/")
def list_papers(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    papers = db.query(Paper).filter(Paper.user_id == current_user.id).order_by(Paper.created_at.desc()).all()
    return [
        {
            "id": str(p.id),
            "title": p.title,
            "authors": p.authors,
            "abstract": p.abstract,
            "arxiv_id": p.arxiv_id,
            "upload_source": p.upload_source,
            "ingestion_status": p.ingestion_status,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        }
        for p in papers
    ]


@router.delete("/{paper_id}", status_code=204)
def delete_paper(
    paper_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    paper = db.query(Paper).filter(
        Paper.id == paper_id,
        Paper.user_id == current_user.id,
    ).first()
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")

    # remove vectors from Pinecone
    chunks = db.query(Chunk).filter(Chunk.paper_id == paper.id).all()
    embedding_ids = [c.embedding_id for c in chunks if c.embedding_id]
    if embedding_ids:
        try:
            pinecone_index.delete(ids=embedding_ids)
        except Exception as e:
            print(f"Pinecone delete warning: {e}")

    # delete PDF from R2
    if paper.s3_url:
        try:
            storage.delete(paper.s3_url)
        except Exception as e:
            print(f"R2 delete warning: {e}")

    # delete chunk rows (no cascade on FK)
    db.query(Chunk).filter(Chunk.paper_id == paper.id).delete()

    # many-to-many associations (paper_entity, paper_group) are cleared
    # automatically when we delete the Paper row because SQLAlchemy
    # issues DELETEs on the junction tables before removing the parent.
    db.delete(paper)
    db.commit()


@router.get("/{paper_id}")
def get_paper(
    paper_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")

    return {
        "id": str(paper.id),
        "title": paper.title,
        "authors": paper.authors,
        "abstract": paper.abstract,
        "upload_source": paper.upload_source,
        "ingestion_status": paper.ingestion_status,
        "created_at": paper.created_at.isoformat() if paper.created_at else None,
        "entities": [
            {"name": e.name, "type": e.type} for e in paper.entities
        ],
    }
