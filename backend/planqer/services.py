import os
import tempfile
import time
from contextlib import contextmanager
from fastapi import HTTPException
from planqer.helpers import compute_metrics
from planqer.svg_visualization import generate_cut_list_image
from planqer.cache import get_cached_optimization
from planqer.algorithms import OptimizationAlgorithm, optimize_cutting
from planqer.cost_calculator import calculate_cost_analysis

@contextmanager
def secure_temp_file(suffix='.png', prefix='planqer_'):
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
            mode='w+b',
            suffix=suffix,
            prefix=prefix,
            delete=False  # We'll handle deletion manually for better control
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

def _compute_optimization(parts, boards, kerf, algorithm=OptimizationAlgorithm.FIRST_FIT_DECREASING, board_costs=None, optimize_for="waste"):
    """
    Internal function for computing optimization that can be cached.
    
    Returns: (optimal_board_length, cost, cut_list, total_waste, algorithm_used, computation_time)
    """
    max_part = max(parts.keys())
    valid_boards = [bl for bl in boards if bl >= max_part]
    if not valid_boards:
        raise HTTPException(
            status_code=400, detail="No board is long enough for the largest part."
        )

    penalty = 100
    candidates = []
    start_time = time.time()

    for bl in valid_boards:
        try:
            # Use the new algorithm-based optimization
            result = optimize_cutting(parts, bl, kerf, algorithm)
            
            # Calculate waste metrics
            total_waste, warnings = compute_metrics(result.cut_list, bl, saw_blade_width=kerf)
            
            # Calculate cost based on optimization objective
            if optimize_for == "cost" and board_costs and bl in board_costs:
                # Use actual monetary cost: number of boards * price per board
                num_boards = len(result.cut_list)
                board_cost_data = board_costs.get(bl, {})
                price_per_board = board_cost_data.get('price_per_board', 0)
                cost = num_boards * price_per_board
            else:
                # Use waste-based cost (traditional approach)
                cost = total_waste + warnings * penalty
            
            candidates.append((bl, cost, result.cut_list, total_waste, result.algorithm_used))
        except Exception as e:
            # Re-raise as a more specific error to maintain error handling
            raise Exception(f"Error optimizing for board length {bl}: {e}")

    if not candidates:
        raise HTTPException(status_code=400, detail="No valid cut list candidates found.")

    # Find best candidate
    best = min(candidates, key=lambda x: x[1])
    computation_time = time.time() - start_time
    
    # Return: (optimal_board_length, cost, cut_list, total_waste, algorithm_used, computation_time)
    return (*best[:4], best[4], computation_time)


def run_optimization(parts, boards, kerf, project_name, algorithm, logger, planqerResponse, board_costs=None, currency="SEK", enable_cost_analysis=False, optimize_for="waste"):
    if not boards:
        logger.error("No board lengths provided in request.")
        raise HTTPException(status_code=400, detail="No board lengths provided.")

    if not parts:
        logger.error("No parts provided in request.")
        raise HTTPException(status_code=400, detail="No parts provided.")

    # Create a wrapper function that includes the algorithm and cost parameters
    def optimization_func(parts, boards, kerf):
        return _compute_optimization(parts, boards, kerf, algorithm, board_costs, optimize_for)

    # Use cached optimization
    try:
        optimal_board_length, cost, cut_list, total_waste, algorithm_used, computation_time = get_cached_optimization(
            parts, boards, kerf, optimization_func, algorithm.value, optimize_for, board_costs
        )
        logger.info(f"Optimization result retrieved using {algorithm_used.value} (time: {computation_time:.3f}s)")
    except Exception as e:
        logger.error(f"Optimization computation failed: {e}")
        raise

    # Calculate individual board lengths for mixed-length visualization
    individual_board_lengths = []
    for board_cuts in cut_list:
        if not board_cuts:
            individual_board_lengths.append(optimal_board_length)
            continue
        
        # Calculate total length needed for this board (including kerf)
        total_used = sum(board_cuts) + kerf * (len(board_cuts) - 1) if len(board_cuts) > 1 else sum(board_cuts)
        
        # Find the optimal board length for this cutting plan
        suitable_lengths = [length for length in boards if length >= total_used]
        if suitable_lengths:
            individual_board_lengths.append(min(suitable_lengths))
        else:
            individual_board_lengths.append(optimal_board_length)

    # One source of truth for the plan's material figures. individual_board_lengths
    # is kerf-aware and is what the diagram draws, so every reported number is
    # derived from it — cost analysis included. Deriving them twice is how the
    # order list once said SPF-36 while the diagram drew a 4200 mm board.
    material_bought = sum(individual_board_lengths)
    parts_total = sum(sum(board_cuts) for board_cuts in cut_list)
    kerf_loss = sum(max(len(board_cuts) - 1, 0) for board_cuts in cut_list) * kerf
    # Offcut is what is left over after the parts and the blade have taken theirs.
    total_waste = material_bought - parts_total - kerf_loss

    # Generate SVG visualization directly as data URL
    try:
        img_url = generate_cut_list_image(
            cut_list,
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
                cut_list=cut_list,
                board_lengths=boards,
                board_costs=board_costs,
                currency=currency,
                saw_blade_width=kerf,
                board_lengths_used=individual_board_lengths,
            )
            logger.info(f"Cost analysis calculated: Total cost {cost_analysis['total_cost']} {currency}")
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
        cut_list=cut_list,
        visualization=img_url,
        algorithm_used=algorithm_used.value,
        computation_time=computation_time,
        cost_analysis=cost_analysis,
    )
