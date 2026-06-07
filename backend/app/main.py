from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from .core.logging import setup_logging
from .core.mongo import close_mongo, init_mongo
from .routers import auth, health, meta, summarize

setup_logging()

app = FastAPI(title="Web Summarization Backend")

# CORSMiddleware must be added before other middleware and routers
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(summarize.router)
app.include_router(meta.router)


@app.on_event("startup")
def on_startup() -> None:
    init_mongo()


@app.on_event("shutdown")
def on_shutdown() -> None:
    close_mongo()
