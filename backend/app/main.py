import asyncio
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .core.logging import setup_logging
from .core.mongo import close_mongo, init_mongo
from .core.nltk_data import ensure_wordnet_resources
from .core.config import settings
from .routers import auth, health, meta, summarize, research

setup_logging()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
    await asyncio.to_thread(ensure_wordnet_resources)
    await init_mongo()
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
app.include_router(meta.router)
app.include_router(research.router)
