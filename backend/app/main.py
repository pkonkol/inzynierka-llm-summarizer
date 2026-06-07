from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .core.logging import setup_logging
from .core.mongo import close_mongo, init_mongo
from .routers import health, summarize, meta
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
app.include_router(summarize.router)
app.include_router(meta.router)


@app.on_event("startup")
def on_startup() -> None:
    init_mongo()


@app.on_event("shutdown")
def on_shutdown() -> None:
    close_mongo()
