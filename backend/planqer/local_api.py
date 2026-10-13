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

from pydantic import ValidationError

from planqer.errors import PlanqerError
from planqer.schemas import (
    PlanqerRequest,
    PlanqerResponse,
    SheetOptimizationRequest,
    TileLayoutRequest,
)
from planqer.services import normalize_optimization_options, run_optimization
from planqer.sheet_services import run_sheet_optimization
from planqer.tile_services import run_tile_layout

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


OPERATIONS: dict[str, Callable[[dict], dict]] = {
    "cutting_plan": _cutting_plan,
    "sheet_optimization": _sheet_optimization,
    "tile_layout": _tile_layout,
}


def handle(op: str, payload_json: str) -> str:
    """Run one operation and return `{"status": ..., "body": ...}` as JSON."""
    try:
        operation = OPERATIONS[op]
    except KeyError:
        return _reply(404, {"detail": f"Unknown operation '{op}'"})
    try:
        return _reply(200, operation(json.loads(payload_json)))
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


def _reply(status: int, body: dict) -> str:
    return json.dumps({"status": status, "body": body})
