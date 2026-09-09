import os
from sqlalchemy.orm import Session
from models.paper import Paper
from models.chunk import Chunk
from services.ingestion import (
    parse_pdf, chunk_text, embed_texts, store_chunks,
    extract_entities, store_entities,
)
from services.graph import extract_relationships, store_relationships, detect_citations, store_citations
from services.storage import download_to_tempfile


def run_ingestion_pipeline(db: Session, paper: Paper, pdf_path: str) -> None:
    """
    Full ingestion pipeline: parse �� chunk → embed → store vectors + Chunk
    rows → extract entities → store → extract relationships → store →
    detect citations → store → mark complete.

    Updates paper.ingestion_status in-place. The paper row must already be
    committed before calling this (so its ID exists for foreign keys).
    """
    paper.ingestion_status = "processing"
    db.commit()

    try:
        tmp_path = download_to_tempfile(pdf_path)
        try:
            text = parse_pdf(tmp_path)
        finally:
            os.remove(tmp_path)
        paper.full_text = text

        chunks = chunk_text(text)
        embeddings, _provider = embed_texts(chunks)
        chroma_ids = store_chunks(str(paper.id), chunks, embeddings)

        for i, (chunk_content, chroma_id) in enumerate(zip(chunks, chroma_ids)):
            db_chunk = Chunk(
                paper_id=paper.id,
                content=chunk_content,
                chunk_index=i,
                section_type=None,
                embedding_id=chroma_id,
            )
            db.add(db_chunk)

        entities = extract_entities(text)
        saved_entities = store_entities(db, paper, entities)

        entity_names = [e.name for e in saved_entities]
        relationships = extract_relationships(text, entity_names)
        store_relationships(db, relationships)

        citations = detect_citations(db, paper)
        store_citations(db, citations)

        paper.ingestion_status = "complete"
        db.commit()

    except Exception as e:
        paper.ingestion_status = "failed"
        db.commit()
        print(f"Ingestion failed for paper {paper.id}: {e}")
