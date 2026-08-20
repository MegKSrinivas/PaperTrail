import os
import uuid
import shutil
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models.paper import Paper
from models.chunk import Chunk
from services.ingestion import (
    parse_pdf,
    chunk_text,
    embed_texts,
    store_chunks,
    extract_entities,
    store_entities,
)
from services.graph import extract_relationships, store_relationships, detect_citations, store_citations

router = APIRouter(prefix="/papers", tags=["papers"])

STORAGE_DIR = "storage"
os.makedirs(STORAGE_DIR, exist_ok=True)


@router.post("/upload")
def upload_paper(file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    file_id = uuid.uuid4()
    saved_filename = f"{file_id}.pdf"
    saved_path = os.path.join(STORAGE_DIR, saved_filename)

    with open(saved_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    new_paper = Paper(
        title=file.filename,
        authors=[],
        abstract=None,
        upload_source="upload",
        s3_url=saved_path,
        ingestion_status="pending",
        user_id=uuid.uuid4(),
    )
    db.add(new_paper)
    db.commit()
    db.refresh(new_paper)

    try:
        # Mark as processing so the frontend can show a progress state later
        new_paper.ingestion_status = "processing"
        db.commit()

        # 1. Parse the PDF into raw text
        text = parse_pdf(saved_path)
        new_paper.full_text = text

        # 2. Split the text into semantic chunks
        chunks = chunk_text(text)

        # 3. Embed all chunks (Cohere primary, Gemini fallback)
        embeddings, provider = embed_texts(chunks)

        # 4. Store the chunk text + vectors in ChromaDB
        chroma_ids = store_chunks(str(new_paper.id), chunks, embeddings)

        # 5. Save one Chunk row per chunk in Postgres, linking to its ChromaDB id
        for i, (chunk_content, chroma_id) in enumerate(zip(chunks, chroma_ids)):
            db_chunk = Chunk(
                paper_id=new_paper.id,
                content=chunk_content,
                chunk_index=i,
                section_type=None,  # we'll add section detection in a later step
                embedding_id=chroma_id,
            )
            db.add(db_chunk)

        # 6. Extract entities (authors, institutions, concepts, datasets)
        # and link them to this paper
        entities = extract_entities(text)
        saved_entities = store_entities(db, new_paper, entities)  # FIXED: now captures the return value

        # 6b. Extract relationships between the entities we just found
        entity_names = [e.name for e in saved_entities]
        relationships = extract_relationships(text, entity_names)
        store_relationships(db, relationships)

        # 6c. Check if this new paper cites any papers already in the library
        citations = detect_citations(db, new_paper)
        store_citations(db, citations)

        # 7. Mark ingestion complete
        new_paper.ingestion_status = "complete"
        db.commit()

    except Exception as e:
        # If anything in the pipeline fails, mark the paper as failed
        # rather than leaving it stuck at "processing" forever
        new_paper.ingestion_status = "failed"
        db.commit()
        print(f"Ingestion failed for paper {new_paper.id}: {e}")

    db.refresh(new_paper)

    return {
        "id": str(new_paper.id),
        "title": new_paper.title,
        "ingestion_status": new_paper.ingestion_status,
    }


@router.get("/")
def list_papers(db: Session = Depends(get_db)):
    """
    Returns all papers in the library, most recently uploaded first.
    This is what the frontend's PaperUploader/library sidebar will call
    to render the list of papers and their ingestion status.
    """
    papers = db.query(Paper).order_by(Paper.created_at.desc()).all()
    return [
        {
            "id": str(p.id),
            "title": p.title,
            "authors": p.authors,
            "abstract": p.abstract,
            "upload_source": p.upload_source,
            "ingestion_status": p.ingestion_status,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        }
        for p in papers
    ]


@router.get("/{paper_id}")
def get_paper(paper_id: str, db: Session = Depends(get_db)):
    """
    Returns details for a single paper, including its extracted entities —
    useful for a paper detail view in the frontend.
    """
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