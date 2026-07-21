from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .core.logging import setup_logging
from .core.mongo import close_mongo, init_mongo
from .core.config import settings
from .routers import auth, health, meta, summarize, research

setup_logging()


app = FastAPI(title=settings.app_name, version="0.0.1")

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
app.include_router(research.router)


@app.on_event("startup")
async def on_startup() -> None:
    await init_mongo()


@app.on_event("shutdown")
async def on_shutdown() -> None:
    await close_mongo()
