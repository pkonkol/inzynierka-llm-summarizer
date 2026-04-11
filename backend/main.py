from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.logging import setup_logging
from app.core.mongo import close_mongo, init_mongo
from app.routers import health, summarize

setup_logging()

app = FastAPI(title="Web Summarization Backend")

# Dev CORS profile: open to any origin for local frontend integration.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(summarize.router)


@app.on_event("startup")
def on_startup() -> None:
    init_mongo()


@app.on_event("shutdown")
def on_shutdown() -> None:
    close_mongo()
