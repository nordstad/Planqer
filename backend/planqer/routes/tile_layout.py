import time

from fastapi import APIRouter, HTTPException
from starlette.requests import Request

from planqer.schemas import (
    PlacedTileInfo,
    TileLayoutCandidateResponse,
    TileLayoutRequest,
    TileLayoutResponse,
)
from planqer.tile_layout.geometry import (
    Cutout,
    JointSpec,
    Surface,
    Tile,
    TileKind,
    polygon_edge_lengths,
)
from planqer.tile_layout.solver import solve_tile_layout
from planqer.tile_visualization import (
    FULL_TILE_FILL,
    assign_size_colors,
    assign_size_labels,
    generate_diagonal_piece_diagram,
    generate_tile_layout_visualization,
    tile_size_key,
)

router = APIRouter(prefix="/tile-layout", tags=["Tile Layout"])
from .common import limiter


@router.post(
    "",
    response_model=TileLayoutResponse,
    summary="Generate ranked tile/surface layout candidates",
)
@limiter.limit("10/minute")
async def create_tile_layout(request: Request, tile_request: TileLayoutRequest):
    try:
        started = time.time()
        surface = Surface(
            width=tile_request.surface_width,
            height=tile_request.surface_height,
            cutouts=tuple(
                Cutout(x=c.x, y=c.y, width=c.width, height=c.height, label=c.label)
                for c in tile_request.cutouts
            ),
        )
        tile = Tile(
            width=tile_request.tile.width,
            height=tile_request.tile.height,
            allow_rotation=tile_request.tile.allow_rotation,
        )
        joint = JointSpec(
            joint_width=tile_request.joint.joint_width,
            perimeter_gap=tile_request.joint.perimeter_gap,
        )
        result = solve_tile_layout(
            surface=surface,
            tile=tile,
            joint=joint,
            bond_pattern=tile_request.bond.pattern,
            offset_fraction=tile_request.bond.offset_fraction,
            min_edge_cut=tile_request.min_edge_cut,
            reuse_offcuts=tile_request.reuse_offcuts,
            waste_percent=tile_request.waste_percent,
            candidate_count=tile_request.candidate_count,
        )
        responses = []
        for candidate in result.candidates:
            colors, labels = (
                assign_size_colors(candidate.tiles),
                assign_size_labels(candidate.tiles),
            )
            reused = {i for i, _ in candidate.offcuts.matches}
            diagrams = {}
            for item in candidate.tiles:
                key = tile_size_key(item)
                if (
                    item.vertices is not None
                    and item.kind != TileKind.FULL
                    and labels[key] not in diagrams
                ):
                    diagrams[labels[key]] = generate_diagonal_piece_diagram(
                        item, colors[key]
                    )
            tiles = [
                PlacedTileInfo(
                    x=t.x,
                    y=t.y,
                    width=t.width,
                    height=t.height,
                    nominal_width=t.nominal_width,
                    nominal_height=t.nominal_height,
                    rotated=t.rotated,
                    kind=t.kind.value,
                    is_sliver=t.is_sliver,
                    is_reused_offcut=i in reused,
                    fill_color=FULL_TILE_FILL
                    if t.kind == TileKind.FULL
                    else colors[tile_size_key(t)],
                    size_label=None
                    if t.kind == TileKind.FULL
                    else labels[tile_size_key(t)],
                    edge_lengths=polygon_edge_lengths(t.vertices)
                    if t.vertices is not None
                    else None,
                    vertices=list(t.vertices) if t.vertices is not None else None,
                )
                for i, t in enumerate(candidate.tiles)
            ]
            responses.append(
                TileLayoutCandidateResponse(
                    label=candidate.label,
                    offset_x=candidate.offset_x,
                    offset_y=candidate.offset_y,
                    rotated=candidate.rotated,
                    tiles=tiles,
                    full_tile_count=candidate.metrics.full_tile_count,
                    cut_tile_count=candidate.metrics.cut_tile_count,
                    notched_count=candidate.metrics.notched_count,
                    tiles_to_purchase=candidate.tiles_to_purchase,
                    tiles_to_purchase_with_waste=candidate.tiles_to_purchase_with_waste,
                    reused_offcut_count=candidate.offcuts.reused_count,
                    min_edge_cut_width=candidate.metrics.min_edge_cut_width,
                    min_edge_cut_height=candidate.metrics.min_edge_cut_height,
                    min_diagonal_cut_span=candidate.metrics.min_diagonal_cut_span,
                    sliver_count=candidate.metrics.sliver_count,
                    symmetry_delta_x=candidate.metrics.symmetry_delta_x,
                    symmetry_delta_y=candidate.metrics.symmetry_delta_y,
                    distinct_cut_sizes=candidate.metrics.distinct_cut_sizes,
                    coverage_area=candidate.metrics.coverage_area,
                    waste_area=candidate.metrics.waste_area,
                    efficiency=candidate.metrics.efficiency,
                    is_pareto_optimal=candidate.is_pareto_optimal,
                    warnings=list(candidate.warnings),
                    visualization=generate_tile_layout_visualization(
                        candidate, surface, tile_request.project_name
                    ),
                    piece_diagrams=diagrams,
                )
            )
        return TileLayoutResponse(
            candidates=responses,
            recommended_index=result.recommended_index,
            surface_area=result.surface_area,
            net_area=result.net_area,
            computation_time=time.time() - started,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Tile layout failed: {exc!s}")
