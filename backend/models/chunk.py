import uuid
from sqlalchemy import Column, String, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from database import Base

class Chunk(Base):
    __tablename__ = "chunks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # ForeignKey links this chunk to the paper it came from.
    # "papers.id" refers to the id column on the Paper model's table.
    paper_id = Column(UUID(as_uuid=True), ForeignKey("papers.id"), nullable=False)

    content = Column(String, nullable=False)  # the actual text of this chunk

    # Chunks are ordered within a paper (chunk 0, chunk 1, chunk 2...)
    # so we can reconstruct the original order or show context around a match
    chunk_index = Column(Integer, nullable=False)

    # Which section of the paper this chunk came from —
    # helps the Research Agent weigh results (e.g. "Results" section
    # might matter more than "Related Work" for some queries)
    section_type = Column(String)  # abstract/intro/methods/results/discussion

    # This is NOT the embedding itself — it's an ID/reference pointing to
    # where the actual vector lives in ChromaDB or Pinecone.
    # Postgres stores structured metadata; the vector DB stores the vectors.
    embedding_id = Column(String)