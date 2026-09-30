import os
import tempfile
import time
from collections import Counter
from contextlib import contextmanager
from dataclasses import dataclass

from fastapi import HTTPException

from planqer.algorithms import OptimizationAlgorithm, optimize_cutting
from planqer.cache import get_cached_optimization
from planqer.cost_calculator import apply_bulk_discount, calculate_cost_analysis
from planqer.svg_visualization import generate_cut_list_image


@dataclass(frozen=True)
class BoardPlan:
    stock_length: float
    cuts: tuple[float, ...]


@contextmanager
def secure_temp_file(suffix=".png", prefix="planqer_"):
    """
    Create a secure temporary file with proper cleanup.

    This context manager ensures:
    - Files are created in the system's secure temp directory
    - Proper permissions are set (readable only by owner)
    - Automatic cleanup even if exceptions occur
    - Unpredictable filenames to prevent security issues
    """
    try:
        # Create secure temporary file
        with tempfile.NamedTemporaryFile(
            mode="w+b",
            suffix=suffix,
            prefix=prefix,
            delete=False,  # We'll handle deletion manually for better control
        ) as temp_file:
            temp_filename = temp_file.name

        # Set restrictive permissions (owner read/write only)
        os.chmod(temp_filename, 0o600)

        yield temp_filename

    finally:
        # Ensure cleanup happens even if there's an exception
        try:
            if os.path.exists(temp_filename):
                os.remove(temp_filename)
        except OSError:
            # Log the error but don't raise it to avoid masking the original exception
            pass


def _select_best_candidate(
    parts,
    boards,
    valid_boards,
    kerf,
    algorithm=OptimizationAlgorithm.FIRST_FIT_DECREASING,
    board_costs=None,
    optimize_for="waste",
):
    penalty = 100
    candidates = []

    for bl in valid_boards:
        try:
            # Use the new algorithm-based optimization
            result = optimize_cutting(parts, bl, kerf, algorithm)

            board_plans = _build_board_plans(
                result.cut_list,
                bl,
                boards,
                kerf,
                board_costs if optimize_for == "cost" else None,
            )
            total_waste, warnings = _calculate_plan_metrics(board_plans, kerf)

            # Calculate cost based on optimization objective
            if optimize_for == "cost" and board_costs:
                cost = _calculate_plan_cost(board_plans, board_costs)
            else:
                # Use waste-based cost (traditional approach)
                cost = total_waste + warnings * penalty

            candidates.append(
                (bl, cost, board_plans, total_waste, result.algorithm_used)
            )
        except Exception as e:
            # Re-raise as a more specific error to maintain error handling
            raise RuntimeError(f"Error optimizing for board length {bl}: {e}") from e

    if not candidates:
        raise HTTPException(
            status_code=400, detail="No valid cut list candidates found."
        )

    # Find best candidate
    return min(candidates, key=lambda x: x[1])


def _compute_optimization(
    parts,
    boards,
    kerf,
    algorithm=OptimizationAlgorithm.FIRST_FIT_DECREASING,
    board_costs=None,
    optimize_for="waste",
):
    """Compute and cache the selected plan at the service edge."""
    max_part = max(parts.keys())
    valid_boards = [bl for bl in boards if bl >= max_part]
    if not valid_boards:
        raise HTTPException(
            status_code=400, detail="No board is long enough for the largest part."
        )
    if optimize_for == "cost":
        if not board_costs:
            raise HTTPException(
                status_code=400,
                detail="Prices are required when optimizing for cost.",
            )
        missing_prices = [
            length
            for length in valid_boards
            if length not in board_costs
            or board_costs[length].get("price_per_board") is None
        ]
        if missing_prices:
            raise HTTPException(
                status_code=400,
                detail="Every eligible board length needs a price when optimizing for cost.",
            )

    start_time = time.time()
    best = _select_best_candidate(
        parts, boards, valid_boards, kerf, algorithm, board_costs, optimize_for
    )
    computation_time = time.time() - start_time

    # Return: (optimal_board_length, cost, board_plans, total_waste, algorithm_used, computation_time)
    return (*best[:4], best[4], computation_time)


def _build_board_plans(
    cut_list: list[list[float]],
    optimal_board_length: float,
    boards: list[float],
    kerf: float,
    board_costs: dict | None = None,
) -> list[BoardPlan]:
    plans = []
    for board_cuts in cut_list:
        total_used = sum(board_cuts) + max(len(board_cuts) - 1, 0) * kerf
        suitable_lengths = [length for length in boards if length >= total_used]
        if suitable_lengths and board_costs:
            stock_length = min(
                suitable_lengths,
                key=lambda length: board_costs[length]["price_per_board"],
            )
        else:
            stock_length = min(suitable_lengths) if suitable_lengths else optimal_board_length
        plans.append(BoardPlan(stock_length, tuple(board_cuts)))
    return plans


def _calculate_plan_metrics(
    board_plans: list[BoardPlan], kerf: float
) -> tuple[float, int]:
    total_waste = 0.0
    warning_count = 0
    for board_plan in board_plans:
        waste = (
            board_plan.stock_length
            - sum(board_plan.cuts)
            - max(len(board_plan.cuts) - 1, 0) * kerf
        )
        total_waste += waste
        if waste < 40:
            warning_count += 1
    return total_waste, warning_count


def _calculate_plan_cost(
    board_plans: list[BoardPlan], board_costs: dict
) -> float:
    quantities = Counter(board_plan.stock_length for board_plan in board_plans)
    total_cost = 0.0
    for stock_length, quantity in quantities.items():
        cost_data = board_costs.get(stock_length, {})
        total_cost += apply_bulk_discount(
            quantity,
            cost_data.get("price_per_board", 0.0),
            cost_data.get("bulk_discount", 0.0),
            cost_data.get("minimum_quantity", 1),
        ) * quantity
    return total_cost


def run_optimization(
    parts,
    boards,
    kerf,
    project_name,
    algorithm,
    logger,
    planqerResponse,
    board_costs=None,
    currency="SEK",
    enable_cost_analysis=False,
    optimize_for="waste",
):
    if not boards:
        logger.error("No board lengths provided in request.")
        raise HTTPException(status_code=400, detail="No board lengths provided.")

    if not parts:
        logger.error("No parts provided in request.")
        raise HTTPException(status_code=400, detail="No parts provided.")

    # Create a wrapper function that includes the algorithm and cost parameters
    def optimization_func(parts, boards, kerf):
        return _compute_optimization(
            parts, boards, kerf, algorithm, board_costs, optimize_for
        )

    # Use cached optimization
    try:
        (
            optimal_board_length,
            cost,
            board_plans,
            total_waste,
            algorithm_used,
            computation_time,
        ) = get_cached_optimization(
            parts,
            boards,
            kerf,
            optimization_func,
            algorithm.value,
            optimize_for,
            board_costs,
        )
        logger.info(
            f"Optimization result retrieved using {algorithm_used.value} (time: {computation_time:.3f}s)"
        )
    except Exception as e:
        logger.error(f"Optimization computation failed: {e}")
        raise

    planned_cuts = [list(board_plan.cuts) for board_plan in board_plans]
    individual_board_lengths = [board_plan.stock_length for board_plan in board_plans]

    # BoardPlan is the source of truth for the stock, cuts, waste, and cost
    # figures, as well as the diagram input.
    material_bought = sum(individual_board_lengths)
    kerf_loss = (
        sum(max(len(board_plan.cuts) - 1, 0) for board_plan in board_plans) * kerf
    )

    # Generate SVG visualization directly as data URL
    try:
        img_url = generate_cut_list_image(
            planned_cuts,
            individual_board_lengths,  # Pass individual board lengths
            "data:temp",  # Signal to return as data URL
            saw_blade_width=kerf,
            project_name=project_name,
        )
    except Exception as e:
        logger.error(f"Failed to generate visualization: {e}")
        # Don't fail the entire request if visualization fails
        img_url = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjRkZGRkZGIi8+PHRleHQgeD0iMjAwIiB5PSIxMDAiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNiIgZmlsbD0iIzY2NiI+Tm8gY3V0dGluZyBwbGFuIGF2YWlsYWJsZTwvdGV4dD48L3N2Zz4="  # Empty SVG

    # Calculate cost analysis if enabled and cost data provided
    cost_analysis = None
    if enable_cost_analysis and board_costs:
        try:
            cost_analysis = calculate_cost_analysis(
                cut_list=planned_cuts,
                board_lengths=boards,
                board_costs=board_costs,
                currency=currency,
                saw_blade_width=kerf,
                board_lengths_used=individual_board_lengths,
            )
            logger.info(
                f"Cost analysis calculated: Total cost {cost_analysis['total_cost']} {currency}"
            )
        except Exception as e:
            logger.warning(f"Cost analysis failed: {e}")
            # Continue without cost analysis rather than failing the request

    logger.info(
        f"Optimization successful (board: {optimal_board_length}, cost: {cost})"
    )

    return planqerResponse(
        optimal_board_length=optimal_board_length,
        cost=cost,
        total_waste=total_waste,
        material_bought=material_bought,
        kerf_loss=kerf_loss,
        board_lengths_used=individual_board_lengths,
        cut_list=planned_cuts,
        visualization=img_url,
        algorithm_used=algorithm_used.value,
        computation_time=computation_time,
        cost_analysis=cost_analysis,
    )
