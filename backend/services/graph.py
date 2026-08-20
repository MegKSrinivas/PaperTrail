import json
import re
from services.ingestion import co_v2, gemini_client
from sqlalchemy.orm import Session
from models.entity import Entity
from models.relationship import Relationship


def extract_relationships(paper_text: str, entity_names: list[str]) -> list[dict]:
    """
    Uses an LLM to find relationships between entities already extracted
    from this paper (e.g. "Mamba" builds-on "state space models"). We give
    the model the list of entity names so it only proposes relationships
    between things we've actually recorded — not entities it might otherwise
    hallucinate.

    Returns a list of dicts like:
    {"source": "Mamba", "target": "state space models", "type": "builds-on", "confidence": 0.9}
    """
    excerpt = paper_text[:4000]

    capped_entity_names = entity_names[:25]
    entities_list = ", ".join(capped_entity_names)

    prompt = f"""Given this excerpt from an academic paper, and this list of entities already identified in it, find relationships BETWEEN THESE ENTITIES ONLY.

Entities: {entities_list}

Excerpt:
{excerpt}

Return ONLY a JSON array, no other text, no markdown formatting. Each relationship should be an object with:
- "source": exact entity name from the list above
- "target": exact entity name from the list above
- "type": one of "builds-on", "contradicts", "shares-dataset"
- "confidence": a number 0-1 indicating how confident you are

Only include the 5-10 STRONGEST, clearest relationships. Keep it concise. If no clear relationships exist, return an empty array [].

JSON array:"""

    try:
        response = co_v2.chat(
            model="command-r-plus-08-2024",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=1500,
        )
        raw_text = response.message.content[0].text
    except Exception as e:
        print(f"Cohere relationship extraction failed ({e}), falling back to Gemini...")
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

    return _safe_parse_json_array(cleaned)


def _safe_parse_json_array(text: str) -> list[dict]:
    """
    Tries to parse a JSON array from LLM output. If the response got cut
    off mid-object (e.g. hit a token limit), this salvages whatever
    complete objects it can, rather than throwing away the entire response.
    """
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    last_complete = text.rfind("},")
    if last_complete != -1:
        salvaged = text[:last_complete + 1] + "]"
        try:
            result = json.loads(salvaged)
            print(f"Recovered {len(result)} relationships from a truncated response")
            return result
        except json.JSONDecodeError:
            pass

    print("Could not recover any relationships from malformed JSON")
    return []


def store_relationships(db: Session, relationships: list[dict]) -> list[Relationship]:
    """
    Saves extracted relationships to Postgres. Looks up each entity by name
    to get its ID (entities should already exist from the entity extraction
    step that ran earlier in the pipeline). Skips relationships where we
    can't find a matching entity, or where source == target (self-loops
    don't make sense in a graph).
    """
    saved = []

    for r in relationships:
        source_name = r.get("source")
        target_name = r.get("target")
        rel_type = r.get("type")
        confidence = r.get("confidence", 1.0)

        if not source_name or not target_name or not rel_type:
            continue
        if source_name == target_name:
            continue

        source_entity = db.query(Entity).filter(Entity.name == source_name).first()
        target_entity = db.query(Entity).filter(Entity.name == target_name).first()

        if not source_entity or not target_entity:
            continue

        existing = db.query(Relationship).filter(
            Relationship.source_entity_id == source_entity.id,
            Relationship.target_entity_id == target_entity.id,
            Relationship.type == rel_type,
        ).first()

        if existing:
            continue

        relationship = Relationship(
            source_entity_id=source_entity.id,
            target_entity_id=target_entity.id,
            type=rel_type,
            confidence_score=confidence,
        )
        db.add(relationship)
        saved.append(relationship)

    db.commit()
    return saved


def _normalize_for_matching(text: str) -> str:
    """
    Normalizes text for citation substring matching: lowercases, strips
    punctuation that commonly differs between a filename-derived title and
    how that title appears in another paper's reference list (colons,
    dashes), and collapses all whitespace (including line breaks from PDF
    text extraction) into single spaces.
    """
    text = text.lower()
    text = re.sub(r"[:\-–—]", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def detect_citations(db: Session, paper) -> list[dict]:
    """
    Heuristic citation detection: checks whether the TITLE of any other
    paper in the library appears as a substring in this paper's full text.
    Uses each paper's CACHED full_text column rather than re-parsing PDFs
    from disk — this used to re-parse every existing paper's PDF on every
    single upload, which got slower as the library grew.
    """
    from models.paper import Paper

    # CHANGED: use the paper's own cached text instead of re-parsing its PDF
    paper_text = paper.full_text or ""
    normalized_paper_text = _normalize_for_matching(paper_text)

    other_papers = db.query(Paper).filter(Paper.id != paper.id).all()

    citations = []
    for other in other_papers:
        if len(other.title) < 15:
            continue

        clean_title = _normalize_for_matching(other.title.replace(".pdf", ""))

        if clean_title in normalized_paper_text:
            citations.append({"citing_paper": paper, "cited_paper": other})

    return citations

def get_or_create_paper_entity(db: Session, paper) -> Entity:
    """
    Papers aren't Entities by default — our Relationship table only links
    Entity to Entity. To represent "Paper A cites Paper B" using that same
    table, we give each paper a corresponding Entity row (type="paper"),
    created once and reused afterward — keyed by title, so multiple Paper
    rows that happen to share a title (e.g. re-uploads) still resolve to
    the same graph node.
    """
    existing = db.query(Entity).filter(
        Entity.name == paper.title,
        Entity.type == "paper",
    ).first()

    if existing:
        return existing

    entity = Entity(name=paper.title, type="paper")
    db.add(entity)
    db.flush()
    return entity


def store_citations(db: Session, citations: list[dict]) -> list[Relationship]:
    """
    Converts detected citations into Relationship rows, using the
    paper-as-entity pattern from get_or_create_paper_entity.
    """
    saved = []
    seen_pairs = set()  # tracks (source_id, target_id) already handled in THIS
                         # call, since the DB existence check alone can't catch
                         # duplicates created earlier in the same uncommitted batch

    for c in citations:
        citing_entity = get_or_create_paper_entity(db, c["citing_paper"])
        cited_entity = get_or_create_paper_entity(db, c["cited_paper"])

        pair_key = (citing_entity.id, cited_entity.id)
        if pair_key in seen_pairs:
            continue
        seen_pairs.add(pair_key)

        existing = db.query(Relationship).filter(
            Relationship.source_entity_id == citing_entity.id,
            Relationship.target_entity_id == cited_entity.id,
            Relationship.type == "cites",
        ).first()

        if existing:
            continue

        relationship = Relationship(
            source_entity_id=citing_entity.id,
            target_entity_id=cited_entity.id,
            type="cites",
            confidence_score=0.7,
        )
        db.add(relationship)
        saved.append(relationship)

    db.commit()
    return saved