import asyncio
from collections.abc import AsyncGenerator
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .core.config import settings
from .core.logging import setup_logging
from .core.mongo import close_mongo, init_mongo
from .core.nltk_data import ensure_wordnet_resources
from .routers import auth, evaluation_runs, evaluation_sets, health, meta, summarize

setup_logging()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
    executor = ThreadPoolExecutor(
        max_workers=settings.eval_max_concurrent_geval + 2, thread_name_prefix="metrics"
    )
    asyncio.get_running_loop().set_default_executor(executor)

    await asyncio.to_thread(ensure_wordnet_resources)
    await init_mongo()
    yield
    await close_mongo()
    executor.shutdown(wait=False, cancel_futures=True)


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
app.include_router(meta.router)
app.include_router(evaluation_sets.router)
app.include_router(evaluation_runs.router)
