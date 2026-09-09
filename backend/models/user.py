import uuid
from sqlalchemy import Column, String, Boolean, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Google's permanent unique ID for this account — the reliable way to
    # identify "this is the same person" across sign-ins, since email
    # addresses can technically change but this ID never does.
    google_id = Column(String, unique=True, nullable=False)

    email = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=True)
    picture_url = Column(String, nullable=True)  # profile photo, from Google

    # Lets you (the project owner) distinguish yourself from any other
    # person who signs in — useful for a "delete other users" admin action,
    # or for restricting certain actions to just you later if needed.
    is_admin = Column(Boolean, default=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())