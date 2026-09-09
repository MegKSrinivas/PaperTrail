# PaperTrail — Project Context

Agentic research platform: upload/search papers, AI ingests + indexes them, research agent answers questions with citations, knowledge graph tracks entities/relationships.

**Backend: fully built and working. Frontend: only default Vite scaffold, nothing built.**

## Rules

- Don't create .md files, README updates, or any docs unless explicitly asked.
- Don't create extra files beyond what's needed for the task.
- Small, testable steps. Explain what a step does before giving code. Wait for me to confirm before moving on.
- Give full updated files when asked, not diffs, unless I say otherwise.
- I'll handle external setup (API keys, .env, dashboards) manually — just tell me what's needed.

## Stack

- Backend: Python/FastAPI. Frontend: React+Vite+Tailwind (scaffold only).
- DB: Postgres, Docker locally, port 5433→5432.
- Vector DB: ChromaDB local (`chroma_db/`), persistent client. Pinecone swap planned for prod, not done.
- Embeddings: Cohere `embed-english-v3.0` (primary, 1024-dim) → Gemini `gemini-embedding-001` (fallback, forced 1024-dim). Never split one batch across providers.
- LLM: Cohere `command-r-plus-08-2024` via `ClientV2` (primary) → Gemini `gemini-3.6-flash` (fallback).
- Rerank: Cohere `rerank-v3.5`.
- PDF parsing: LlamaIndex `PDFReader`. Chunking: LlamaIndex `SentenceSplitter` (512/50).
- Keyword search: `rank_bm25`, rebuilt per query.
- Orchestration: LangGraph `StateGraph` for Research Agent (search→rerank→generate).
- ArXiv: `arxiv` package + `requests` for PDF download.
- Auth: Google Sign-In → backend verifies ID token (`google-auth`) → issues own JWT (`PyJWT`, HS256, 7d).
- File storage: local `backend/storage/`. R2 swap planned for prod, not done.
- Migrations: Alembic.

## Data models (Postgres/SQLAlchemy)

- **Paper**: id, title, authors[], abstract, arxiv_id, upload_source, s3_url, ingestion_status, user_id, created_at, full_text (cached parsed text)
- **Chunk**: id, paper_id, content, chunk_index, section_type (column exists, NEVER populated), embedding_id (Chroma ref)
- **Entity**: id, name, type (concept/author/dataset/institution/paper), papers[] (m2m via paper_entity)
- **Relationship**: id, source_entity_id, target_entity_id, type (builds-on/contradicts/shares-dataset/cites — LLM sometimes invents others), confidence_score
- **User**: id, google_id, email, name, picture_url, is_admin, created_at

## Backend layout

```
backend/
  main.py, database.py
  models/ paper.py chunk.py entity.py relationship.py user.py
    __init__.py — imports ALL models (required, or SQLAlchemy relationship resolution breaks)
  services/
    ingestion.py — parse_pdf, chunk_text, embed_texts, store_chunks, extract_entities, store_entities
      (shared clients live here: co, co_v2, gemini_client, chroma_client/collection)
    research.py — vector_search, keyword_search, hybrid_search, rerank_chunks, generate_answer
    graph.py — extract_relationships, store_relationships, detect_citations (title-substring
      match on cached full_text), store_citations
    orchestration.py — LangGraph graph, run_research_graph()
    arxiv_service.py — search_arxiv, download_arxiv_pdf
    auth_service.py — verify_google_token, get_or_create_user, create_session_token, decode_session_token
  routers/
    paper.py — POST /papers/upload (protected, full pipeline), GET /papers/ (scoped to user), GET /papers/{id}
    research.py — POST /research/query (protected)
    arxiv.py — GET /arxiv/search (protected), POST /arxiv/add (protected, full pipeline)
    auth.py — POST /auth/google, get_current_user dependency (used everywhere else)
  alembic/ — configured, env.py imports all models + loads .env
```

`.env`: DATABASE_URL, COHERE_API_KEY, GEMINI_API_KEY, GOOGLE_CLIENT_ID, JWT_SECRET_KEY

## Pipeline flow

Upload/ArXiv-add → parse PDF → cache full_text → chunk → embed all (single provider per batch) → store vectors in Chroma + Chunk rows in Postgres → extract entities (LLM) → store (dedup by name+type) → extract relationships (LLM) → store (dedup) → detect citations (title substring in cached text) → store → mark complete. Runs synchronously in the request.

Research: `POST /research/query` → LangGraph: search (hybrid) → rerank (Cohere) → generate (cited answer, fallback) → `{answer, provider, sources}`.

Auth: frontend gets Google ID token → `POST /auth/google` → backend verifies, upserts User, returns our JWT → frontend sends `Authorization: Bearer <token>` on every request.

## Frontend — not started

Needed: Google Sign-In + auth state, PaperUploader, ArXivSearch, ResearchDashboard (3-panel), KnowledgeGraph (React Flow), FindingsPanel, QueryInterface (chat), SWR for data fetching.

## Deployment (deferred, do when actually deploying)

1. ChromaDB → Pinecone free tier (keep Chroma for dev)
2. Local storage → Cloudflare R2 free tier
3. Backend → Render free tier (needs #1/#2 first, no persistent disk on free tier)
4. Frontend → Vercel
5. Add prod Vercel URL to Google OAuth client's origins/redirect URIs

## Backlog

1. Reference-section chunks pollute retrieval — populate section_type, exclude from search
2. Entity type drift beyond allowed list (e.g. "course"); misclassifies emails/URLs as dataset
3. Relationship type drift beyond allowed list (e.g. "affiliation", "enables", "is-a")
4. Citation detection is heuristic-only (title substring), not retroactive
5. Ingestion runs synchronously — should be background task/queue
6. BM25 rebuilds from scratch every query — fine now, won't scale
7. /arxiv/add duplicates /papers/upload pipeline logic — refactor into shared function
8. Null bytes in PDF text fixed at parse_pdf source — watch for other encoding edge cases
