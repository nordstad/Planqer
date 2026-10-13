import time

from planqer.schemas import (
    SheetLayoutInfo,
    SheetOptimizationRequest,
    SheetOptimizationResponse,
)
from planqer.sheet_optimization import (
    SheetOptimizationAlgorithm,
    get_sheet_algorithm_recommendation,
    optimize_sheet_cutting,
)
from planqer.sheet_visualization import (
    generate_sheet_cutting_visualization,
    generate_single_sheet_visualization,
)


def run_sheet_optimization(
    sheet_request: SheetOptimizationRequest,
) -> SheetOptimizationResponse:
    """Optimize a sheet cutting plan and draw it; shared by the API and the browser."""
    started = time.time()
    parts = {
        k: {"width": v.width, "height": v.height, "quantity": v.quantity}
        for k, v in sheet_request.parts.items()
    }
    algorithm = (
        SheetOptimizationAlgorithm(sheet_request.algorithm)
        if sheet_request.algorithm
        else get_sheet_algorithm_recommendation(parts)
    )
    result = optimize_sheet_cutting(
        parts=parts,
        sheet_width=sheet_request.sheet_width,
        sheet_height=sheet_request.sheet_height,
        kerf_width=sheet_request.kerf_width,
        material_type=sheet_request.material_type,
        algorithm=algorithm,
        allow_rotation=sheet_request.allow_rotation,
    )
    sheets = [
        SheetLayoutInfo(
            sheet_width=s.sheet_width,
            sheet_height=s.sheet_height,
            used_area=s.used_area,
            waste_area=s.waste_area,
            efficiency=s.efficiency,
            parts_count=len(s.parts),
            parts=[
                {
                    "part_id": p.part_id,
                    "width": p.width,
                    "height": p.height,
                    "x": p.x,
                    "y": p.y,
                    "rotated": p.rotated,
                }
                for p in s.parts
            ],
        )
        for s in result.sheets
    ]
    visualization = generate_sheet_cutting_visualization(
        {
            "sheets": sheets,
            "overall_efficiency": result.overall_efficiency,
            "total_waste_area": result.total_waste_area,
        },
        sheet_request.project_name,
    )
    sheet_visualizations = [
        generate_single_sheet_visualization(sheet.model_dump(), sheet_index)
        for sheet_index, sheet in enumerate(sheets)
    ]
    return SheetOptimizationResponse(
        total_sheets=result.total_sheets,
        total_waste_area=result.total_waste_area,
        overall_efficiency=result.overall_efficiency,
        sheets=sheets,
        algorithm_used=result.algorithm_used.value,
        computation_time=time.time() - started,
        material_type=sheet_request.material_type,
        visualization=visualization,
        sheet_visualizations=sheet_visualizations,
    )
