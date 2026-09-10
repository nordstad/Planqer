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
from starlette.middleware.base import BaseHTTPMiddleware

from alembic import command as alembic_command
from planqer import __version__
from planqer.async_processing import start_periodic_cleanup
from planqer.helpers import load_config
from planqer.logging_config import configure_structured_logging, get_logger
from planqer.routes import (
    admin_router,
    auth_router,
    project_groups_router,
    projects_router,
    settings_router,
    sheet_projects_router,
    tile_projects_router,
)
from planqer.routes.common import limiter
from planqer.routes.cutlists import router as cutlists_router
from planqer.routes.cutting import router as cutting_router
from planqer.routes.cutting import task_router
from planqer.routes.sheet_optimization import router as sheet_router
from planqer.routes.system import router as system_router
from planqer.routes.tile_layout import router as tile_router
from planqer.schemas import (  # noqa: F401
    BoardCost,
    CostAnalysis,
    CutListItemResponse,
    PlacedTileInfo,
    PlanqerRequest,
    PlanqerResponse,
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
    planqerRequest,
    planqerResponse,
)
from planqer.step_cutlist import process_uploaded_step
from planqer.threed_cutlist import process_uploaded_stl
from planqer.validation import (
    sanitize_board_lengths,
    sanitize_parts_dict,
    sanitize_project_name,
    validate_numeric_input,
)

__all__ = [
    "app",
    "process_uploaded_step",
    "process_uploaded_stl",
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
    logger = get_logger("planqer.api")
else:
    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger("planqer.api")


def _run_migrations():
    backend_dir = Path(__file__).parent.parent
    cfg = AlembicConfig(str(backend_dir / "alembic.ini"))
    cfg.set_main_option("script_location", str(backend_dir / "alembic"))
    alembic_command.upgrade(cfg, "head")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await asyncio.to_thread(_run_migrations)
    start_periodic_cleanup()
    yield


app = FastAPI(
    title="planqer API",
    description="Optimize board cutting to minimize waste.",
    version=__version__,
    root_path="/api",
    lifespan=lifespan,
)


@app.get("/metrics")
async def get_metrics():
    from planqer.metrics import metrics_endpoint

    return metrics_endpoint()


@app.exception_handler(RateLimitExceeded)
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


app.state.limiter = limiter
app.add_middleware(SecurityHeadersMiddleware)
default_origins = [
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
allowed_origins = default_origins + [
    o.strip()
    for o in os.environ.get("PLANQER_CORS_ORIGINS", "").split(",")
    if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
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
    project_groups_router,
    admin_router,
    cutting_router,
    sheet_router,
    cutlists_router,
    tile_router,
    system_router,
    task_router,
):
    app.include_router(route)
