import uuid
from sqlalchemy import Column, String, Table, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base

paper_group_association = Table(
    "paper_group",
    Base.metadata,
    Column("paper_id", UUID(as_uuid=True), ForeignKey("papers.id", ondelete="CASCADE")),
    Column("group_id", UUID(as_uuid=True), ForeignKey("paper_groups.id", ondelete="CASCADE")),
)


class PaperGroup(Base):
    __tablename__ = "paper_groups"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    papers = relationship("Paper", secondary=paper_group_association, back_populates="groups")
