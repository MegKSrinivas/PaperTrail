from fastapi import FastAPI
from routers import paper, research

app = FastAPI(title="PaperTrail API")

app.include_router(paper.router)
app.include_router(research.router)

@app.get("/health")
def health():
    return {"status": "ok"}
