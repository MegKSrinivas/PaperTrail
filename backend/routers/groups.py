from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db
from models.paper import Paper
from models.paper_group import PaperGroup
from models.user import User
from routers.auth import get_current_user

router = APIRouter(prefix="/groups", tags=["groups"])


class CreateGroupRequest(BaseModel):
    name: str


class RenameGroupRequest(BaseModel):
    name: str


def _group_or_404(db: Session, group_id: str, user_id) -> PaperGroup:
    g = db.query(PaperGroup).filter(
        PaperGroup.id == group_id,
        PaperGroup.user_id == user_id,
    ).first()
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    return g


def _serialize(g: PaperGroup) -> dict:
    return {
        "id": str(g.id),
        "name": g.name,
        "created_at": g.created_at.isoformat() if g.created_at else None,
        "paper_ids": [str(p.id) for p in g.papers],
    }


@router.get("/")
def list_groups(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    groups = (
        db.query(PaperGroup)
        .filter(PaperGroup.user_id == current_user.id)
        .order_by(PaperGroup.created_at)
        .all()
    )
    return [_serialize(g) for g in groups]


@router.post("/")
def create_group(
    request: CreateGroupRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    g = PaperGroup(name=request.name.strip(), user_id=current_user.id)
    db.add(g)
    db.commit()
    db.refresh(g)
    return _serialize(g)


@router.patch("/{group_id}")
def rename_group(
    group_id: str,
    request: RenameGroupRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    g = _group_or_404(db, group_id, current_user.id)
    g.name = request.name.strip()
    db.commit()
    db.refresh(g)
    return _serialize(g)


@router.delete("/{group_id}", status_code=204)
def delete_group(
    group_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    g = _group_or_404(db, group_id, current_user.id)
    db.delete(g)
    db.commit()


class AddPaperRequest(BaseModel):
    paper_id: str


@router.post("/{group_id}/papers")
def add_paper(
    group_id: str,
    request: AddPaperRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    g = _group_or_404(db, group_id, current_user.id)
    paper = db.query(Paper).filter(
        Paper.id == request.paper_id,
        Paper.user_id == current_user.id,
    ).first()
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
    if paper not in g.papers:
        g.papers.append(paper)
        db.commit()
    db.refresh(g)
    return _serialize(g)


@router.delete("/{group_id}/papers/{paper_id}", status_code=204)
def remove_paper(
    group_id: str,
    paper_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    g = _group_or_404(db, group_id, current_user.id)
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if paper and paper in g.papers:
        g.papers.remove(paper)
        db.commit()
