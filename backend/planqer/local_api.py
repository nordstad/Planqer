"""One entry point for running Planqer without a server.

In the browser there is no HTTP layer, so the front end calls `handle` with an
operation name and a JSON request, and gets back what the matching endpoint
would have answered: a status code and the JSON body. Requests are validated by
the same schemas and run by the same service functions as the endpoints, so the
two cannot drift apart.

Nothing here may import the server stack; `tests/test_core_isolation.py` runs
this module with it blocked.
"""

import json
import logging
from collections.abc import Callable
from typing import Annotated, Literal

from pydantic import BaseModel, Field, TypeAdapter, ValidationError

from planqer.catalogue.loader import resolve_country
from planqer.catalogue.local import (
    NewProduct,
    ProductDetails,
    add_entry,
    layered_catalogue,
    list_items,
    reset_entry,
    set_entry_hidden,
    suggest_entry,
    update_entry,
)
from planqer.catalogue.search import search_products
from planqer.cutlist_services import run_cutlist_3d, run_cutlist_step
from planqer.errors import PlanqerError
from planqer.saved_diagrams import (
    render_saved_board_diagram,
    render_saved_sheet_layout,
    render_saved_tile_layout,
    render_saved_wallpaper_plan,
)
from planqer.schemas import (
    PlanqerRequest,
    PlanqerResponse,
    SheetOptimizationRequest,
    TileLayoutRequest,
)
from planqer.schemas.saved import (
    CreateSheetProjectRequest,
    CreateTileProjectRequest,
    ProjectCreateRequest,
    ProjectGroupRequest,
    ProjectUpdateRequest,
    UpdateSheetProjectRequest,
    UpdateTileProjectRequest,
    UpdateWallpaperProjectRequest,
    UserSettingsUpdate,
    WallpaperProjectRequest,
)
from planqer.schemas.wallpaper import WallpaperPlanRequest
from planqer.services import normalize_optimization_options, run_optimization
from planqer.sheet_services import run_sheet_optimization
from planqer.tile_services import run_tile_layout
from planqer.wallpaper.plan import create_wallpaper_plan

logger = logging.getLogger("planqer.local_api")


def _cutting_plan(payload: dict) -> dict:
    request = PlanqerRequest.model_validate(payload)
    try:
        algorithm, costs, currency, enabled, optimize_for = (
            normalize_optimization_options(request)
        )
        result = run_optimization(
            request.parts,
            request.available_board_lengths,
            request.saw_blade_width,
            request.project_name,
            algorithm,
            logger,
            PlanqerResponse,
            board_costs=costs,
            currency=currency,
            enable_cost_analysis=enabled,
            optimize_for=optimize_for,
        )
    except PlanqerError:
        raise
    except Exception as exc:
        raise PlanqerError(400, f"Optimization failed: {exc!s}") from exc
    return result.model_dump(mode="json")


def _sheet_optimization(payload: dict) -> dict:
    request = SheetOptimizationRequest.model_validate(payload)
    try:
        result = run_sheet_optimization(request)
    except PlanqerError:
        raise
    except Exception as exc:
        raise PlanqerError(400, f"Sheet optimization failed: {exc!s}") from exc
    return result.model_dump(mode="json")


def _tile_layout(payload: dict) -> dict:
    request = TileLayoutRequest.model_validate(payload)
    try:
        result = run_tile_layout(request)
    except ValueError as exc:
        raise PlanqerError(400, str(exc)) from exc
    except Exception as exc:
        raise PlanqerError(400, f"Tile layout failed: {exc!s}") from exc
    return result.model_dump(mode="json")


def _wallpaper_plan(payload: dict) -> dict:
    request = WallpaperPlanRequest.model_validate(payload)
    try:
        result = create_wallpaper_plan(request)
    except ValueError as exc:
        raise PlanqerError(400, str(exc)) from exc
    return result


class StoredCatalogueEntry(BaseModel):
    product_id: str
    hidden: bool = False
    data: str | None = None


class CatalogueRequest(BaseModel):
    """Which country's catalogue, and the user's own stored changes to it."""

    country: str | None = Field(default=None, max_length=10)
    entries: list[StoredCatalogueEntry] = []


class CatalogueSearchRequest(CatalogueRequest):
    # The same limits the endpoint puts on its query parameters.
    q: str = Field(default="", max_length=100)
    kind: Literal["board", "sheet"] | None = None
    limit: int = Field(default=20, ge=1, le=50)
    lang: Literal["en", "sv", "nb"] = "en"


class CatalogueAdminRequest(BaseModel):
    """One edit to the user's own catalogue entries.

    The operation holds no state: the browser sends the entries it has stored
    and applies the change that comes back.
    """

    action: Literal["list", "add", "update", "hide", "restore", "suggest", "reset"]
    # The same limit as the admin endpoints' `catalogue` query parameter.
    catalogue: str | None = Field(default=None, max_length=10)
    entries: list[StoredCatalogueEntry] = []
    product_id: str | None = None
    body: dict = {}
    source: str | None = Field(default=None, max_length=500)
    country: str | None = Field(default=None, max_length=2)


def _put(change) -> dict:
    return {
        "put": {
            "product_id": change.product_id,
            "hidden": change.hidden,
            "data": change.data,
        }
    }


def _catalogue_admin(payload: dict) -> dict:
    request = CatalogueAdminRequest.model_validate(payload)
    view = resolve_country(request.catalogue)
    action, entries = request.action, request.entries

    if action == "list":
        items = list_items(view, entries)
        return {"result": [i.model_dump(mode="json") for i in items], "change": None}
    if action == "add":
        item, change = add_entry(NewProduct.model_validate(request.body), view, entries)
        return {"result": item.model_dump(mode="json"), "change": _put(change)}

    if not request.product_id:
        raise PlanqerError(422, f"'{action}' needs a product_id")
    product_id = request.product_id
    if action == "update":
        details = ProductDetails.model_validate(request.body)
        item, change = update_entry(product_id, details, view, entries)
        return {"result": item.model_dump(mode="json"), "change": _put(change)}
    if action in ("hide", "restore"):
        item, change = set_entry_hidden(product_id, action == "hide", view, entries)
        return {"result": item.model_dump(mode="json"), "change": _put(change)}
    if action == "suggest":
        suggestion = suggest_entry(
            product_id, view, entries, source=request.source, country=request.country
        )
        return {"result": suggestion.model_dump(mode="json"), "change": None}
    reset_entry(product_id, view, entries)
    return {"result": None, "change": {"delete": product_id}}


def _catalogue(payload: dict) -> dict:
    request = CatalogueRequest.model_validate(payload)
    return layered_catalogue(request.entries, request.country).model_dump(mode="json")


def _catalogue_search(payload: dict) -> list[dict]:
    request = CatalogueSearchRequest.model_validate(payload)
    results = search_products(
        layered_catalogue(request.entries, request.country),
        request.q,
        kind=request.kind,
        limit=request.limit,
        lang=request.lang,
    )
    return [result.model_dump(mode="json") for result in results]


class SavedBoardDiagram(BaseModel):
    kind: Literal["board"]
    name: str
    saw_blade_width: float
    optimization_result: dict


class SavedSheetDiagram(BaseModel):
    kind: Literal["sheet"]
    name: str
    optimization_result: dict | None = None


class SavedTileDiagram(BaseModel):
    kind: Literal["tile"]
    name: str
    surface_data: dict | None = None
    layout_result: dict | None = None


class SavedWallpaperDiagram(BaseModel):
    kind: Literal["wallpaper"]
    name: str
    room_data: dict | None = None
    plan_result: dict | None = None


_saved_diagram_request = TypeAdapter(
    Annotated[
        SavedBoardDiagram
        | SavedSheetDiagram
        | SavedTileDiagram
        | SavedWallpaperDiagram,
        Field(discriminator="kind"),
    ]
)


def _saved_diagram(payload: dict) -> dict:
    """The diagram stored with a saved project, or None when there is nothing
    to draw. Drawn from the approved plan, never by solving again."""
    request = _saved_diagram_request.validate_python(payload)
    if isinstance(request, SavedBoardDiagram):
        image = render_saved_board_diagram(
            request.optimization_result, request.saw_blade_width, request.name
        )
    elif isinstance(request, SavedSheetDiagram):
        image = render_saved_sheet_layout(request.optimization_result, request.name)
    elif isinstance(request, SavedWallpaperDiagram):
        image = render_saved_wallpaper_plan(
            request.room_data, request.plan_result, request.name
        )
    else:
        image = render_saved_tile_layout(
            request.surface_data, request.layout_result, request.name
        )
    return {"image": image}


# The model each kind of saved thing is validated with, for a new one and for
# an edit. Settings and groups use one model for both.
SAVED_REQUESTS: dict[str, dict[str, type[BaseModel]]] = {
    "board": {"create": ProjectCreateRequest, "update": ProjectUpdateRequest},
    "sheet": {"create": CreateSheetProjectRequest, "update": UpdateSheetProjectRequest},
    "tile": {"create": CreateTileProjectRequest, "update": UpdateTileProjectRequest},
    "wallpaper": {
        "create": WallpaperProjectRequest,
        "update": UpdateWallpaperProjectRequest,
    },
    "group": {"create": ProjectGroupRequest, "update": ProjectGroupRequest},
    "settings": {"create": UserSettingsUpdate, "update": UserSettingsUpdate},
}


class SavedRequest(BaseModel):
    kind: Literal["board", "sheet", "tile", "wallpaper", "group", "settings"]
    mode: Literal["create", "update"]
    body: dict


def _saved_request(payload: dict) -> dict:
    """Validate what the user wants to save, with the endpoint's own models.

    Returns the values to store: everything, defaults filled in, for a new
    one; only the fields that were sent, for an edit (an explicit null counts
    as sent, the same way the endpoints read it).
    """
    request = SavedRequest.model_validate(payload)
    saved = SAVED_REQUESTS[request.kind][request.mode].model_validate(request.body)
    if request.mode == "create":
        return {"values": saved.model_dump(mode="json")}
    return {"values": saved.model_dump(mode="json", include=saved.model_fields_set)}


def _model_cutlist(run: Callable, failure: str) -> Callable[[dict, bytes], dict]:
    def operation(options: dict, data: bytes) -> dict:
        try:
            result = run(
                data,
                options.get("filename"),
                options.get("units", "mm"),
                options.get("round_precision", 1),
                options.get("project_name"),
            )
        except PlanqerError:
            raise
        except Exception as exc:
            raise PlanqerError(500, f"{failure}: {exc!s}") from exc
        return result.model_dump(mode="json")

    return operation


OPERATIONS: dict[str, Callable[[dict], dict | list]] = {
    "cutting_plan": _cutting_plan,
    "sheet_optimization": _sheet_optimization,
    "tile_layout": _tile_layout,
    "wallpaper_plan": _wallpaper_plan,
    "catalogue": _catalogue,
    "catalogue_search": _catalogue_search,
    "catalogue_admin": _catalogue_admin,
    "saved_diagram": _saved_diagram,
    "saved_request": _saved_request,
}

# Operations that read a file: the JSON carries only the options, and the file
# contents arrive separately as bytes so a large model is not re-encoded.
FILE_OPERATIONS: dict[str, Callable[[dict, bytes], dict]] = {
    "cutlist_3d": _model_cutlist(run_cutlist_3d, "3D cutlist processing failed"),
    "cutlist_step": _model_cutlist(run_cutlist_step, "STEP cutlist processing failed"),
}


def handle(op: str, payload_json: str, data: bytes | None = None) -> str:
    """Run one operation and return `{"status": ..., "body": ...}` as JSON.

    `data` is the file contents for the operations that read a file.
    """
    if op not in OPERATIONS and op not in FILE_OPERATIONS:
        return _reply(404, {"detail": f"Unknown operation '{op}'"})
    try:
        payload = json.loads(payload_json)
        if op in FILE_OPERATIONS:
            if data is None:
                raise PlanqerError(400, f"Operation '{op}' needs a file")
            return _reply(200, FILE_OPERATIONS[op](payload, data))
        return _reply(200, OPERATIONS[op](payload))
    except PlanqerError as exc:
        return _reply(exc.status_code, {"detail": exc.detail})
    except ValidationError as exc:
        return _reply(422, {"detail": _validation_detail(exc)})


def _validation_detail(exc: ValidationError) -> list[dict]:
    """The shape FastAPI uses for a 422, so the front end reads it the same."""
    return [
        {"type": e["type"], "loc": ["body", *e["loc"]], "msg": e["msg"]}
        for e in exc.errors(include_url=False, include_context=False)
    ]


def _reply(status: int, body: dict | list) -> str:
    return json.dumps({"status": status, "body": body})
