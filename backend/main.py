from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import paper, research, arxiv, auth, graph, groups

app = FastAPI(title="PaperTrail API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(paper.router)
app.include_router(research.router)
app.include_router(arxiv.router)
app.include_router(auth.router)
app.include_router(graph.router)
app.include_router(groups.router)

@app.get("/health")
def health():
    return {"status": "ok"}
