from services.ingestion import embed_texts, index, co, gemini_client
import cohere
import os
from sqlalchemy.orm import Session
from database import SessionLocal
from models.chunk import Chunk
from rank_bm25 import BM25Okapi

# CHANGED: Cohere's chat endpoint now uses ClientV2 with a "messages" list
# (OpenAI-style), replacing the older single "message" string param used
# by the legacy Client (which we still use for embeddings, unaffected).
co_v2 = cohere.ClientV2(os.getenv("COHERE_API_KEY"))


def vector_search(query: str, top_k: int = 5, paper_id: str = None) -> list[dict]:
    """
    Embeds the user's query and searches ChromaDB for the most semantically
    similar chunks. Optionally restrict to a single paper via paper_id.
    Returns a list of dicts with the chunk text, its metadata, and a
    relevance score (lower distance = more relevant).
    """
    # Embed the query using "search_query" mode — this tells Cohere/Gemini
    # this text is a question, not a document, which improves matching
    query_embedding, provider = embed_texts([query], input_type="search_query")

    # Pinecone filter syntax uses $eq operator
    pinecone_filter = {"paper_id": {"$eq": paper_id}} if paper_id else None

    results = index.query(
        vector=query_embedding[0],
        top_k=top_k,
        filter=pinecone_filter,
        include_metadata=True,
    )

    # Pinecone returns ScoredVector objects; score is cosine similarity (higher = more similar).
    # We store it as "distance" to keep the downstream hybrid_search logic unchanged
    # (it normalises both signals the same way regardless of direction).
    chunks = []
    for match in results.matches:
        chunks.append({
            "chunk_id": match.id,
            "text": match.metadata.get("text", ""),
            "paper_id": match.metadata.get("paper_id", ""),
            "chunk_index": match.metadata.get("chunk_index", 0),
            "distance": 1 - match.score,  # convert similarity → distance to stay compatible
        })

    return chunks


def keyword_search(query: str, top_k: int = 5, paper_id: str = None) -> list[dict]:
    """
    Scores every chunk in Postgres against the query using BM25 (classic
    keyword-overlap ranking, not semantic). Good at catching exact matches
    — paper titles, author names, dataset names — that vector search can miss.

    Note: rebuilds the BM25 index from scratch on every call. Fine at this
    project's scale (dozens-hundreds of chunks); a production system would
    maintain a persistent BM25 index instead.
    """
    db: Session = SessionLocal()
    try:
        q = db.query(Chunk)
        if paper_id:
            q = q.filter(Chunk.paper_id == paper_id)
        all_chunks = q.all()

        if not all_chunks:
            return []

        # BM25 needs "tokenized" text — a list of lowercase words per chunk.
        # This is a simple whitespace split; good enough for English text.
        tokenized_corpus = [c.content.lower().split() for c in all_chunks]
        bm25 = BM25Okapi(tokenized_corpus)

        tokenized_query = query.lower().split()
        scores = bm25.get_scores(tokenized_query)  # one score per chunk, higher = more relevant

        # Pair each chunk with its score, sort highest-first, keep top_k
        scored_chunks = sorted(zip(all_chunks, scores), key=lambda x: x[1], reverse=True)[:top_k]

        results = []
        for chunk, score in scored_chunks:
            results.append({
                "chunk_id": chunk.embedding_id,
                "text": chunk.content,
                "paper_id": str(chunk.paper_id),
                "chunk_index": chunk.chunk_index,
                "bm25_score": float(score),
            })
        return results
    finally:
        db.close()


def hybrid_search(query: str, top_k: int = 5, paper_id: str = None,
                   vector_weight: float = 0.6, keyword_weight: float = 0.4) -> list[dict]:
    """
    Combines vector search (semantic) and BM25 (keyword) into one ranked list.
    vector_weight + keyword_weight should sum to 1.0 — these control how much
    each method influences the final ranking. Default 0.6/0.4 favors semantic
    understanding slightly, while still rewarding exact keyword matches.
    """
    # Pull a larger pool from each method than we'll actually return —
    # this gives the merge step more candidates to work with, so a chunk
    # that ranks decently on BOTH methods can surface even if it wasn't
    # top-1 on either individually.
    pool_size = top_k * 3

    vector_results = vector_search(query, top_k=pool_size, paper_id=paper_id)
    keyword_results = keyword_search(query, top_k=pool_size, paper_id=paper_id)

    # --- Normalize vector distances to a 0-1 "similarity" score ---
    # Distance is lower-is-better; we flip it so higher-is-better, like BM25.
    if vector_results:
        distances = [r["distance"] for r in vector_results]
        min_d, max_d = min(distances), max(distances)
        for r in vector_results:
            # avoid divide-by-zero if all distances are identical
            r["norm_score"] = 1 - ((r["distance"] - min_d) / (max_d - min_d + 1e-9))

    # --- Normalize BM25 scores to 0-1 the same way ---
    if keyword_results:
        scores = [r["bm25_score"] for r in keyword_results]
        min_s, max_s = min(scores), max(scores)
        for r in keyword_results:
            r["norm_score"] = (r["bm25_score"] - min_s) / (max_s - min_s + 1e-9)

    # --- Merge: combine scores for chunks that appear in both lists ---
    combined = {}  # chunk_id -> merged result dict

    for r in vector_results:
        combined[r["chunk_id"]] = {
            **r,
            "hybrid_score": r["norm_score"] * vector_weight,
        }

    for r in keyword_results:
        if r["chunk_id"] in combined:
            # Chunk showed up in BOTH searches — add the keyword contribution
            combined[r["chunk_id"]]["hybrid_score"] += r["norm_score"] * keyword_weight
        else:
            # Chunk only showed up in keyword search
            combined[r["chunk_id"]] = {
                **r,
                "hybrid_score": r["norm_score"] * keyword_weight,
            }

    # Sort by combined score, highest first, return top_k
    ranked = sorted(combined.values(), key=lambda x: x["hybrid_score"], reverse=True)
    return ranked[:top_k]


def generate_answer(query: str, chunks: list[dict]) -> dict:
    """
    Sends the user's query + retrieved chunks to an LLM, instructed to
    answer ONLY using the provided context and cite which chunk each
    claim comes from. Tries Cohere first, falls back to Gemini on failure.
    Returns a dict with the answer text, which provider generated it,
    and the source chunks used (for displaying citations in the UI).
    """
    context_block = "\n\n".join(
        f"[{i+1}] (from paper {c['paper_id']}, chunk {c['chunk_index']}):\n{c['text']}"
        for i, c in enumerate(chunks)
    )

    prompt = f"""You are a research assistant answering questions using ONLY the provided excerpts from academic papers. Do not use any outside knowledge.

Excerpts:
{context_block}

Question: {query}

Instructions:
- Answer using only the excerpts above.
- After each claim, cite the excerpt number in brackets, e.g. [1].
- If the excerpts don't contain enough information to answer, say so clearly instead of guessing.

Answer:"""

    try:
        response = co_v2.chat(
            model="command-r-plus-08-2024",
            messages=[{"role": "user", "content": prompt}],
        )
        answer_text = response.message.content[0].text
        provider = "cohere"
    except Exception as e:
        print(f"Cohere generation failed ({e}), falling back to Gemini...")
        response = gemini_client.models.generate_content(
            model="gemini-3.6-flash",  # gemini-2.5-flash is being retired for new API keys
            contents=prompt,
        )
        answer_text = response.text
        provider = "gemini"

    return {
        "answer": answer_text,
        "provider": provider,
        "sources": chunks,
    }


def rerank_chunks(query: str, chunks: list[dict], top_n: int = 5) -> list[dict]:
    """
    Takes a list of candidate chunks (e.g. from hybrid_search) and reorders
    them using Cohere's rerank model — a cross-encoder that looks at the
    query and each chunk TOGETHER, rather than comparing them indirectly
    via embeddings or keyword overlap. This is the standard RAG pattern:
    retrieve broadly, rerank tightly, send only the best to the LLM.
    """
    if not chunks:
        return []

    documents = [c["text"] for c in chunks]

    response = co_v2.rerank(
        query=query,
        documents=documents,
        top_n=top_n,
        model="rerank-v3.5",
    )

    # response.results is ordered best-to-worst, each with .index (position
    # in the original `chunks` list we sent) and .relevance_score (0-1)
    reranked = []
    for result in response.results:
        chunk = chunks[result.index]
        chunk["rerank_score"] = result.relevance_score
        reranked.append(chunk)

    return reranked