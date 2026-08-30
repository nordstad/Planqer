import asyncio
import logging
import os
import re
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from html import escape
from pathlib import Path
from uuid import uuid4

from alembic import command as alembic_command
from alembic.config import Config as AlembicConfig
from fastapi import (
    APIRouter,
    BackgroundTasks,
    FastAPI,
    File,
    Form,
    HTTPException,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from planqer import __version__
from planqer.algorithms import OptimizationAlgorithm, get_algorithm_recommendation
from planqer.async_processing import (
    generate_task_id,
    get_task_progress,
    process_optimization_async,
    start_periodic_cleanup,
    task_manager,
)
from planqer.cache import clear_cache, get_cache_info
from planqer.helpers import load_config
from planqer.logging_config import (
    configure_structured_logging,
    get_logger,
    log_api_request,
    log_error,
    log_optimization_request,
    log_optimization_result,
    log_websocket_event,
)
from planqer.metrics import (
    metrics_endpoint,
    track_optimization_metrics,
    track_request_metrics,
    track_websocket_connection,
)
from planqer.routes import (
    admin_router,
    auth_router,
    project_groups_router,
    projects_router,
    settings_router,
    sheet_projects_router,
)
from planqer.services import run_optimization
from planqer.sheet_optimization import (
    SheetOptimizationAlgorithm,
    get_sheet_algorithm_recommendation,
    optimize_sheet_cutting,
)
from planqer.step_cutlist import process_uploaded_step
from planqer.threed_cutlist import process_uploaded_stl
from pydantic import BaseModel, field_validator
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

# Load configuration
CONFIG_PATH = Path(__file__).parent.parent / "config.yaml"
CONFIG = load_config(CONFIG_PATH)
MAX_PART_LENGTH = CONFIG["max_lengths"]["part_length"]
MAX_BOARD_LENGTH = CONFIG["max_lengths"]["board_length"]

# Configure structured logging
if os.getenv("STRUCTURED_LOGGING", "false").lower() == "true":
    configure_structured_logging()
    logger = get_logger("planqer.api")
else:
    logger = logging.getLogger("planqer.api")


# Lifespan context manager for startup and shutdown events
def _run_migrations():
    """Bring the local accounts database up to the latest schema."""
    backend_dir = Path(__file__).parent.parent
    cfg = AlembicConfig(str(backend_dir / "alembic.ini"))
    cfg.set_main_option("script_location", str(backend_dir / "alembic"))
    alembic_command.upgrade(cfg, "head")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifespan events."""
    # Startup
    # Alembic's async env.py starts its own event loop, so run it off-thread
    # to avoid nesting inside the one this lifespan is already running on.
    await asyncio.to_thread(_run_migrations)
    start_periodic_cleanup()
    yield
    # Shutdown - add any cleanup code here if needed


# Security: Input sanitization functions
def sanitize_project_name(name: str | None) -> str | None:
    """
    Sanitize project name to prevent injection attacks and ensure safe handling.

    - Remove dangerous characters that could be used for injection
    - Limit length to prevent buffer overflow attacks
    - HTML escape to prevent XSS in case name is displayed in web interfaces
    - Allow only safe characters: letters, numbers, spaces, hyphens, underscores
    """
    if name is None:
        return None

    # Remove any null bytes (common in injection attacks)
    name = name.replace("\x00", "")

    # Limit length to prevent buffer overflow attacks
    name = name[:100]

    # Remove dangerous characters - allow only safe characters
    # Letters, numbers, spaces, hyphens, underscores, parentheses, and periods
    name = re.sub(r"[^a-zA-Z0-9\s\-_().]", "", name)

    # Remove multiple consecutive dots (path traversal prevention)
    name = re.sub(r"\.{2,}", ".", name)

    # Remove multiple consecutive spaces and trim
    name = re.sub(r"\s+", " ", name).strip()

    # HTML escape to prevent XSS if displayed in web interface
    name = escape(name)

    # Return None if string becomes empty after sanitization
    return name if name else None


def validate_numeric_input(
    value: float, min_val: float = 0.1, max_val: float = 10000.0
) -> float:
    """
    Validate numeric inputs to prevent attacks and ensure reasonable values.

    - Check for NaN, infinity, and other dangerous float values
    - Ensure values are within reasonable bounds
    - Prevent extremely large numbers that could cause DoS
    """
    # Check for NaN and infinity
    if (
        not isinstance(value, (int, float))
        or value != value
        or value == float("inf")
        or value == float("-inf")
    ):
        raise ValueError(f"Invalid numeric value: {value}")

    # Ensure value is within reasonable bounds
    if value < min_val or value > max_val:
        raise ValueError(f"Value {value} must be between {min_val} and {max_val}")

    return float(value)


def sanitize_parts_dict(parts: dict) -> dict[float, int]:
    """
    Sanitize the parts dictionary to ensure safe numeric values.
    """
    if not isinstance(parts, dict):
        raise ValueError("Parts must be a dictionary")

    # Limit number of parts to prevent DoS attacks
    if len(parts) > 1000:
        raise ValueError("Maximum 1000 different part lengths allowed")

    sanitized_parts = {}
    for length, quantity in parts.items():
        # Validate and sanitize length
        clean_length = validate_numeric_input(float(length), 0.1, MAX_PART_LENGTH)

        # Validate quantity
        if not isinstance(quantity, int) or quantity < 1 or quantity > 10000:
            raise ValueError(
                f"Quantity for length {length} must be an integer between 1 and 10000"
            )

        sanitized_parts[clean_length] = quantity

    return sanitized_parts


def sanitize_board_lengths(boards: list) -> list[float]:
    """
    Sanitize the board lengths list to ensure safe numeric values.
    """
    if not isinstance(boards, list):
        raise ValueError("Board lengths must be a list")

    # Limit number of board lengths to prevent DoS attacks
    if len(boards) > 100:
        raise ValueError("Maximum 100 different board lengths allowed")

    if len(boards) == 0:
        raise ValueError("At least one board length must be provided")

    sanitized_boards = []
    for board in boards:
        clean_board = validate_numeric_input(float(board), 1.0, MAX_BOARD_LENGTH)
        sanitized_boards.append(clean_board)

    return sanitized_boards


# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("planqer.api")

# Initialize rate limiter
limiter = Limiter(key_func=get_remote_address)

cutting_router = APIRouter(prefix="/cutting-plans", tags=["Cutting Plans"])
sheet_router = APIRouter(
    prefix="/sheet-optimization", tags=["Sheet Material Optimization"]
)
threed_router = APIRouter(prefix="/3d-cutlist", tags=["3D Model Cutlist"])
step_router = APIRouter(prefix="/step-cutlist", tags=["STEP Model Cutlist"])

app = FastAPI(
    title="planqer API",
    description="Optimize board cutting to minimize waste.",
    version=__version__,
    root_path="/api",
    lifespan=lifespan,
)


# Add metrics endpoint
@app.get("/metrics")
async def get_metrics():
    """Prometheus metrics endpoint"""
    return metrics_endpoint()


# Custom rate limit exceeded handler
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


# Add rate limiter to app state
app.state.limiter = limiter

# Configure CORS with specific allowed origins for security.
#
# Both loopback forms stay whitelisted permanently: `localhost` and `127.0.0.1`
# are separate origins to a browser, and both are legitimate ways to reach your
# own instance.
#
# Serving Planqer on a real hostname means adding it here, which is what
# PLANQER_CORS_ORIGINS is for — a comma-separated list, added to the defaults.
# This used to be a hardcoded list containing the author's own homelab domain,
# so anyone else self-hosting on a hostname had to edit this file. The env var
# was already documented in the README; it was never actually read.
DEFAULT_ALLOWED_ORIGINS = [
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

ALLOWED_ORIGINS = DEFAULT_ALLOWED_ORIGINS + [
    origin.strip()
    for origin in os.environ.get("PLANQER_CORS_ORIGINS", "").split(",")
    if origin.strip()
]


# Security Headers Middleware
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)

        # Add security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data:; "
            "connect-src 'self';"
        )

        return response


# Add security middlewares
app.add_middleware(SecurityHeadersMiddleware)
# TrustedHostMiddleware is off: it was disabled while debugging 400s and never
# re-enabled. Turning it back on needs the same treatment ALLOWED_ORIGINS just
# got — the host list has to come from configuration, not from a literal, or it
# rejects every self-hosted hostname but the one written here.
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE"],  # Only allow necessary methods
    allow_headers=["Content-Type", "Authorization"],  # Only allow necessary headers
    expose_headers=["Content-Type"],  # Only expose necessary headers
)


# --- Cost Calculation Models ---
class BoardCost(BaseModel):
    """Cost information for a specific board length."""

    price_per_board: float
    supplier: str = "default"
    bulk_discount: float = 0.0  # Percentage discount for bulk purchases (0.1 = 10%)
    minimum_quantity: int = 1  # Minimum quantity for bulk discount

    @field_validator("price_per_board")
    @classmethod
    def validate_price(cls, v):
        return validate_numeric_input(v, 0.01, 100000.0)  # Reasonable price range

    @field_validator("bulk_discount")
    @classmethod
    def validate_bulk_discount(cls, v):
        return validate_numeric_input(v, 0.0, 0.5)  # 0-50% discount

    @field_validator("minimum_quantity")
    @classmethod
    def validate_min_quantity(cls, v):
        if not isinstance(v, int) or v < 1 or v > 1000:
            raise ValueError("Minimum quantity must be an integer between 1 and 1000")
        return v


class CostAnalysis(BaseModel):
    """Detailed cost analysis results."""

    total_cost: float
    currency: str
    cost_per_board_type: dict[float, float]  # Board length -> total cost for that type
    boards_needed_by_type: dict[float, int]  # Board length -> quantity needed
    waste_cost: float
    material_efficiency: float  # Percentage of material used (not wasted)
    cost_per_useful_material: float  # Cost divided by useful material length
    cost_breakdown: dict[str, float]  # Detailed breakdown (material, waste, etc.)


# --- Pydantic Model ---
class planqerRequest(BaseModel):
    parts: dict[float, int]
    available_board_lengths: list[float]
    saw_blade_width: float = 3.0  # Now in millimeters (default 3.0 mm)
    project_name: str | None = None
    algorithm: str | None = None  # Algorithm selection (optional)

    # Cost calculation fields
    board_costs: dict[float, BoardCost] = {}  # Board length -> cost info
    currency: str = "SEK"  # Default to Swedish Krona
    enable_cost_analysis: bool = False  # Enable cost calculations

    # Frontend sends cost analysis as nested object
    cost_analysis: dict | None = None

    model_config = {
        "json_schema_extra": {
            "example": {
                "parts": {"1200": 4, "800": 8, "500": 16, "300": 4},
                "available_board_lengths": [2500, 3000, 3300, 3600, 4200, 5100],
                "saw_blade_width": 3,
                "project_name": "My Project",
                "algorithm": "first_fit_decreasing",
                "board_costs": {
                    "2500": {"price_per_board": 75.0, "supplier": "Byggmax"},
                    "3000": {"price_per_board": 90.0, "supplier": "Byggmax"},
                    "3300": {"price_per_board": 99.0, "supplier": "Byggmax"},
                    "3600": {"price_per_board": 108.0, "supplier": "Byggmax"},
                    "4200": {"price_per_board": 126.0, "supplier": "Byggmax"},
                    "5100": {"price_per_board": 153.0, "supplier": "Byggmax"},
                },
                "currency": "SEK",
                "enable_cost_analysis": True,
            }
        }
    }

    @field_validator("parts")
    @classmethod
    def validate_part_lengths(cls, v):
        return sanitize_parts_dict(v)

    @field_validator("available_board_lengths")
    @classmethod
    def validate_board_lengths(cls, v):
        return sanitize_board_lengths(v)

    @field_validator("project_name")
    @classmethod
    def validate_project_name(cls, v):
        return sanitize_project_name(v)

    @field_validator("saw_blade_width")
    @classmethod
    def validate_saw_blade_width(cls, v):
        return validate_numeric_input(v, 0.1, 100.0)  # Reasonable kerf range 0.1-100mm

    @field_validator("algorithm")
    @classmethod
    def validate_algorithm(cls, v):
        if v is None:
            return None

        # Check if the algorithm is valid
        valid_algorithms = {alg.value for alg in OptimizationAlgorithm}
        if v not in valid_algorithms:
            raise ValueError(
                f"Invalid algorithm '{v}'. Valid options: {', '.join(valid_algorithms)}"
            )

        return v

    @field_validator("currency")
    @classmethod
    def validate_currency(cls, v):
        """Validate currency code - support Nordic and major currencies."""
        valid_currencies = {"SEK", "NOK", "DKK", "USD", "EUR"}
        if v not in valid_currencies:
            raise ValueError(
                f"Invalid currency '{v}'. Valid options: {', '.join(valid_currencies)}"
            )
        return v


class planqerResponse(BaseModel):
    optimal_board_length: float
    cost: float  # Number of boards needed (legacy field)
    total_waste: float  # Offcut: bought minus parts minus kerf
    material_bought: float | None = None  # Sum of the stock lengths actually used
    kerf_loss: float | None = None  # Material the blade removes across all cuts
    board_lengths_used: list[float] | None = None  # Stock length per board in the plan
    cut_list: list[list[float]]
    visualization: str
    algorithm_used: str  # Which algorithm was used
    computation_time: float | None = None  # Time taken for optimization

    # Cost analysis results
    cost_analysis: CostAnalysis | None = None  # Optional cost analysis


class SheetPartSpec(BaseModel):
    """Specification for a rectangular part to be cut from sheet material."""

    width: float
    height: float
    quantity: int

    @field_validator("width", "height")
    @classmethod
    def validate_dimensions(cls, v):
        return validate_numeric_input(v, 1.0, 5000.0)  # 1mm to 5000mm

    @field_validator("quantity")
    @classmethod
    def validate_quantity(cls, v):
        if not isinstance(v, int) or v < 1 or v > 1000:
            raise ValueError("Quantity must be an integer between 1 and 1000")
        return v


class SheetOptimizationRequest(BaseModel):
    """Request model for sheet material optimization."""

    parts: dict[str, SheetPartSpec]
    sheet_width: float
    sheet_height: float
    kerf_width: float = 3.0  # Default 3mm kerf
    material_type: str = "plywood"
    project_name: str | None = None
    algorithm: str | None = None
    allow_rotation: bool = True

    model_config = {
        "json_schema_extra": {
            "example": {
                "parts": {
                    "shelf_back": {"width": 800, "height": 400, "quantity": 2},
                    "shelf_side": {"width": 300, "height": 400, "quantity": 4},
                    "shelf_bottom": {"width": 780, "height": 280, "quantity": 2},
                },
                "sheet_width": 1220,
                "sheet_height": 2440,
                "kerf_width": 3,
                "material_type": "plywood",
                "project_name": "Kitchen Shelves",
                "algorithm": "bottom_left_fill",
                "allow_rotation": True,
            }
        }
    }

    @field_validator("sheet_width", "sheet_height")
    @classmethod
    def validate_sheet_dimensions(cls, v):
        return validate_numeric_input(v, 100.0, 10000.0)  # 100mm to 10000mm

    @field_validator("kerf_width")
    @classmethod
    def validate_kerf_width(cls, v):
        return validate_numeric_input(v, 0.1, 50.0)  # 0.1mm to 50mm

    @field_validator("project_name")
    @classmethod
    def validate_project_name(cls, v):
        return sanitize_project_name(v)

    @field_validator("algorithm")
    @classmethod
    def validate_algorithm(cls, v):
        if v is None:
            return None

        valid_algorithms = {alg.value for alg in SheetOptimizationAlgorithm}
        if v not in valid_algorithms:
            raise ValueError(
                f"Invalid algorithm '{v}'. Valid options: {', '.join(valid_algorithms)}"
            )

        return v

    @field_validator("parts")
    @classmethod
    def validate_parts_dict(cls, v):
        if not isinstance(v, dict):
            raise ValueError("Parts must be a dictionary")

        if len(v) == 0:
            raise ValueError("At least one part must be provided")

        if len(v) > 100:
            raise ValueError("Maximum 100 different part types allowed")

        return v


class SheetLayoutInfo(BaseModel):
    """Information about a single sheet layout."""

    sheet_width: float
    sheet_height: float
    used_area: float
    waste_area: float
    efficiency: float
    parts_count: int
    parts: list[dict]  # List of placed parts with positions


class SheetOptimizationResponse(BaseModel):
    """Response model for sheet material optimization."""

    total_sheets: int
    total_waste_area: float
    overall_efficiency: float
    sheets: list[SheetLayoutInfo]
    algorithm_used: str
    computation_time: float | None = None
    material_type: str
    visualization: str  # Base64 encoded image


class CutListItemResponse(BaseModel):
    """Response model for a single cutlist item."""

    type: str  # ComponentType enum value
    length: float
    width: float
    thickness: float
    quantity: int
    name: str
    volume: float


class ThreeDCutlistResponse(BaseModel):
    """Response model for 3D cutlist processing."""

    cutlist_items: list[CutListItemResponse]
    total_items: int
    total_volume: float
    project_name: str | None = None
    units: str
    processing_time: float | None = None

    # Separated by component type for easy optimization workflow
    boards: list[
        CutListItemResponse
    ] = []  # Board components for Wood Cutting Optimizer
    sheets: list[
        CutListItemResponse
    ] = []  # Sheet components for Sheet Material Optimizer

    # Optional: Parts formatted for further optimization
    planqer_parts: dict[str, int] | None = None  # For 1D cutting optimization
    board_count: int = 0  # Number of board-type components
    sheet_count: int = 0  # Number of sheet-type components


class StepCutListItemResponse(BaseModel):
    """Response model for a single STEP cutlist item with enhanced metadata."""

    type: str  # StepComponentType enum value
    length: float
    width: float
    thickness: float
    quantity: int
    name: str
    volume: float
    material: str | None = None
    assembly_path: str | None = None
    cad_id: str | None = None


class StepCutlistResponse(BaseModel):
    """Response model for STEP cutlist processing with enhanced metadata."""

    cutlist_items: list[StepCutListItemResponse]
    total_items: int
    total_volume: float
    project_name: str | None = None
    units: str
    processing_time: float | None = None

    # Separated by component type for easy optimization workflow
    boards: list[
        StepCutListItemResponse
    ] = []  # Board components for Wood Cutting Optimizer
    sheets: list[
        StepCutListItemResponse
    ] = []  # Sheet components for Sheet Material Optimizer

    # Optional: Parts formatted for further optimization
    planqer_parts: dict[str, int] | None = None  # For 1D cutting optimization
    board_count: int = 0  # Number of board-type components
    sheet_count: int = 0  # Number of sheet-type components

    # Enhanced STEP-specific metadata
    materials_used: list[str] = []  # List of unique materials found
    assembly_structure: dict = {}  # Assembly hierarchy information


@cutting_router.post(
    "",
    response_model=planqerResponse,
    summary="Generate an optimal cutting plan for boards",
)
@limiter.limit("10/minute")
@track_request_metrics
async def create_cutting_plan(
    request: Request,
    planqer_request: planqerRequest,
):
    # Generate request ID for tracking
    request_id = str(uuid4())[:8]
    start_time = time.time()

    # Log API request
    log_api_request(
        logger,
        "POST",
        "/cutting-plans",
        str(request.client.host),
        request.headers.get("user-agent"),
        request_id,
    )

    # Debug: Log all relevant headers for TrustedHostMiddleware configuration
    logger.info(
        f"[{request_id}] DEBUG Host headers - Host: {request.headers.get('host')}"
    )
    logger.info(
        f"[{request_id}] DEBUG Host headers - X-Forwarded-Host: {request.headers.get('x-forwarded-host')}"
    )
    logger.info(
        f"[{request_id}] DEBUG Host headers - X-Original-Host: {request.headers.get('x-original-host')}"
    )
    logger.info(
        f"[{request_id}] DEBUG Host headers - X-Forwarded-For: {request.headers.get('x-forwarded-for')}"
    )
    logger.info(
        f"[{request_id}] DEBUG Host headers - All headers: {dict(request.headers)}"
    )

    # Log optimization request details
    log_optimization_request(
        logger,
        request_id,
        len(planqer_request.parts),
        len(planqer_request.available_board_lengths),
        planqer_request.algorithm or "auto",
        planqer_request.project_name,
    )

    try:
        parts = planqer_request.parts
        boards = planqer_request.available_board_lengths
        kerf = planqer_request.saw_blade_width

        # Additional validation logging for suspicious requests
        total_parts = sum(planqer_request.parts.values())
        if total_parts > 5000:
            logger.warning(
                f"[{request_id}] Large request detected: {total_parts} total parts"
            )

        # Determine which algorithm to use
        algorithm = None
        if planqer_request.algorithm:
            algorithm = OptimizationAlgorithm(planqer_request.algorithm)
        else:
            # Auto-select algorithm based on problem characteristics
            algorithm = get_algorithm_recommendation(parts)
            logger.info(f"[{request_id}] Auto-selected algorithm: {algorithm.value}")

        # Handle cost analysis from frontend (nested structure) or direct fields
        board_costs_dict = {}
        enable_cost_analysis = planqer_request.enable_cost_analysis
        currency = planqer_request.currency
        optimize_for = "waste"  # Default optimization objective

        # Check if frontend sent nested cost_analysis structure
        if planqer_request.cost_analysis and planqer_request.cost_analysis.get(
            "enabled"
        ):
            enable_cost_analysis = True
            currency = planqer_request.cost_analysis.get("currency", "SEK")
            optimize_for = planqer_request.cost_analysis.get("optimizeFor", "waste")
            # Handle both board_costs and boardCosts (frontend uses camelCase)
            board_costs_frontend = planqer_request.cost_analysis.get(
                "board_costs", {}
            ) or planqer_request.cost_analysis.get("boardCosts", {})

            # Convert frontend board costs format to backend format
            for board_length_str, cost_data in board_costs_frontend.items():
                board_length = float(board_length_str)
                board_costs_dict[board_length] = {
                    "price_per_board": cost_data.get("price_per_board", 0.0),
                    "supplier": "default",
                    "bulk_discount": 0.0,  # No bulk discounts in simplified version
                    "minimum_quantity": 1,  # Always 1 for simplified version
                }

            logger.info(
                f"[{request_id}] Frontend cost analysis enabled with {len(board_costs_dict)} board types"
            )

        # Handle direct cost fields (backwards compatibility)
        elif planqer_request.board_costs:
            for board_length, cost_obj in planqer_request.board_costs.items():
                board_costs_dict[float(board_length)] = {
                    "price_per_board": cost_obj.price_per_board,
                    "supplier": cost_obj.supplier,
                    "bulk_discount": cost_obj.bulk_discount,
                    "minimum_quantity": cost_obj.minimum_quantity,
                }
            logger.info(
                f"[{request_id}] Direct board costs converted: {board_costs_dict}"
            )

        logger.info(
            f"[{request_id}] Final cost analysis settings - Enabled: {enable_cost_analysis}, Currency: {currency}, Board types: {len(board_costs_dict)}"
        )
        logger.info(
            f"[{request_id}] Cost analysis debug - Original request cost_analysis: {planqer_request.cost_analysis}"
        )
        logger.info(
            f"[{request_id}] Cost analysis debug - Original enable_cost_analysis: {planqer_request.enable_cost_analysis}"
        )
        logger.info(
            f"[{request_id}] Cost analysis debug - Processed enable_cost_analysis: {enable_cost_analysis}"
        )
        logger.info(
            f"[{request_id}] Cost analysis debug - Board costs dict: {board_costs_dict}"
        )

        # This endpoint solves and returns; it never persists. Keeping a plan is
        # POST /api/projects, where the user has named it and picked its project.
        result = run_optimization(
            parts,
            boards,
            kerf,
            planqer_request.project_name,
            algorithm,
            logger,
            planqerResponse,
            board_costs=board_costs_dict,
            currency=currency,
            enable_cost_analysis=enable_cost_analysis,
            optimize_for=optimize_for,
        )

        # Track metrics and log success
        duration = time.time() - start_time
        total_parts = sum(planqer_request.parts.values())
        waste_percent = (
            (result.total_waste / result.optimal_board_length) * 100
            if result.optimal_board_length > 0
            else 0
        )

        track_optimization_metrics(
            algorithm.value, True, duration, total_parts, result.cost, waste_percent
        )

        log_optimization_result(
            logger,
            request_id,
            algorithm.value,
            duration,
            result.cost,
            result.total_waste,
            True,
        )

        return result

    except HTTPException:
        raise
    except Exception as e:
        # Track error metrics and log failure
        duration = time.time() - start_time
        track_optimization_metrics(
            algorithm.value if "algorithm" in locals() else "unknown",
            False,
            duration,
            0,
            0,
            0,
        )

        # Enhanced error logging for debugging
        import traceback

        logger.error(f"[{request_id}] Optimization failed with detailed error:")
        logger.error(f"[{request_id}] Error type: {type(e).__name__}")
        logger.error(f"[{request_id}] Error message: {str(e)}")
        logger.error(f"[{request_id}] Full traceback: {traceback.format_exc()}")

        log_optimization_result(
            logger,
            request_id,
            algorithm.value if "algorithm" in locals() else "unknown",
            duration,
            0,
            0,
            False,
            str(e),
        )

        raise HTTPException(status_code=400, detail=f"Optimization failed: {str(e)}")


@cutting_router.post(
    "/async", summary="Start async optimization with progress tracking"
)
@limiter.limit("5/minute")  # Lower rate limit for async tasks
async def create_cutting_plan_async(
    request: Request, planqer_request: planqerRequest, background_tasks: BackgroundTasks
):
    """
    Start an optimization task in the background and return a task ID for progress tracking.

    Use this endpoint for complex optimizations that might take longer to complete.
    Connect to the WebSocket endpoint `/ws/{task_id}` to receive real-time progress updates.
    """
    # Generate request ID for tracking
    request_id = str(uuid4())[:8]
    task_id = generate_task_id()

    logger.info(
        f"[{request_id}] Received async /cutting-plans request from {request.client.host} | "
        f"Task ID: {task_id} | "
        f"Parts: {len(planqer_request.parts)} types | "
        f"Boards: {len(planqer_request.available_board_lengths)} lengths | "
        f"Project: {planqer_request.project_name or 'None'}"
    )

    try:
        parts = planqer_request.parts
        boards = planqer_request.available_board_lengths
        kerf = planqer_request.saw_blade_width

        # Additional validation logging for suspicious requests
        total_parts = sum(planqer_request.parts.values())
        if total_parts > 5000:
            logger.warning(
                f"[{request_id}] Large async request detected: {total_parts} total parts"
            )

        # Determine which algorithm to use
        algorithm = None
        if planqer_request.algorithm:
            algorithm = OptimizationAlgorithm(planqer_request.algorithm)
        else:
            # Auto-select algorithm based on problem characteristics
            algorithm = get_algorithm_recommendation(parts)
            logger.info(f"[{request_id}] Auto-selected algorithm: {algorithm.value}")

        # Create task and add to background processing
        task_manager.create_task(task_id)

        background_tasks.add_task(
            process_optimization_async,
            task_id,
            parts,
            boards,
            kerf,
            planqer_request.project_name,
            algorithm,
            logger,
            planqerResponse,
        )

        logger.info(f"[{request_id}] Async task {task_id} queued successfully")

        return {
            "task_id": task_id,
            "status": "queued",
            "message": "Optimization task started. Connect to WebSocket for progress updates.",
            "websocket_url": f"/ws/{task_id}",
            "progress_url": f"/api/tasks/{task_id}",
        }

    except Exception as e:
        logger.error(f"[{request_id}] Async task creation failed: {str(e)}")
        raise HTTPException(
            status_code=400, detail=f"Failed to create async task: {str(e)}"
        )


@app.get("/api/tasks/{task_id}", summary="Get task progress")
async def get_task_status(task_id: str):
    """Get the current status and progress of an optimization task."""
    progress = get_task_progress(task_id)
    if not progress:
        raise HTTPException(status_code=404, detail="Task not found")

    return progress


@app.websocket("/ws/{task_id}")
async def websocket_endpoint(websocket: WebSocket, task_id: str):
    """
    WebSocket endpoint for real-time task progress updates.

    Connect to this endpoint after starting an async optimization task
    to receive live progress updates until completion.
    """
    await websocket.accept()
    track_websocket_connection(1)
    log_websocket_event(logger, "connection_opened", task_id)

    # Check if task exists
    if not task_manager.get_task(task_id):
        await websocket.send_json({"error": "Task not found", "task_id": task_id})
        await websocket.close()
        track_websocket_connection(-1)
        return

    # Add WebSocket to task manager
    task_manager.add_websocket(task_id, websocket)

    try:
        # Send initial task status
        initial_progress = get_task_progress(task_id)
        if initial_progress:
            await websocket.send_json(initial_progress)

        # Keep connection alive and handle client messages
        while True:
            try:
                # Wait for client messages (or ping to keep alive)
                await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
            except asyncio.TimeoutError:
                # Send ping to keep connection alive
                await websocket.send_json({"type": "ping"})
            except WebSocketDisconnect:
                log_websocket_event(logger, "connection_closed", task_id)
                break

    except WebSocketDisconnect:
        log_websocket_event(logger, "connection_closed", task_id)
    except Exception as e:
        log_error(logger, e, {"task_id": task_id, "websocket": True})
    finally:
        # Clean up WebSocket connection
        task_manager.remove_websocket(task_id, websocket)
        track_websocket_connection(-1)


@app.get("/cache/info", summary="Get cache statistics")
async def get_cache_statistics():
    """Get optimization cache statistics for monitoring."""
    return get_cache_info()


@app.post("/cache/clear", summary="Clear the optimization cache")
async def clear_optimization_cache():
    """Clear the optimization cache. Useful for debugging or memory management."""
    clear_cache()
    return {"message": "Cache cleared successfully"}


@app.get("/health", summary="Health check endpoint")
async def health_check():
    """
    Health check endpoint for Docker and monitoring systems.

    Returns service status, timestamp, and basic system information.
    """
    try:
        # Test that we can access core components
        from planqer.cache import get_cache_info

        # Get cache info to ensure caching system is working
        cache_info = get_cache_info()

        return {
            "status": "healthy",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "version": __version__,
            "service": "planqer-api",
            "cache": {
                "size": cache_info["cache_size"],
                "max_size": cache_info["max_size"],
            },
        }
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        raise HTTPException(status_code=503, detail=f"Service unhealthy: {str(e)}")


@app.get("/algorithms", summary="Get available optimization algorithms")
async def get_available_algorithms():
    """
    Get list of available optimization algorithms with descriptions.
    """
    algorithms = []
    for alg in OptimizationAlgorithm:
        description = ""
        if alg == OptimizationAlgorithm.FIRST_FIT_DECREASING:
            description = (
                "Fast algorithm that places parts in first available board (O(n²))"
            )
        elif alg == OptimizationAlgorithm.BEST_FIT:
            description = "Places parts in board with least remaining space (O(n²))"
        elif alg == OptimizationAlgorithm.BEST_FIT_DECREASING:
            description = "Best fit with parts sorted by size (O(n²))"
        elif alg == OptimizationAlgorithm.GENETIC_ALGORITHM:
            description = "Evolutionary algorithm for near-optimal solutions (O(g*p*n))"
        elif alg == OptimizationAlgorithm.BRANCH_AND_BOUND:
            description = "Exact algorithm guaranteeing optimal solution (O(2^n))"

        algorithms.append(
            {
                "name": alg.value,
                "description": description,
                "recommended_for": _get_algorithm_use_case(alg),
            }
        )

    return {"algorithms": algorithms}


def _get_algorithm_use_case(algorithm: OptimizationAlgorithm) -> str:
    """Get recommended use case for each algorithm."""
    if algorithm == OptimizationAlgorithm.FIRST_FIT_DECREASING:
        return "Large problems (>50 parts) where speed is important"
    elif algorithm == OptimizationAlgorithm.BEST_FIT:
        return "Medium problems with diverse part sizes"
    elif algorithm == OptimizationAlgorithm.BEST_FIT_DECREASING:
        return "Medium problems with diverse part sizes (usually best general choice)"
    elif algorithm == OptimizationAlgorithm.GENETIC_ALGORITHM:
        return "Complex problems (10-50 parts) where solution quality matters more than speed"
    elif algorithm == OptimizationAlgorithm.BRANCH_AND_BOUND:
        return "Small problems (<20 parts) requiring optimal solutions"
    else:
        return "General use"


@sheet_router.post(
    "",
    response_model=SheetOptimizationResponse,
    summary="Generate optimal cutting plan for sheet materials",
)
@limiter.limit("10/minute")
async def create_sheet_optimization(
    request: Request,
    sheet_request: SheetOptimizationRequest,
):
    """
    Optimize cutting patterns for sheet materials like plywood, metal sheets, etc.

    This endpoint performs 2D bin packing to minimize waste when cutting rectangular
    parts from sheet materials. It supports rotation, multiple algorithms, and various
    material types.
    """
    # Generate request ID for tracking
    request_id = str(uuid4())[:8]

    logger.info(
        f"[{request_id}] Received /sheet-optimization request from {request.client.host} | "
        f"Parts: {len(sheet_request.parts)} types | "
        f"Sheet: {sheet_request.sheet_width}x{sheet_request.sheet_height} | "
        f"Material: {sheet_request.material_type} | "
        f"Project: {sheet_request.project_name or 'None'}"
    )

    # Debug: Log all relevant headers for TrustedHostMiddleware configuration
    logger.info(
        f"[{request_id}] DEBUG Host headers - Host: {request.headers.get('host')}"
    )
    logger.info(
        f"[{request_id}] DEBUG Host headers - X-Forwarded-Host: {request.headers.get('x-forwarded-host')}"
    )
    logger.info(
        f"[{request_id}] DEBUG Host headers - X-Original-Host: {request.headers.get('x-original-host')}"
    )
    logger.info(
        f"[{request_id}] DEBUG Host headers - X-Forwarded-For: {request.headers.get('x-forwarded-for')}"
    )
    logger.info(
        f"[{request_id}] DEBUG Host headers - All headers: {dict(request.headers)}"
    )

    try:
        import time

        start_time = time.time()

        # Convert parts format for sheet optimization
        parts_dict = {}
        for part_id, spec in sheet_request.parts.items():
            parts_dict[part_id] = {
                "width": spec.width,
                "height": spec.height,
                "quantity": spec.quantity,
            }

        # Determine algorithm
        algorithm = None
        if sheet_request.algorithm:
            algorithm = SheetOptimizationAlgorithm(sheet_request.algorithm)
        else:
            algorithm = get_sheet_algorithm_recommendation(parts_dict)
            logger.info(f"[{request_id}] Auto-selected algorithm: {algorithm.value}")

        # Run optimization
        result = optimize_sheet_cutting(
            parts=parts_dict,
            sheet_width=sheet_request.sheet_width,
            sheet_height=sheet_request.sheet_height,
            kerf_width=sheet_request.kerf_width,
            material_type=sheet_request.material_type,
            algorithm=algorithm,
            allow_rotation=sheet_request.allow_rotation,
        )

        computation_time = time.time() - start_time

        # Convert result to response format
        sheets_info = []
        for sheet in result.sheets:
            parts_list = []
            for part in sheet.parts:
                parts_list.append(
                    {
                        "part_id": part.part_id,
                        "width": part.width,
                        "height": part.height,
                        "x": part.x,
                        "y": part.y,
                        "rotated": part.rotated,
                    }
                )

            sheet_info = SheetLayoutInfo(
                sheet_width=sheet.sheet_width,
                sheet_height=sheet.sheet_height,
                used_area=sheet.used_area,
                waste_area=sheet.waste_area,
                efficiency=sheet.efficiency,
                parts_count=len(sheet.parts),
                parts=parts_list,
            )
            sheets_info.append(sheet_info)

        # Generate 2D sheet visualization
        try:
            sheet_data = {
                "sheets": sheets_info,  # Use the processed sheets_info instead of raw result.sheets
                "overall_efficiency": result.overall_efficiency,
                "total_waste_area": result.total_waste_area,
            }
            logger.info(
                f"[{request_id}] Generating visualization with {len(sheets_info)} sheets"
            )

            from planqer.sheet_visualization import generate_sheet_cutting_visualization

            visualization = generate_sheet_cutting_visualization(
                sheet_data, sheet_request.project_name
            )
        except Exception as e:
            logger.error(
                f"[{request_id}] Failed to generate sheet visualization: {str(e)}"
            )
            import traceback

            logger.error(f"[{request_id}] Traceback: {traceback.format_exc()}")
            visualization = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjRkZGRkZGIi8+PHRleHQgeD0iMjAwIiB5PSIxMDAiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNiIgZmlsbD0iIzY2NiI+Tm8gc2hlZXQgbGF5b3V0IGF2YWlsYWJsZTwvdGV4dD48L3N2Zz4="

        logger.info(f"[{request_id}] Sheet optimization completed successfully")

        response = SheetOptimizationResponse(
            total_sheets=result.total_sheets,
            total_waste_area=result.total_waste_area,
            overall_efficiency=result.overall_efficiency,
            sheets=sheets_info,
            algorithm_used=result.algorithm_used.value,
            computation_time=computation_time,
            material_type=sheet_request.material_type,
            visualization=visualization,
        )

        # Solve and return only — keeping a layout is POST /api/sheet-projects,
        # once the user has named it and picked its project.
        return response

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[{request_id}] Sheet optimization failed: {str(e)}")
        raise HTTPException(
            status_code=400, detail=f"Sheet optimization failed: {str(e)}"
        )


@app.get("/sheet-algorithms", summary="Get available sheet optimization algorithms")
async def get_available_sheet_algorithms():
    """
    Get list of available sheet optimization algorithms with descriptions.
    """
    algorithms = []
    for alg in SheetOptimizationAlgorithm:
        description = ""
        recommended_for = ""
        if alg == SheetOptimizationAlgorithm.BOTTOM_LEFT_FILL:
            description = (
                "Bottom-left fill algorithm for efficient 2D rectangular packing"
            )
            recommended_for = "Small problems or when speed is priority"
        elif alg == SheetOptimizationAlgorithm.BEST_FIT_2D:
            description = (
                "2D best fit algorithm that minimizes waste by optimizing placement"
            )
            recommended_for = "Medium problems with diverse part sizes"
        elif alg == SheetOptimizationAlgorithm.GENETIC_2D:
            description = "Genetic algorithm for 2D optimization with multi-sheet waste minimization"
            recommended_for = "Complex problems with diverse part sizes requiring near-optimal solutions"
        elif alg == SheetOptimizationAlgorithm.GUILLOTINE_CUT:
            description = "Guillotine cutting algorithm ensuring straight-line cuts"
            recommended_for = "Manufacturing processes requiring guillotine cuts"

        implemented = alg in [
            SheetOptimizationAlgorithm.BOTTOM_LEFT_FILL,
            SheetOptimizationAlgorithm.BEST_FIT_2D,
            SheetOptimizationAlgorithm.GUILLOTINE_CUT,
            SheetOptimizationAlgorithm.GENETIC_2D,
        ]

        algorithms.append(
            {
                "name": alg.value,
                "description": description,
                "recommended_for": recommended_for,
                "implemented": implemented,
            }
        )

    return {"algorithms": algorithms}


@threed_router.post(
    "",
    response_model=ThreeDCutlistResponse,
    summary="Generate cutlist from 3D STL file",
)
@limiter.limit("5/minute")  # Lower rate limit for file processing
async def create_3d_cutlist(
    request: Request,
    file: UploadFile = File(..., description="STL file to process"),
    units: str = Form("mm", description="Units for dimensions (mm, cm, m, in, ft)"),
    round_precision: int = Form(
        1, description="Decimal places for rounding dimensions"
    ),
    project_name: str = Form(None, description="Optional project name"),
):
    """
    Process a 3D STL file and generate a cutting list for woodworking projects.

    This endpoint analyzes 3D models to extract component dimensions and automatically
    classifies them as boards, sheets, or other components. The results can be used
    directly or fed into the 1D cutting optimizer for board optimization.
    """
    # Generate request ID for tracking
    request_id = str(uuid4())[:8]
    start_time = time.time()

    # Log API request
    log_api_request(
        logger,
        "POST",
        "/3d-cutlist",
        str(request.client.host),
        request.headers.get("user-agent"),
        request_id,
    )

    logger.info(
        f"[{request_id}] Received /3d-cutlist request from {request.client.host} | "
        f"File: {file.filename} | Units: {units} | "
        f"Project: {project_name or 'None'}"
    )

    try:
        # Validate units
        valid_units = {"mm", "cm", "m", "in", "inch", "inches", "ft", "feet"}
        if units.lower() not in valid_units:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid units '{units}'. Valid options: {', '.join(valid_units)}",
            )

        # Validate round precision
        if not 0 <= round_precision <= 3:
            raise HTTPException(
                status_code=400,
                detail="Round precision must be between 0 and 3 decimal places",
            )

        # Sanitize project name
        if project_name:
            project_name = sanitize_project_name(project_name)

        # Process the STL file
        cutlist_items, planqer_parts = await process_uploaded_stl(
            file=file,
            units=units,
            round_precision=round_precision,
            project_name=project_name,
        )

        # Calculate statistics
        total_volume = sum(item.volume for item in cutlist_items)
        board_count = sum(1 for item in cutlist_items if item.type.value == "board")
        sheet_count = sum(1 for item in cutlist_items if item.type.value == "sheet")

        # Convert cutlist items to response format
        response_items = [
            CutListItemResponse(
                type=item.type.value,
                length=item.length,
                width=item.width,
                thickness=item.thickness,
                quantity=item.quantity,
                name=item.name,
                volume=item.volume,
            )
            for item in cutlist_items
        ]

        # Separate into boards and sheets for easy optimization workflow
        # Debug: Log the types we're seeing
        logger.info(
            f"[{request_id}] Component types found: {[item.type.value for item in cutlist_items]}"
        )

        boards = [
            CutListItemResponse(
                type=item.type.value,
                length=item.length,
                width=item.width,
                thickness=item.thickness,
                quantity=item.quantity,
                name=item.name,
                volume=item.volume,
            )
            for item in cutlist_items
            if item.type.value == "board"
        ]

        sheets = [
            CutListItemResponse(
                type=item.type.value,
                length=item.length,
                width=item.width,
                thickness=item.thickness,
                quantity=item.quantity,
                name=item.name,
                volume=item.volume,
            )
            for item in cutlist_items
            if item.type.value == "sheet"
        ]

        logger.info(
            f"[{request_id}] Separated into {len(boards)} boards and {len(sheets)} sheets"
        )

        processing_time = time.time() - start_time

        logger.info(
            f"[{request_id}] 3D cutlist processing completed successfully | "
            f"Items: {len(response_items)} | Boards: {board_count} | "
            f"Sheets: {sheet_count} | Time: {processing_time:.3f}s"
        )

        return ThreeDCutlistResponse(
            cutlist_items=response_items,
            total_items=len(response_items),
            total_volume=total_volume,
            project_name=project_name,
            units=units,
            processing_time=processing_time,
            boards=boards,
            sheets=sheets,
            planqer_parts=planqer_parts if planqer_parts else None,
            board_count=board_count,
            sheet_count=sheet_count,
        )

    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        processing_time = time.time() - start_time
        logger.error(f"[{request_id}] 3D cutlist processing failed: {str(e)}")

        log_error(
            logger,
            e,
            {
                "request_id": request_id,
                "filename": file.filename,
                "units": units,
                "processing_time": processing_time,
            },
        )

        raise HTTPException(
            status_code=500, detail=f"3D cutlist processing failed: {str(e)}"
        )


@step_router.post(
    "",
    response_model=StepCutlistResponse,
    summary="Generate cutlist from STEP CAD file",
)
@limiter.limit("3/minute")  # Lower rate limit for STEP processing (more intensive)
async def create_step_cutlist(
    request: Request,
    file: UploadFile = File(..., description="STEP file to process"),
    units: str = Form("mm", description="Units for dimensions (mm, cm, m, in, ft)"),
    round_precision: int = Form(
        1, description="Decimal places for rounding dimensions"
    ),
    project_name: str = Form(None, description="Optional project name"),
):
    """
    Process a STEP CAD file and generate a cutting list for woodworking projects.

    This endpoint analyzes STEP models to extract component dimensions with rich metadata
    including real component names, materials, and assembly structure from CAD software.
    The results can be used directly or fed into optimization endpoints.

    Enhanced features compared to STL processing:
    - Real component names from CAD software
    - Material information and properties
    - Assembly hierarchy and structure
    - Higher precision geometry (no triangulation)
    """
    # Generate request ID for tracking
    request_id = str(uuid4())[:8]
    start_time = time.time()

    # Log API request
    log_api_request(
        logger,
        "POST",
        "/step-cutlist",
        str(request.client.host),
        request.headers.get("user-agent"),
        request_id,
    )

    logger.info(
        f"[{request_id}] Received /step-cutlist request from {request.client.host} | "
        f"File: {file.filename} | Units: {units} | "
        f"Project: {project_name or 'None'}"
    )

    try:
        # Validate units
        valid_units = {"mm", "cm", "m", "in", "inch", "inches", "ft", "feet"}
        if units.lower() not in valid_units:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid units '{units}'. Valid options: {', '.join(valid_units)}",
            )

        # Validate round precision
        if not 0 <= round_precision <= 3:
            raise HTTPException(
                status_code=400,
                detail="Round precision must be between 0 and 3 decimal places",
            )

        # Sanitize project name
        if project_name:
            project_name = sanitize_project_name(project_name)

        # Process the STEP file
        cutlist_items, planqer_parts = await process_uploaded_step(
            file=file,
            units=units,
            round_precision=round_precision,
            project_name=project_name,
        )

        # Calculate statistics
        total_volume = sum(item.volume for item in cutlist_items)
        board_count = sum(1 for item in cutlist_items if item.type.value == "board")
        sheet_count = sum(1 for item in cutlist_items if item.type.value == "sheet")

        # Extract unique materials
        materials_used = list(
            set(
                item.material
                for item in cutlist_items
                if item.material and item.material != "Unknown"
            )
        )

        # Build assembly structure (simplified for now)
        assembly_structure = {}
        for item in cutlist_items:
            if item.assembly_path:
                parts = item.assembly_path.split("/")
                current = assembly_structure
                for part in parts:
                    if part not in current:
                        current[part] = {}
                    current = current[part]

        # Convert cutlist items to response format
        response_items = [
            StepCutListItemResponse(
                type=item.type.value,
                length=item.length,
                width=item.width,
                thickness=item.thickness,
                quantity=item.quantity,
                name=item.name,
                volume=item.volume,
                material=item.material,
                assembly_path=item.assembly_path,
                cad_id=item.cad_id,
            )
            for item in cutlist_items
        ]

        # Separate into boards and sheets for optimization workflow
        boards = [
            StepCutListItemResponse(
                type=item.type.value,
                length=item.length,
                width=item.width,
                thickness=item.thickness,
                quantity=item.quantity,
                name=item.name,
                volume=item.volume,
                material=item.material,
                assembly_path=item.assembly_path,
                cad_id=item.cad_id,
            )
            for item in cutlist_items
            if item.type.value == "board"
        ]

        sheets = [
            StepCutListItemResponse(
                type=item.type.value,
                length=item.length,
                width=item.width,
                thickness=item.thickness,
                quantity=item.quantity,
                name=item.name,
                volume=item.volume,
                material=item.material,
                assembly_path=item.assembly_path,
                cad_id=item.cad_id,
            )
            for item in cutlist_items
            if item.type.value == "sheet"
        ]

        processing_time = time.time() - start_time

        logger.info(
            f"[{request_id}] STEP cutlist processing completed successfully | "
            f"Items: {len(response_items)} | Boards: {board_count} | "
            f"Sheets: {sheet_count} | Materials: {len(materials_used)} | Time: {processing_time:.3f}s"
        )

        return StepCutlistResponse(
            cutlist_items=response_items,
            total_items=len(response_items),
            total_volume=total_volume,
            project_name=project_name,
            units=units,
            processing_time=processing_time,
            boards=boards,
            sheets=sheets,
            planqer_parts=planqer_parts if planqer_parts else None,
            board_count=board_count,
            sheet_count=sheet_count,
            materials_used=materials_used,
            assembly_structure=assembly_structure,
        )

    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        processing_time = time.time() - start_time
        logger.error(f"[{request_id}] STEP cutlist processing failed: {str(e)}")

        log_error(
            logger,
            e,
            {
                "request_id": request_id,
                "filename": file.filename,
                "units": units,
                "processing_time": processing_time,
            },
        )

        raise HTTPException(
            status_code=500, detail=f"STEP cutlist processing failed: {str(e)}"
        )


# --- Include Routers ---
app.include_router(auth_router)
app.include_router(settings_router)
app.include_router(projects_router)
app.include_router(sheet_projects_router)
app.include_router(project_groups_router)
app.include_router(admin_router)
app.include_router(cutting_router)
app.include_router(sheet_router)
app.include_router(threed_router)
app.include_router(step_router)
