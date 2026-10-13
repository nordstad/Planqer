"""Redraw a saved project's diagram from the plan the user approved.

Used by the saved-project endpoints and by the browser runtime (`local_api`),
so a project saved in either place stores the same image.

Nothing here may import the server stack; `tests/test_core_isolation.py` runs
this module with it blocked.
"""

import logging
from types import SimpleNamespace

from planqer.sheet_visualization import generate_saved_sheet_diagram
from planqer.svg_visualization import generate_saved_diagram
from planqer.tile_layout.geometry import Cutout, PlacedTile, Surface, TileKind
from planqer.tile_visualization import generate_saved_tile_diagram

logger = logging.getLogger("planqer.saved_diagrams")


def render_saved_board_diagram(
    optimization_result: dict, saw_blade_width: float, name: str
) -> str | None:
    """Redraw the plan's diagram, now captioned with the name the user gave it.

    Drawn here rather than taken from the browser, and drawn from the submitted
    plan rather than by solving again: the genetic algorithm is not
    deterministic, so a second solve could store a different plan than the one
    the user approved on screen.
    """
    cut_list = optimization_result.get("cut_list")
    if not cut_list:
        return None

    board_lengths_used = optimization_result.get(
        "board_lengths_used"
    ) or optimization_result.get("optimal_board_length")
    if not board_lengths_used:
        return None

    try:
        return generate_saved_diagram(
            cut_list,
            board_lengths_used,
            saw_blade_width=saw_blade_width,
            project_name=name,
        )
    except Exception as e:
        # A missing diagram is worth far less than a lost plan — keep the save.
        logger.warning(f"Failed to render diagram for saved project '{name}': {e}")
        return None


def render_saved_sheet_layout(
    optimization_result: dict | None, name: str
) -> str | None:
    """Redraw the layout's diagram, now captioned with the name the user gave it.

    Drawn from the submitted layout rather than by packing again: the 2D
    packers include a genetic strategy that is not deterministic, so a second
    run could store a different layout than the one the user approved.
    """
    if not optimization_result or not optimization_result.get("sheets"):
        return None

    try:
        return generate_saved_sheet_diagram(optimization_result, name)
    except Exception as e:
        # A missing diagram is worth far less than a lost layout — keep the save.
        logger.warning(
            f"Failed to render diagram for saved sheet project '{name}': {e}"
        )
        return None


def render_saved_tile_layout(
    surface_data: dict | None, layout_result: dict | None, name: str
) -> str | None:
    """Redraw the layout's diagram, now captioned with the name the user gave
    it. Drawn from the submitted candidate rather than by re-solving: the
    tile solver samples an offset grid, and re-running it is not guaranteed
    to reproduce the exact candidate the user picked from a ranked list.

    tile_visualization.py deliberately takes typed dataclasses, not raw
    dicts (see its own module docstring and .plans/tile-layout.md Phase 1
    notes on PlacedTileInfo) — so this rebuilds just enough of a
    solver.LayoutCandidate and geometry.Surface from the stored JSON to
    satisfy that contract, rather than loosening the visualizer back to
    untyped dict access.
    """
    if not layout_result or not layout_result.get("tiles") or not surface_data:
        return None

    try:
        cutouts = tuple(
            Cutout(
                x=c["x"],
                y=c["y"],
                width=c["width"],
                height=c["height"],
                label=c.get("label"),
            )
            for c in surface_data.get("cutouts", [])
        )
        surface = Surface(
            width=surface_data["width"], height=surface_data["height"], cutouts=cutouts
        )
        tiles = tuple(
            PlacedTile(
                x=t["x"],
                y=t["y"],
                width=t["width"],
                height=t["height"],
                nominal_width=t.get("nominal_width", t["width"]),
                nominal_height=t.get("nominal_height", t["height"]),
                rotated=t.get("rotated", False),
                kind=TileKind(t["kind"]),
                is_sliver=t.get("is_sliver", False),
                # A diagonal ("set on point") piece's true shape — x/y/width/
                # height above are only its bounding box for these; without
                # this, a saved diagonal project's re-render would silently
                # draw a rectangle instead of the real polygon.
                vertices=tuple(tuple(v) for v in t["vertices"])
                if t.get("vertices")
                else None,
                # Where an opening cuts into the piece — part of its identity
                # (see tile_size_key), so the saved re-render keeps the same
                # colours and labels as the layout the user was shown.
                notches=tuple(tuple(n) for n in t.get("notches", [])),
            )
            for t in layout_result["tiles"]
        )
        candidate = SimpleNamespace(
            label=layout_result.get("label", ""),
            tiles=tiles,
            tiles_to_purchase=layout_result.get("tiles_to_purchase", 0),
        )
        return generate_saved_tile_diagram(candidate, surface, name)
    except Exception as e:
        # A missing diagram is worth far less than a lost layout — keep the save.
        logger.warning(f"Failed to render diagram for saved tile project '{name}': {e}")
        return None
