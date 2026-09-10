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
        algorithm = (
            OptimizationAlgorithm(planqer_request.algorithm)
            if planqer_request.algorithm
            else get_algorithm_recommendation(parts)
        )
        costs = {}
        if planqer_request.cost_analysis and planqer_request.cost_analysis.get(
            "enabled"
        ):
            analysis = planqer_request.cost_analysis
            for length, data in (
                analysis.get("board_costs", {}) or analysis.get("boardCosts", {})
            ).items():
                costs[float(length)] = {
                    "price_per_board": data.get("price_per_board", 0.0),
                    "supplier": "default",
                    "bulk_discount": 0.0,
                    "minimum_quantity": 1,
                }
            currency = analysis.get("currency", "SEK")
            enabled = True
            optimize_for = analysis.get("optimizeFor", "waste")
        else:
            costs = {
                float(k): {
                    "price_per_board": v.price_per_board,
                    "supplier": v.supplier,
                    "bulk_discount": v.bulk_discount,
                    "minimum_quantity": v.minimum_quantity,
                }
                for k, v in planqer_request.board_costs.items()
            }
            currency = planqer_request.currency
            enabled = planqer_request.enable_cost_analysis
            optimize_for = "waste"
        result = run_optimization(
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
    algorithm = (
        OptimizationAlgorithm(planqer_request.algorithm)
        if planqer_request.algorithm
        else get_algorithm_recommendation(planqer_request.parts)
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
    )
    return {
        "task_id": task_id,
        "status": "queued",
        "message": "Optimization task started. Connect to WebSocket for progress updates.",
        "websocket_url": f"/ws/{task_id}",
        "progress_url": f"/api/tasks/{task_id}",
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
