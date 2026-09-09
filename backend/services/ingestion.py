import os
import json
from dotenv import load_dotenv
import cohere
from google import genai
from google.genai import types as genai_types
import chromadb

load_dotenv()  # makes sure .env is read even if this file is imported on its own

from llama_index.readers.file import PDFReader
from llama_index.core.node_parser import SentenceSplitter

from pathlib import Path

from sqlalchemy.orm import Session
from models.entity import Entity

# PDFReader is LlamaIndex's PDF parser. It reads a PDF file and returns
# a list of "Document" objects — LlamaIndex's internal representation
# of a piece of source content, with page-level text already extracted.
reader = PDFReader()

# chunk_size = max size of each chunk, in tokens (roughly ~4 chars per token)
# chunk_overlap = how much adjacent chunks overlap, so we don't lose context
# right at a chunk boundary (e.g. a sentence that explains the previous one)
splitter = SentenceSplitter(chunk_size=512, chunk_overlap=50)

COHERE_API_KEY = os.getenv("COHERE_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

co = cohere.Client(COHERE_API_KEY)  # legacy client, used for embed()
co_v2 = cohere.ClientV2(COHERE_API_KEY)  # current client, used for chat() (entity extraction)
gemini_client = genai.Client(api_key=GEMINI_API_KEY)

# Both providers are configured to produce vectors of this size,
# so chunks stay compatible with each other inside the same ChromaDB collection
# even if some were embedded by Cohere and others by Gemini (on different days, say).
EMBEDDING_DIMENSION = 1024

# ChromaDB stores everything in a local folder on disk — no server, no signup.
# PersistentClient means the data survives between script runs (vs an in-memory-only client).
chroma_client = chromadb.PersistentClient(path="chroma_db")

# get_or_create_collection means: use it if it already exists, otherwise make it.
# Think of a "collection" as roughly ChromaDB's version of a table.
collection = chroma_client.get_or_create_collection(name="paper_chunks")


def parse_pdf(file_path: str) -> str:
    """
    Takes a path to a PDF file, extracts all text from it,
    and returns it as one combined string.
    """
    documents = reader.load_data(file=Path(file_path))

    # load_data() returns one Document per page (usually).
    # We combine them into a single string for now — we'll handle
    # page/section boundaries properly in the chunking step next.
    full_text = "\n\n".join(doc.text for doc in documents)

    # Some PDFs (often ones with corrupted or unusual internal encoding)
    # produce null bytes (\x00) in their extracted text. Postgres rejects
    # any string containing these outright, which crashes ingestion partway
    # through — after chunks/entities have already been partially written,
    # leaving the DB session broken. Stripping them here, right at the
    # source, means every downstream step (chunking, embedding, entity
    # extraction, Postgres storage) always works with clean text.
    full_text = full_text.replace("\x00", "")

    return full_text


def chunk_text(text: str) -> list[str]:
    """
    Takes the full extracted text of a paper and splits it into
    semantically coherent chunks (respects sentence/paragraph boundaries).
    Returns a list of chunk strings.
    """
    chunks = splitter.split_text(text)
    return chunks


def embed_texts(texts: list[str], input_type: str = "search_document") -> tuple[list[list[float]], str]:
    """
    Embeds a list of text chunks. Tries Cohere first (our primary, free tier).
    If Cohere fails for any reason (quota exhausted, rate limit, auth error),
    falls back to Gemini for the ENTIRE batch — we never split one batch
    across two providers, since that could produce mismatched vector sizes.

    input_type: "search_document" when embedding chunks during ingestion (default),
    "search_query" when embedding a user's question during search — Cohere uses
    this to produce better-matched vectors depending on which side of the search
    you're embedding.

    Returns (embeddings, provider_name) so we can log/track which provider
    was actually used.
    """
    try:
        response = co.embed(
            texts=texts,
            input_type=input_type,
            model="embed-english-v3.0",
        )
        return response.embeddings, "cohere"
    except Exception as e:
        print(f"Cohere embedding failed ({e}), falling back to Gemini...")

    response = gemini_client.models.embed_content(
        model="gemini-embedding-001",
        contents=texts,
        config=genai_types.EmbedContentConfig(output_dimensionality=EMBEDDING_DIMENSION),
    )
    embeddings = [e.values for e in response.embeddings]
    return embeddings, "gemini"


def store_chunks(paper_id: str, chunks: list[str], embeddings: list[list[float]]) -> list[str]:
    """
    Stores each chunk's text + embedding vector in ChromaDB, tagged with
    which paper it belongs to and its position in that paper.
    Returns the list of ChromaDB IDs generated for these chunks — these are
    what we'll save into the `embedding_id` column on our Postgres Chunk rows,
    so each Postgres row can be linked back to its vector in ChromaDB.
    """
    ids = [f"{paper_id}_chunk_{i}" for i in range(len(chunks))]
    metadatas = [{"paper_id": paper_id, "chunk_index": i} for i in range(len(chunks))]

    collection.add(
        ids=ids,
        embeddings=embeddings,
        documents=chunks,      # the actual chunk text, so ChromaDB can return it directly
        metadatas=metadatas,
    )

    return ids


def extract_entities(paper_text: str) -> list[dict]:
    """
    Uses an LLM to extract entities (authors, institutions, concepts, datasets)
    from a paper's text. We only send the first ~3000 characters (roughly the
    title/authors/abstract/intro) rather than the whole paper — that's where
    almost all of this metadata lives, and it keeps the prompt small and cheap.

    Returns a list of dicts like: {"name": "...", "type": "concept"}
    """
    excerpt = paper_text[:3000]

    prompt = f"""Extract key entities from this excerpt of an academic paper. Return ONLY a JSON array, no other text, no markdown formatting.

Each entity must have "name" and "type". Use ONLY these exact type values: "author", "concept", "dataset". Any entity that does not clearly fit one of these three types must be omitted entirely — do not invent new types.

Excerpt:
{excerpt}

JSON array:"""

    try:
        response = co_v2.chat(
            model="command-r-plus-08-2024",
            messages=[{"role": "user", "content": prompt}],
        )
        raw_text = response.message.content[0].text
    except Exception as e:
        print(f"Cohere entity extraction failed ({e}), falling back to Gemini...")
        response = gemini_client.models.generate_content(
            model="gemini-3.6-flash",
            contents=prompt,
        )
        raw_text = response.text

    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("```")[1]
        if cleaned.startswith("json"):
            cleaned = cleaned[4:]

    try:
        entities = json.loads(cleaned)
        return entities
    except json.JSONDecodeError as e:
        print(f"Failed to parse entity extraction JSON: {e}")
        return []  # fail gracefully — don't break the whole ingestion pipeline over this


def store_entities(db: Session, paper, entities: list[dict]) -> list[Entity]:
    """
    Saves extracted entities to Postgres and links each one to the given
    Paper via the paper_entity association table. Reuses an existing Entity
    row if one with the same name + type already exists (so "Transformer"
    mentioned across 5 papers becomes ONE node in the knowledge graph,
    not 5 duplicate nodes) — this is what makes cross-paper connections
    in the graph possible later.
    """
    saved_entities = []

    for e in entities:
        name = e.get("name")
        entity_type = e.get("type")
        if not name or not entity_type or entity_type not in {"author", "concept", "dataset"}:
            continue  # skip malformed entries rather than crashing ingestion

        existing = db.query(Entity).filter(
            Entity.name == name,
            Entity.type == entity_type,
        ).first()

        if existing:
            entity = existing
        else:
            entity = Entity(name=name, type=entity_type)
            db.add(entity)
            db.flush()  # assigns entity.id without committing yet, so we can link it below

        if paper not in entity.papers:
            entity.papers.append(paper)

        saved_entities.append(entity)

    db.commit()
    return saved_entities