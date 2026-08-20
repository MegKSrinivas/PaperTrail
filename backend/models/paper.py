import uuid
from sqlalchemy import Column, String, DateTime
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from database import Base

# Base is the class all our models inherit from.
# SQLAlchemy uses it to keep track of every table we define.

class Paper(Base):
    __tablename__ = "papers" # actual table name in Postgres

    # Primary key - a UUID instead of an auto-incrementing integer
    # UUID better for distributed systems / avoiding ID guessing

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    title = Column(String, nullable=False) #nullable=False means required

    # ARRAY(String) stores a list of strings directly in Postgres,
    # e.g. authors = ["Jane Doe", "John Smith"]
    authors = Column(ARRAY(String), default=[])

    abstract = Column(String)  # nullable by default (optional)

    arxiv_id = Column(String, nullable=True)  # only set if paper came from ArXiv

    # "upload" or "arxiv" — tells us how the paper entered the system
    upload_source = Column(String, nullable=False)

    s3_url = Column(String, nullable=True)  # where the PDF lives in storage

    # Tracks ingestion pipeline progress: pending -> processing -> complete/failed
    ingestion_status = Column(String, default="pending")

    user_id = Column(UUID(as_uuid=True), nullable=False)  # who owns this paper

    # server_default=func.now() means Postgres sets the timestamp automatically
    # when the row is inserted — we don't have to set it in Python
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # caches the full extracted text from parse_pdf(), set once during
    # ingestion. Lets citation detection (and anything else that needs the
    # full paper text) read it directly from Postgres instead of re-parsing
    # the PDF from disk every time — which previously happened on EVERY
    # upload, once per existing paper in the library.
    full_text = Column(String, nullable=True)

    # reverse side of the Entity.papers many-to-many relationship.
    # Paper.entities to get all entities linked to this paper,
    # e.g. for the GET /papers/{id} endpoint showing extracted authors/concepts.
    entities = relationship("Entity", secondary="paper_entity", back_populates="papers")
