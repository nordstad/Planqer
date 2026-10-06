import asyncio
import logging
import time

from fastapi import APIRouter, BackgroundTasks, HTTPException
from starlette.requests import Request
from starlette.websockets import WebSocket, WebSocketDisconnect

from planqer.algorithms import OptimizationAlgorithm, get_algorithm_recommendation
from planqer.async_processing import (
    generate_task_id,
    get_task_progress,
    process_optimization_async,
    task_manager,
)
from planqer.logging_config import (
    log_error,
    log_websocket_event,
)
from planqer.metrics import (
    track_optimization_metrics,
    track_request_metrics,
    track_websocket_connection,
)
from planqer.schemas import PlanqerRequest, PlanqerResponse
from planqer.services import run_optimization

from .common import limiter

router = APIRouter(prefix="/cutting-plans", tags=["Cutting Plans"])
task_router = APIRouter()
logger = logging.getLogger("planqer.api")
OPTIMIZATION_TIMEOUT_SECONDS = 30.0


def normalize_optimization_options(planqer_request: PlanqerRequest):
    """Normalize solver options once for sync and background execution."""
    algorithm = (
        OptimizationAlgorithm(planqer_request.algorithm)
        if planqer_request.algorithm
        else get_algorithm_recommendation(planqer_request.parts)
    )
    if planqer_request.cost_analysis and planqer_request.cost_analysis.get("enabled"):
        analysis = planqer_request.cost_analysis
        costs = {
            float(length): {
                "price_per_board": data.get("price_per_board", 0.0),
                "supplier": "default",
                "bulk_discount": 0.0,
                "minimum_quantity": 1,
            }
            for length, data in (
                analysis.get("board_costs", {}) or analysis.get("boardCosts", {})
            ).items()
        }
        return (
            algorithm,
            costs,
            analysis.get("currency", "SEK"),
            True,
            analysis.get("optimizeFor", "waste"),
        )

    costs = {
        float(key): {
            "price_per_board": value.price_per_board,
            "supplier": value.supplier,
            "bulk_discount": value.bulk_discount,
            "minimum_quantity": value.minimum_quantity,
        }
        for key, value in planqer_request.board_costs.items()
    }
    return (
        algorithm,
        costs,
        planqer_request.currency,
        planqer_request.enable_cost_analysis,
        "waste",
    )


@router.post(
    "",
    response_model=PlanqerResponse,
    summary="Generate an optimal cutting plan for boards",
)
@limiter.limit("10/minute")
@track_request_metrics
async def create_cutting_plan(request: Request, planqer_request: PlanqerRequest):
    start_time = time.time()
    algorithm = None
    try:
        parts = planqer_request.parts
        algorithm, costs, currency, enabled, optimize_for = (
            normalize_optimization_options(planqer_request)
        )
        # A timed-out worker thread may finish in the background; input budgets
        # keep that bounded while preventing it from blocking this event loop.
        result = await asyncio.wait_for(
            asyncio.to_thread(
                run_optimization,
                parts,
                planqer_request.available_board_lengths,
                planqer_request.saw_blade_width,
                planqer_request.project_name,
                algorithm,
                logger,
                PlanqerResponse,
                board_costs=costs,
                currency=currency,
                enable_cost_analysis=enabled,
                optimize_for=optimize_for,
            ),
            timeout=OPTIMIZATION_TIMEOUT_SECONDS,
        )
        duration = time.time() - start_time
        track_optimization_metrics(
            algorithm.value,
            True,
            duration,
            sum(parts.values()),
            result.cost,
            (result.total_waste / result.optimal_board_length * 100)
            if result.optimal_board_length
            else 0,
        )
        return result
    except TimeoutError as exc:
        raise HTTPException(
            status_code=504,
            detail="Optimization exceeded the 30 second time limit",
        ) from exc
    except HTTPException:
        raise
    except Exception as exc:
        track_optimization_metrics(
            algorithm.value if algorithm else "unknown",
            False,
            time.time() - start_time,
            0,
            0,
            0,
        )
        raise HTTPException(status_code=400, detail=f"Optimization failed: {exc!s}")


@router.post("/async", summary="Start async optimization with progress tracking")
@limiter.limit("5/minute")
async def create_cutting_plan_async(
    request: Request, planqer_request: PlanqerRequest, background_tasks: BackgroundTasks
):
    task_id = generate_task_id()
    algorithm, costs, currency, enabled, optimize_for = normalize_optimization_options(
        planqer_request
    )
    task_manager.create_task(task_id)
    background_tasks.add_task(
        process_optimization_async,
        task_id,
        planqer_request.parts,
        planqer_request.available_board_lengths,
        planqer_request.saw_blade_width,
        planqer_request.project_name,
        algorithm,
        logger,
        PlanqerResponse,
        costs,
        currency,
        enabled,
        optimize_for,
    )
    root_path = request.scope.get("root_path", "")
    return {
        "task_id": task_id,
        "status": "queued",
        "message": "Optimization task started. Connect to WebSocket for progress updates.",
        "websocket_url": f"{root_path}/ws/{task_id}",
        "progress_url": f"{root_path}/tasks/{task_id}",
    }


@task_router.websocket("/ws/{task_id}")
async def websocket_endpoint(websocket: WebSocket, task_id: str):
    await websocket.accept()
    track_websocket_connection(1)
    log_websocket_event(logger, "connection_opened", task_id)
    if not task_manager.get_task(task_id):
        await websocket.send_json({"error": "Task not found", "task_id": task_id})
        await websocket.close()
        track_websocket_connection(-1)
        return
    task_manager.add_websocket(task_id, websocket)
    try:
        if progress := get_task_progress(task_id):
            await websocket.send_json(progress)
        while True:
            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
            except TimeoutError:
                await websocket.send_json({"type": "ping"})
            except WebSocketDisconnect:
                break
    except Exception as exc:
        log_error(logger, exc, {"task_id": task_id, "websocket": True})
    finally:
        task_manager.remove_websocket(task_id, websocket)
        track_websocket_connection(-1)
