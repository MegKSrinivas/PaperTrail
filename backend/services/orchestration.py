from typing import TypedDict
from langgraph.graph import StateGraph, START, END

from services.research import hybrid_search, rerank_chunks, generate_answer


class ResearchState(TypedDict):
    """
    The shared state object that flows through the graph. Each node reads
    what it needs from this and returns a dict of only the fields it's
    updating — LangGraph merges those into the state automatically, so a
    node never has to pass along fields it didn't touch.
    """
    query: str
    paper_id: str | None
    top_k: int
    candidates: list[dict]   # set by the search node
    reranked: list[dict]     # set by the rerank node
    answer: str               # set by the generate node
    provider: str              # set by the generate node
    sources: list[dict]        # set by the generate node


def search_node(state: ResearchState) -> dict:
    """
    Node 1: runs hybrid search (vector + BM25) to pull a wide pool of
    candidate chunks. Requests double the final top_k, since reranking
    works best with a larger pool to choose from.
    """
    candidates = hybrid_search(
        state["query"],
        top_k=state["top_k"] * 2,
        paper_id=state.get("paper_id"),
    )
    return {"candidates": candidates}


def rerank_node(state: ResearchState) -> dict:
    """
    Node 2: narrows the candidate pool down to the most relevant chunks
    using Cohere's cross-encoder reranker.
    """
    reranked = rerank_chunks(
        state["query"],
        state["candidates"],
        top_n=state["top_k"],
    )
    return {"reranked": reranked}


def generate_node(state: ResearchState) -> dict:
    """
    Node 3: synthesizes a final answer from the reranked chunks, with
    citations pointing back to specific excerpts.
    """
    result = generate_answer(state["query"], state["reranked"])
    return {
        "answer": result["answer"],
        "provider": result["provider"],
        "sources": result["sources"],
    }


# Build the graph: three nodes wired in a straight line.
# This is intentionally simple for now — a linear pipeline expressed as a
# graph. The payoff comes later, when we can add conditional edges (e.g.
# skip reranking for very short queries) without restructuring the code.
builder = StateGraph(ResearchState)
builder.add_node("search", search_node)
builder.add_node("rerank", rerank_node)
builder.add_node("generate", generate_node)

builder.add_edge(START, "search")
builder.add_edge("search", "rerank")
builder.add_edge("rerank", "generate")
builder.add_edge("generate", END)

research_graph = builder.compile()


def run_research_graph(query: str, top_k: int = 5, paper_id: str = None) -> dict:
    """
    Entry point for the rest of the app to call. Runs the full graph and
    returns the final state, which contains the answer, provider, and sources.
    """
    initial_state: ResearchState = {
        "query": query,
        "paper_id": paper_id,
        "top_k": top_k,
        "candidates": [],
        "reranked": [],
        "answer": "",
        "provider": "",
        "sources": [],
    }

    final_state = research_graph.invoke(initial_state)

    return {
        "answer": final_state["answer"],
        "provider": final_state["provider"],
        "sources": final_state["sources"],
    }