# Importing all models here ensures SQLAlchemy always has every mapped
# class registered before any relationship gets resolved — regardless of
# which specific model file happens to be the entry point for a given
# script. Without this, a script that only imports e.g. models.entity
# (without models.paper) can crash with "failed to locate a name" errors,
# since Entity.papers references "Paper" as a string that SQLAlchemy only
# resolves lazily, once every model is confirmed to be loaded.
from models.paper import Paper
from models.chunk import Chunk
from models.entity import Entity
from models.relationship import Relationship
from models.user import User
from models.paper_group import PaperGroup