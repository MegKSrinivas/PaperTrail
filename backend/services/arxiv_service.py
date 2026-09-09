import arxiv
import requests
from services.storage import upload_bytes


def search_arxiv(query: str, max_results: int = 10) -> list[dict]:
    """
    Searches ArXiv's public API for papers matching the query. Uses the
    official `arxiv` package, which handles the Atom XML parsing and
    ArXiv's rate-limiting requirements (max 1 request per 3 seconds) for us.

    The query is wrapped in quotes and prefixed with "all:" so ArXiv treats
    it as an exact phrase search across title/abstract/etc, rather than
    loosely matching on individual words — a raw unprefixed query like
    "state space models" was matching on any paper containing just the
    word "space" (e.g. astrophysics papers), ignoring the rest of the phrase.

    Returns a list of dicts with the metadata needed to show search
    results in the frontend, plus enough info to download the PDF later
    if the user chooses to add it to their library.
    """
    client = arxiv.Client()

    formatted_query = f'all:"{query}"'

    search = arxiv.Search(
        query=formatted_query,
        max_results=max_results,
        sort_by=arxiv.SortCriterion.Relevance,
    )

    results = []
    for result in client.results(search):
        results.append({
            "arxiv_id": result.entry_id.split("/")[-1],  # e.g. "2312.00752v2"
            "title": result.title,
            "authors": [author.name for author in result.authors],
            "abstract": result.summary,
            "published": result.published.isoformat() if result.published else None,
            "pdf_url": result.pdf_url,
        })

    return results


def download_arxiv_pdf(pdf_url: str) -> str:
    """
    Downloads a PDF from ArXiv into memory and uploads it directly to R2.
    Returns the R2 object key (stored in Paper.s3_url).
    """
    response = requests.get(pdf_url, timeout=30)
    response.raise_for_status()
    return upload_bytes(response.content, "paper.pdf")