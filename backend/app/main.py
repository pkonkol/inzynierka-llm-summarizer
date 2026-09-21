from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .core.config import settings
from .core.executors import run_blocking
from .core.logging import setup_logging
from .core.mongo import (
    cleanup_stale_evaluation_runs,
    cleanup_stale_golden_metrics_passes,
    cleanup_stale_pending_jobs,
    close_mongo,
    init_mongo,
)
from .core.nltk_data import ensure_wordnet_resources
from .routers import (
    auth,
    evaluation_runs,
    evaluation_sets,
    health,
    meta,
    public_summarize,
    summarize,
)
from .services.startup_resume import resume_interrupted_work

setup_logging()
log = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
    await run_blocking(ensure_wordnet_resources)
    await init_mongo()
    # Order matters
    await resume_interrupted_work()
    stale_jobs = await cleanup_stale_pending_jobs()
    stale_runs = await cleanup_stale_evaluation_runs()
    stale_golden_metrics_passes = await cleanup_stale_golden_metrics_passes()
    log.info(
        "stale work cleaned",
        stale_jobs=stale_jobs,
        stale_runs=stale_runs,
        stale_golden_metrics_passes=stale_golden_metrics_passes,
    )
    yield
    await close_mongo()


app = FastAPI(title=settings.app_name, version="0.0.1", lifespan=lifespan)

# CORSMiddleware must be added before other middleware and routers
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(summarize.router)
app.include_router(public_summarize.router)
app.include_router(meta.router)
app.include_router(evaluation_sets.router)
app.include_router(evaluation_runs.router)
