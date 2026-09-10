from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException

from planqer import __version__
from planqer.algorithms import OptimizationAlgorithm
from planqer.async_processing import get_task_progress
from planqer.cache import clear_cache, get_cache_info
from planqer.sheet_optimization import SheetOptimizationAlgorithm

router = APIRouter(tags=["System"])


@router.get("/api/tasks/{task_id}", summary="Get task progress")
async def get_task_status(task_id: str):
    progress = get_task_progress(task_id)
    if not progress:
        raise HTTPException(status_code=404, detail="Task not found")
    return progress


@router.get("/cache/info", summary="Get cache statistics")
async def get_cache_statistics():
    return get_cache_info()


@router.post("/cache/clear", summary="Clear the optimization cache")
async def clear_optimization_cache():
    clear_cache()
    return {"message": "Cache cleared successfully"}


@router.get("/health", summary="Health check endpoint")
async def health_check():
    try:
        info = get_cache_info()
        return {
            "status": "healthy",
            "timestamp": datetime.now(UTC).isoformat(),
            "version": __version__,
            "service": "planqer-api",
            "cache": {"size": info["cache_size"], "max_size": info["max_size"]},
        }
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Service unhealthy: {exc!s}")


@router.get("/algorithms", summary="Get available optimization algorithms")
async def get_available_algorithms():
    descriptions = {
        OptimizationAlgorithm.FIRST_FIT_DECREASING: "Fast algorithm that places parts in first available board (O(n²))",
        OptimizationAlgorithm.BEST_FIT: "Places parts in board with least remaining space (O(n²))",
        OptimizationAlgorithm.BEST_FIT_DECREASING: "Best fit with parts sorted by size (O(n²))",
        OptimizationAlgorithm.GENETIC_ALGORITHM: "Evolutionary algorithm for near-optimal solutions (O(g*p*n))",
        OptimizationAlgorithm.BRANCH_AND_BOUND: "Exact algorithm guaranteeing optimal solution (O(2^n))",
    }
    recommendations = {
        OptimizationAlgorithm.FIRST_FIT_DECREASING: "Large problems (>50 parts) where speed is important",
        OptimizationAlgorithm.BEST_FIT: "Medium problems with diverse part sizes",
        OptimizationAlgorithm.BEST_FIT_DECREASING: "Medium problems with diverse part sizes (usually best general choice)",
        OptimizationAlgorithm.GENETIC_ALGORITHM: "Complex problems (10-50 parts) where solution quality matters more than speed",
        OptimizationAlgorithm.BRANCH_AND_BOUND: "Small problems (<20 parts) requiring optimal solutions",
    }
    return {
        "algorithms": [
            {
                "name": a.value,
                "description": descriptions.get(a, ""),
                "recommended_for": recommendations.get(a, "General use"),
            }
            for a in OptimizationAlgorithm
        ]
    }


@router.get("/sheet-algorithms", summary="Get available sheet optimization algorithms")
async def get_available_sheet_algorithms():
    descriptions = {
        SheetOptimizationAlgorithm.BOTTOM_LEFT_FILL: "Bottom-left fill algorithm for efficient 2D rectangular packing",
        SheetOptimizationAlgorithm.BEST_FIT_2D: "2D best fit algorithm that minimizes waste by optimizing placement",
        SheetOptimizationAlgorithm.GENETIC_2D: "Genetic algorithm for 2D optimization with multi-sheet waste minimization",
        SheetOptimizationAlgorithm.GUILLOTINE_CUT: "Guillotine cutting algorithm ensuring straight-line cuts",
    }
    recommendations = {
        SheetOptimizationAlgorithm.BOTTOM_LEFT_FILL: "Small problems or when speed is priority",
        SheetOptimizationAlgorithm.BEST_FIT_2D: "Medium problems with diverse part sizes",
        SheetOptimizationAlgorithm.GENETIC_2D: "Complex problems with diverse part sizes requiring near-optimal solutions",
        SheetOptimizationAlgorithm.GUILLOTINE_CUT: "Manufacturing processes requiring guillotine cuts",
    }
    return {
        "algorithms": [
            {
                "name": a.value,
                "description": descriptions.get(a, ""),
                "recommended_for": recommendations.get(a, ""),
                "implemented": True,
            }
            for a in SheetOptimizationAlgorithm
        ]
    }
