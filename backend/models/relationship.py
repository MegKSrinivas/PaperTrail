import uuid
from sqlalchemy import Column, String, Float, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from database import Base

class Relationship(Base):
    __tablename__ = "relationships"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # The two entities this relationship connects.
    # Both point back to the "entities" table — this is what makes it a graph edge.
    source_entity_id = Column(UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False)
    target_entity_id = Column(UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False)

    # The kind of connection between the two entities
    type = Column(String, nullable=False)  # cites/builds-on/contradicts/shares-dataset

    # How confident the LLM extraction step was about this relationship.
    # Useful later for filtering out low-confidence/noisy graph edges (e.g. only show > 0.7)
    confidence_score = Column(Float, default=1.0)