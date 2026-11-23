import asyncio
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from alembic.config import Config as AlembicConfig
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from starlette.applications import Starlette
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.routing import Mount

from alembic import command as alembic_command
from partsible import __version__
from partsible.async_processing import start_periodic_cleanup
from partsible.auth.single_user import check_single_user_bind
from partsible.database_url import legacy_database_warning, resolve_database_url
from partsible.errors import PartsibleError
from partsible.helpers import load_config
from partsible.logging_config import configure_structured_logging, get_logger
from partsible.routes import (
    admin_router,
    auth_router,
    project_groups_router,
    projects_router,
    settings_router,
    sheet_projects_router,
    tile_projects_router,
    wallpaper_projects_router,
    wallpapers_router,
)
from partsible.routes.admin_catalogue import router as admin_catalogue_router
from partsible.routes.catalogue import router as catalogue_router
from partsible.routes.common import limiter
from partsible.routes.cutlists import router as cutlists_router
from partsible.routes.cutting import router as cutting_router
from partsible.routes.cutting import task_router
from partsible.routes.sheet_optimization import router as sheet_router
from partsible.routes.system import router as system_router
from partsible.routes.tile_layout import router as tile_router
from partsible.routes.wallpaper import router as wallpaper_router
from partsible.schemas import (  # noqa: F401
    BoardCost,
    CostAnalysis,
    CutListItemResponse,
    PartsibleRequest,
    PartsibleResponse,
    PlacedTileInfo,
    SheetLayoutInfo,
    SheetOptimizationRequest,
    SheetOptimizationResponse,
    SheetPartSpec,
    StepCutListItemResponse,
    StepCutlistResponse,
    ThreeDCutlistResponse,
    TileBondSpec,
    TileCutoutSpec,
    TileJointSpec,
    TileLayoutCandidateResponse,
    TileLayoutRequest,
    TileLayoutResponse,
    TileSpec,
    partsibleRequest,
    partsibleResponse,
)
from partsible.validation import (
    sanitize_board_lengths,
    sanitize_parts_dict,
    sanitize_project_name,
    validate_numeric_input,
)

__all__ = [
    "app",
    "sanitize_board_lengths",
    "sanitize_parts_dict",
    "sanitize_project_name",
    "validate_numeric_input",
]

CONFIG_PATH = Path(__file__).parent.parent / "config.yaml"
CONFIG = load_config(CONFIG_PATH)
MAX_PART_LENGTH = CONFIG["max_lengths"]["part_length"]
MAX_BOARD_LENGTH = CONFIG["max_lengths"]["board_length"]
if os.getenv("STRUCTURED_LOGGING", "false").lower() == "true":
    configure_structured_logging()
    logger = get_logger("partsible.api")
else:
    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger("partsible.api")


def _run_migrations():
    backend_dir = Path(__file__).parent.parent
    cfg = AlembicConfig(str(backend_dir / "alembic.ini"))
    cfg.set_main_option("script_location", str(backend_dir / "alembic"))
    alembic_command.upgrade(cfg, "head")


@asynccontextmanager
async def lifespan(_: Starlette):
    check_single_user_bind()
    if warning := legacy_database_warning(resolve_database_url()):
        logger.warning(warning)
    await asyncio.to_thread(_run_migrations)
    start_periodic_cleanup()
    yield


api_app = FastAPI(
    title="partsible API",
    description="Optimize board cutting to minimize waste.",
    version=__version__,
)


@api_app.get("/metrics")
async def get_metrics():
    from partsible.metrics import metrics_endpoint

    return metrics_endpoint()


@api_app.exception_handler(RateLimitExceeded)
async def custom_rate_limit_exceeded_handler(
    _: Request, exc: RateLimitExceeded
) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={
            "detail": "Rate limit exceeded. Please wait before making more requests.",
            "limit": "10 requests per minute",
            "retry_after_seconds": int(exc.reset_time - exc.current_time)
            if hasattr(exc, "reset_time") and hasattr(exc, "current_time")
            else 60,
        },
    )


@api_app.exception_handler(PartsibleError)
async def partsible_error_handler(_: Request, exc: PartsibleError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self';"
        )
        return response


api_app.state.limiter = limiter
api_app.add_middleware(SecurityHeadersMiddleware)
default_origins = [
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
allowed_origins = default_origins + [
    o.strip()
    for o in os.environ.get("PARTSIBLE_CORS_ORIGINS", "").split(",")
    if o.strip()
]
api_app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    # Vite may move to the next available port when the default is occupied.
    # Keep local development usable without requiring a backend restart for
    # every port change, while production origins remain explicit above.
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1):\d+$",
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
    expose_headers=["Content-Type"],
)

for route in (
    auth_router,
    settings_router,
    projects_router,
    sheet_projects_router,
    tile_projects_router,
    wallpapers_router,
    wallpaper_projects_router,
    project_groups_router,
    admin_router,
    admin_catalogue_router,
    catalogue_router,
    cutting_router,
    sheet_router,
    cutlists_router,
    tile_router,
    wallpaper_router,
    system_router,
    task_router,
):
    api_app.include_router(route)

# Served under /api (public URLs, scope["root_path"] == "/api") and at the root,
# so direct backend URLs such as /health and /docs keep working too.
app = Starlette(
    routes=[Mount("/api", app=api_app), Mount("/", app=api_app)],
    lifespan=lifespan,
)
app.state.limiter = limiter
