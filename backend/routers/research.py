from fastapi import APIRouter, Depends
from pydantic import BaseModel

from services.orchestration import run_research_graph
from routers.auth import get_current_user
from models.user import User

router = APIRouter(prefix="/research", tags=["research"])


class QueryRequest(BaseModel):
    query: str
    paper_id: str | None = None
    top_k: int = 5


@router.post("/query")
def query_research(
    request: QueryRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Runs the full RAG pipeline via the LangGraph research graph:
    search -> rerank -> generate. See services/orchestration.py for the
    graph definition. Requires a valid session token.
    """
    result = run_research_graph(
        query=request.query,
        top_k=request.top_k,
        paper_id=request.paper_id,
    )
    return result