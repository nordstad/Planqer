import os
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlmodel import SQLModel

from planqer.helpers import load_config

CONFIG_PATH = Path(__file__).parent.parent.parent / "config.yaml"
config = load_config(CONFIG_PATH)

DEFAULT_DATABASE_URL = "sqlite+aiosqlite:///./data/planqer.db"

DATABASE_URL = os.getenv("DATABASE_URL") or config.get("database", {}).get("url") or DEFAULT_DATABASE_URL

if DATABASE_URL == DEFAULT_DATABASE_URL:
    Path("./data").mkdir(parents=True, exist_ok=True)

engine = create_async_engine(
    DATABASE_URL,
    echo=config.get("database", {}).get("echo", False),
)

async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_session() -> AsyncSession:
    async with async_session() as session:
        yield session


async def create_db_and_tables():
    """Create tables directly from the current models. Used by tests; real
    deployments get their schema from Alembic migrations at startup instead."""
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
