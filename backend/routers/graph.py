from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models.entity import Entity, paper_entity_association
from models.relationship import Relationship
from models.paper import Paper
from models.paper_group import PaperGroup
from models.user import User
from routers.auth import get_current_user

router = APIRouter(prefix="/graph", tags=["graph"])


@router.get("/data")
def get_graph_data(
    group_id: str = Query(..., description="Paper group ID to scope the graph to"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    group = db.query(PaperGroup).filter(
        PaperGroup.id == group_id,
        PaperGroup.user_id == current_user.id,
    ).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    paper_ids = [p.id for p in group.papers]
    if not paper_ids:
        return {"entities": [], "relationships": []}

    entity_id_rows = (
        db.query(paper_entity_association.c.entity_id)
        .filter(paper_entity_association.c.paper_id.in_(paper_ids))
        .distinct()
        .all()
    )
    entity_ids = [row[0] for row in entity_id_rows]

    if not entity_ids:
        return {"entities": [], "relationships": []}

    entities = db.query(Entity).filter(Entity.id.in_(entity_ids)).all()

    relationships = (
        db.query(Relationship)
        .filter(
            Relationship.source_entity_id.in_(entity_ids),
            Relationship.target_entity_id.in_(entity_ids),
        )
        .all()
    )

    return {
        "entities": [
            {"id": str(e.id), "name": e.name, "type": e.type}
            for e in entities
        ],
        "relationships": [
            {
                "id": str(r.id),
                "source_id": str(r.source_entity_id),
                "target_id": str(r.target_entity_id),
                "type": r.type,
                "confidence": r.confidence_score,
            }
            for r in relationships
        ],
    }
