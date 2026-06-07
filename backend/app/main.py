from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .core.auth import require_auth
from .core.logging import setup_logging
from .core.mongo import close_mongo, init_mongo
from .routers import auth, health, meta, summarize

setup_logging()

app = FastAPI(title="Web Summarization Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(summarize.router, dependencies=[Depends(require_auth)])
app.include_router(meta.router, dependencies=[Depends(require_auth)])


@app.on_event("startup")
def on_startup() -> None:
    init_mongo()


@app.on_event("shutdown")
def on_shutdown() -> None:
    close_mongo()
