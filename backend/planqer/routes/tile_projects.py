import base64
import json
import logging
import re
from datetime import datetime
from types import SimpleNamespace
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from planqer.auth import get_current_user
from planqer.database import User, UserTileProject, get_session
from planqer.routes.project_groups import _get_owned_group
from planqer.tile_layout.geometry import Cutout, PlacedTile, Surface, TileKind
from planqer.tile_visualization import generate_saved_tile_diagram

router = APIRouter(prefix="/tile-projects", tags=["user-tile-projects"])
logger = logging.getLogger("planqer.routes.tile_projects")


class TileProjectResponse(BaseModel):
    id: UUID
    project_group_id: UUID | None = None
    name: str
    surface_data: dict
    tile_data: dict
    bond_data: dict
    options_data: dict
    layout_result: dict | None = None
    cutlist_image: str | None = None
    has_svg_image: bool = False
    created_at: str
    updated_at: str


class CreateTileProjectRequest(BaseModel):
    """A layout the user has chosen to keep. The diagram is redrawn
    server-side from surface_data + layout_result, so no image comes over
    the wire — same reasoning as CreateSheetProjectRequest."""

    name: str = Field(min_length=1, max_length=200)
    project_group_id: UUID | None = None
    surface_data: dict
    tile_data: dict
    bond_data: dict
    options_data: dict = {}
    layout_result: dict | None = None


class UpdateTileProjectRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    project_group_id: UUID | None = None
    surface_data: dict | None = None
    tile_data: dict | None = None
    bond_data: dict | None = None
    options_data: dict | None = None
    layout_result: dict | None = None


def _render_saved_layout(
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


def _load_json_dict(value: str | None) -> dict:
    if not value:
        return {}
    try:
        return json.loads(value)
    except (json.JSONDecodeError, TypeError):
        return {}


def tile_project_to_response(project: UserTileProject) -> TileProjectResponse:
    return TileProjectResponse(
        id=project.id,
        project_group_id=project.project_group_id,
        name=project.name,
        surface_data=_load_json_dict(project.surface_data),
        tile_data=_load_json_dict(project.tile_data),
        bond_data=_load_json_dict(project.bond_data),
        options_data=_load_json_dict(project.options_data),
        layout_result=_load_json_dict(project.layout_result) or None,
        cutlist_image=project.cutlist_image,
        has_svg_image=bool(project.cutlist_image_svg),
        created_at=project.created_at.isoformat(),
        updated_at=project.updated_at.isoformat(),
    )


async def _get_owned_tile_project(
    project_id: UUID, current_user: User, session: AsyncSession
) -> UserTileProject:
    stmt = select(UserTileProject).where(
        UserTileProject.id == project_id, UserTileProject.user_id == current_user.id
    )
    result = await session.execute(stmt)
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Tile project not found"
        )
    return project


@router.get("/", response_model=list[TileProjectResponse])
async def get_user_tile_projects(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    stmt = (
        select(UserTileProject)
        .where(UserTileProject.user_id == current_user.id)
        .order_by(UserTileProject.updated_at.desc())
    )
    result = await session.execute(stmt)
    return [tile_project_to_response(project) for project in result.scalars().all()]


@router.post("/", response_model=TileProjectResponse)
async def create_tile_project(
    project_data: CreateTileProjectRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    if project_data.project_group_id is not None:
        await _get_owned_group(project_data.project_group_id, current_user, session)

    svg_data_url = _render_saved_layout(
        project_data.surface_data, project_data.layout_result, project_data.name
    )

    project = UserTileProject(
        user_id=current_user.id,
        project_group_id=project_data.project_group_id,
        name=project_data.name,
        surface_data=json.dumps(project_data.surface_data),
        tile_data=json.dumps(project_data.tile_data),
        bond_data=json.dumps(project_data.bond_data),
        options_data=json.dumps(project_data.options_data or {}),
        layout_result=json.dumps(project_data.layout_result)
        if project_data.layout_result
        else None,
        cutlist_image=svg_data_url,
        cutlist_image_svg=svg_data_url,
    )

    session.add(project)
    await session.commit()
    await session.refresh(project)

    return tile_project_to_response(project)


@router.get("/{project_id}", response_model=TileProjectResponse)
async def get_tile_project(
    project_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    project = await _get_owned_tile_project(project_id, current_user, session)
    return tile_project_to_response(project)


@router.put("/{project_id}", response_model=TileProjectResponse)
async def update_tile_project(
    project_id: UUID,
    project_data: UpdateTileProjectRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    project = await _get_owned_tile_project(project_id, current_user, session)

    if project_data.project_group_id is not None:
        await _get_owned_group(project_data.project_group_id, current_user, session)

    if project_data.name is not None:
        project.name = project_data.name
    if "project_group_id" in project_data.model_fields_set:
        project.project_group_id = project_data.project_group_id
    if project_data.surface_data is not None:
        project.surface_data = json.dumps(project_data.surface_data)
    if project_data.tile_data is not None:
        project.tile_data = json.dumps(project_data.tile_data)
    if project_data.bond_data is not None:
        project.bond_data = json.dumps(project_data.bond_data)
    if project_data.options_data is not None:
        project.options_data = json.dumps(project_data.options_data)
    if project_data.layout_result is not None:
        project.layout_result = json.dumps(project_data.layout_result)

    # A rename or changed layout inputs both change what the diagram should show.
    svg_data_url = _render_saved_layout(
        _load_json_dict(project.surface_data),
        _load_json_dict(project.layout_result),
        project.name,
    )
    if svg_data_url:
        project.cutlist_image = svg_data_url
        project.cutlist_image_svg = svg_data_url

    project.updated_at = datetime.now()

    await session.commit()
    await session.refresh(project)

    return tile_project_to_response(project)


@router.delete("/{project_id}")
async def delete_tile_project(
    project_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    project = await _get_owned_tile_project(project_id, current_user, session)
    await session.delete(project)
    await session.commit()

    return {"message": "Tile project deleted successfully"}


@router.get("/{project_id}/image")
async def get_tile_project_image(
    project_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Serve a saved layout's diagram as SVG. See the board equivalent in
    routes/projects.py for why there is no `format` parameter."""
    project = await _get_owned_tile_project(project_id, current_user, session)

    selected_image = project.cutlist_image_svg or project.cutlist_image
    if not selected_image:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No diagram was saved with this layout",
        )

    if not selected_image.strip():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Image data is empty"
        )

    if selected_image.startswith(
        ("data:image/png;base64,", "data:image/svg+xml;base64,")
    ):
        image_data = selected_image.split(",", 1)[1]
    else:
        image_data = selected_image

    if not image_data.strip():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Base64 image data is empty"
        )

    try:
        if not re.match(r"^[A-Za-z0-9+/]*={0,2}$", image_data):
            raise ValueError("Invalid base64 format")

        image_bytes = base64.b64decode(image_data, validate=True)
        if len(image_bytes) == 0:
            raise ValueError("Decoded image data is empty")

        if selected_image.startswith("data:image/svg+xml;base64,"):
            media_type, file_extension = "image/svg+xml", "svg"
        else:
            media_type, file_extension = "image/png", "png"

        project_name_safe = re.sub(r"[^\w\-_\. ]", "", project.name)
        filename = f"{project_name_safe} - Tile Layout.{file_extension}"

        return Response(
            content=image_bytes,
            media_type=media_type,
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Content-Length": str(len(image_bytes)),
            },
        )
    except Exception as e:
        logger.error(
            f"Failed to decode base64 image data for tile project {project_id}: {e}"
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to decode image data: {e}",
        )
