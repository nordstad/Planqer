"""
3D Cutlist processing module for Planqer.

Processes STL files to generate cutting lists for woodworking projects.
Integrates the standalone 3D cutlist functionality into Planqer's architecture.
"""

import tempfile
import os
import logging
from dataclasses import dataclass
from enum import Enum

import trimesh
from fastapi import HTTPException, UploadFile


logger = logging.getLogger("planqer.threed_cutlist")


class ComponentType(Enum):
    """Component classification for woodworking."""
    BOARD = "board"
    SHEET = "sheet"


# "Sheet" is very thin relative to L/W; everything else is a board.
SHEET_THICKNESS_RATIO = 0.18


def is_sheet(length: float, width: float, thickness: float) -> bool:
    """Whether these dimensions describe sheet stock rather than a board.

    Lives here, at module level, because the STEP reader classifies with it too.
    The same model exported as STL and as STEP has to land on the same cutlist —
    one rule, or the answer depends on which format the user happened to pick.
    """
    return (
        thickness / max(1e-6, min(length, width)) <= SHEET_THICKNESS_RATIO
        and width / length >= 0.1
    )


@dataclass
class CutListItem:
    """Represents a single item in the cut list."""
    type: ComponentType
    length: float
    width: float
    thickness: float
    quantity: int
    name: str
    volume: float
    
    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            "type": self.type.value,
            "length": self.length,
            "width": self.width,
            "thickness": self.thickness,
            "quantity": self.quantity,
            "name": self.name,
            "volume": self.volume
        }


class STLProcessor:
    """Processes STL files to generate cutting lists."""
    
    def __init__(self, units: str = "mm", round_precision: int = 1):
        self.units = units
        self.round_precision = round_precision
        self.unit_scale = self._get_unit_scale()
    
    def _get_unit_scale(self) -> float:
        """Get scale factor to convert to millimeters."""
        scale_factors = {
            "mm": 1.0,
            "cm": 10.0,
            "m": 1000.0,
            "in": 25.4,
            "inch": 25.4,
            "inches": 25.4,
            "ft": 304.8,
            "feet": 304.8
        }
        return scale_factors.get(self.units.lower(), 1.0)
    
    def _round_dimension(self, value: float) -> float:
        """Round dimension to specified precision."""
        return round(value, self.round_precision)
    
    def _load_stl(self, file_path: str, tol_mm: float = 0.25) -> trimesh.Trimesh:
        """Load and validate STL file with advanced cleanup."""
        try:
            mesh = trimesh.load(file_path, force="mesh")
            
            # Handle Scene objects (multiple meshes)
            if not isinstance(mesh, trimesh.Trimesh):
                if hasattr(mesh, "geometry") and mesh.geometry:
                    mesh = trimesh.util.concatenate(list(mesh.geometry.values()))
                else:
                    raise ValueError("Unsupported STL structure")
            
            # Advanced mesh cleanup (from working 3d-cutlist project)
            mesh.update_faces(mesh.unique_faces())
            mesh.update_faces(mesh.nondegenerate_faces())
            mesh.remove_infinite_values()
            
            # Trimesh API compatibility: epsilon/radius/no-arg across versions
            mv = getattr(mesh, "merge_vertices", None)
            if mv is not None:
                for kwargs in ({"epsilon": tol_mm * 0.5}, {"radius": tol_mm * 0.5}, {}):
                    try:
                        mv(**kwargs)
                        break
                    except TypeError:
                        continue
                    except Exception:
                        break
            
            mesh.process(validate=True)
            
            # Scale to millimeters
            if self.unit_scale != 1.0:
                mesh.apply_scale(self.unit_scale)
            
            if mesh.is_empty:
                raise ValueError("STL file contains empty mesh")
            
            return mesh
            
        except Exception as e:
            raise HTTPException(
                status_code=400, 
                detail=f"Failed to load STL file: {str(e)}"
            )
    
    def _split_components(self, mesh: trimesh.Trimesh) -> list[trimesh.Trimesh]:
        """Split mesh into connected components."""
        try:
            # Get connected components
            components = mesh.split(only_watertight=False)
            
            if not components:
                return [mesh]
            
            # Filter out components with no faces (use proven method)
            filtered_components = [p for p in components if len(p.faces) > 0]
            
            return filtered_components if filtered_components else [mesh]
            
        except Exception as e:
            logger.warning(f"Failed to split components: {e}")
            return [mesh]
    
    def _get_obb_extents(self, mesh: trimesh.Trimesh) -> tuple[float, float, float]:
        """Get oriented bounding box dimensions using the proven method."""
        try:
            # Use trimesh's built-in oriented bounding box for more reliable results
            obb = mesh.bounding_box_oriented
            extents = obb.primitive.extents
            # Sort to ensure L ≥ W ≥ T (same as working project)
            extents = sorted(extents, reverse=True)
            
            return tuple(self._round_dimension(d) for d in extents)
            
        except Exception as e:
            logger.warning(f"OBB calculation failed, using AABB: {e}")
            # Fallback to axis-aligned bounding box with same sorting
            extents = mesh.bounding_box.extents
            dimensions = sorted(extents, reverse=True)
            return tuple(self._round_dimension(d) for d in dimensions)
    
    def _classify_component(self, length: float, width: float, thickness: float) -> ComponentType:
        """Classify component as board or sheet using the proven algorithm."""
        return ComponentType.SHEET if is_sheet(length, width, thickness) else ComponentType.BOARD
    
    def process_stl_file(self, file_path: str, project_name: str | None = None) -> list[CutListItem]:
        """Process STL file and generate cut list."""
        try:
            # Load STL file
            mesh = self._load_stl(file_path)
            
            # Split into components
            components = self._split_components(mesh)
            
            cutlist_items = []
            component_counts = {}  # Track similar components for quantity counting
            
            for i, component in enumerate(components):
                # Get dimensions
                length, width, thickness = self._get_obb_extents(component)
                
                # Debug logging for component dimensions
                logger.info(f"Component {i}: L={length}, W={width}, T={thickness}")
                
                # Skip very small components or components with invalid dimensions
                if max(length, width, thickness) < 1.0:
                    logger.info(f"Skipping component {i}: too small (max dimension {max(length, width, thickness)})")
                    continue
                
                # Skip components with zero or near-zero thickness (invalid geometry)
                if thickness <= 0.5:  # Less than 0.5mm is likely invalid
                    logger.warning(f"Skipping component {i} with invalid thickness: {thickness}mm")
                    continue
                
                # Classify component
                comp_type = self._classify_component(length, width, thickness)
                
                # Calculate volume
                volume = self._round_dimension(component.volume)
                
                # Create dimension key for grouping similar components
                dim_key = (comp_type, length, width, thickness)
                
                if dim_key in component_counts:
                    component_counts[dim_key]["quantity"] += 1
                else:
                    name = f"{comp_type.value}_{len(component_counts) + 1}"
                    component_counts[dim_key] = {
                        "type": comp_type,
                        "length": length,
                        "width": width,
                        "thickness": thickness,
                        "quantity": 1,
                        "name": name,
                        "volume": volume
                    }
            
            # Convert to CutListItem objects
            for item_data in component_counts.values():
                cutlist_items.append(CutListItem(**item_data))
            
            # Sort by type and size
            cutlist_items.sort(key=lambda x: (x.type.value, -x.length, -x.width))
            
            return cutlist_items
            
        except Exception as e:
            logger.error(f"STL processing failed: {e}")
            raise HTTPException(
                status_code=500, 
                detail=f"STL processing failed: {str(e)}"
            )
    
    def convert_to_planqer_parts(self, cutlist_items: list[CutListItem]) -> dict[str, int]:
        """Convert cutlist items to Planqer's parts format for further optimization."""
        parts = {}
        
        for item in cutlist_items:
            if item.type == ComponentType.BOARD:
                # Use length as the key for 1D cutting optimization
                length_key = str(int(item.length))
                parts[length_key] = parts.get(length_key, 0) + item.quantity
        
        return parts


async def process_uploaded_stl(
    file: UploadFile, 
    units: str = "mm", 
    round_precision: int = 1,
    project_name: str | None = None
) -> tuple[list[CutListItem], dict[str, int]]:
    """
    Process uploaded STL file and return cutlist items and Planqer parts format.
    
    Args:
        file: Uploaded STL file
        units: Units for dimensions (mm, cm, m, in, ft)
        round_precision: Decimal places for rounding
        project_name: Optional project name
    
    Returns:
        Tuple of (cutlist_items, planqer_parts_dict)
    """
    # Validate file
    if not file.filename or not file.filename.lower().endswith('.stl'):
        raise HTTPException(
            status_code=400, 
            detail="File must be an STL file (.stl extension)"
        )
    
    # Check file size (limit to 50MB)
    if file.size and file.size > 50 * 1024 * 1024:
        raise HTTPException(
            status_code=400, 
            detail="File size too large. Maximum 50MB allowed."
        )
    
    # Create temporary file
    with tempfile.NamedTemporaryFile(suffix='.stl', delete=False) as temp_file:
        try:
            # Write uploaded file to temporary location
            content = await file.read()
            temp_file.write(content)
            temp_file.flush()
            
            # Process the STL file
            processor = STLProcessor(units=units, round_precision=round_precision)
            cutlist_items = processor.process_stl_file(temp_file.name, project_name)
            planqer_parts = processor.convert_to_planqer_parts(cutlist_items)
            
            return cutlist_items, planqer_parts
            
        finally:
            # Clean up temporary file
            try:
                os.unlink(temp_file.name)
            except OSError:
                pass