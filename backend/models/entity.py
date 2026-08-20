import uuid
from sqlalchemy import Column, String, Table, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from database import Base

# An "association table" — this is how SQLAlchemy models many-to-many
# relationships. It has no model class of its own, just two foreign keys.
# Each row means: "this paper mentions this entity"
paper_entity_association = Table(
    "paper_entity",
    Base.metadata,
    Column("paper_id", UUID(as_uuid=True), ForeignKey("papers.id")),
    Column("entity_id", UUID(as_uuid=True), ForeignKey("entities.id")),
)

class Entity(Base):
    __tablename__ = "entities"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    name = Column(String, nullable=False)  # e.g. "Transformer", "Yann LeCun"

    # What kind of entity this is — helps the frontend render different
    # node styles in the knowledge graph (e.g. author nodes vs concept nodes)
    type = Column(String, nullable=False)  # concept/author/dataset/institution

    # added back_populates="entities" to make this a proper
    # bidirectional relationship — SQLAlchemy now keeps entity.papers and
    # paper.entities in sync automatically when either side is modified.
    papers = relationship("Paper", secondary=paper_entity_association, back_populates="entities")