from fastapi import APIRouter
from pydantic import BaseModel

from services.research import hybrid_search, rerank_chunks, generate_answer

router = APIRouter(prefix="/research", tags=["research"])


# Pydantic model defines the expected shape of the request body.
# FastAPI uses this to auto-validate incoming JSON and auto-generate
# the /docs schema — if a request is missing "query", FastAPI rejects
# it before our code even runs.
class QueryRequest(BaseModel):
    query: str
    paper_id: str | None = None  # optional — restrict search to one paper
    top_k: int = 5


@router.post("/query")
def query_research(request: QueryRequest):
    """
    Full RAG pipeline in one endpoint:
    1. hybrid_search — pull a wide pool of candidate chunks (vector + BM25)
    2. rerank_chunks — narrow down to the most relevant, using a cross-encoder
    3. generate_answer — synthesize a grounded answer with citations
    """
    # Pull a wider candidate pool than we'll actually use, so reranking
    # has enough options to meaningfully reorder
    candidates = hybrid_search(request.query, top_k=request.top_k * 2, paper_id=request.paper_id)

    # Narrow down to the best matches using the cross-encoder reranker
    reranked = rerank_chunks(request.query, candidates, top_n=request.top_k)

    # Generate the final answer using only the reranked, most-relevant chunks
    result = generate_answer(request.query, reranked)

    return result