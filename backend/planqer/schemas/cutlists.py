from pydantic import BaseModel


class CutListItemResponse(BaseModel):
    type: str
    length: float
    width: float
    thickness: float
    quantity: int
    name: str
    volume: float


class ThreeDCutlistResponse(BaseModel):
    cutlist_items: list[CutListItemResponse]
    total_items: int
    total_volume: float
    project_name: str | None = None
    units: str
    processing_time: float | None = None
    boards: list[CutListItemResponse] = []
    sheets: list[CutListItemResponse] = []
    planqer_parts: dict[str, int] | None = None
    board_count: int = 0
    sheet_count: int = 0


class StepCutListItemResponse(BaseModel):
    type: str
    length: float
    width: float
    thickness: float
    quantity: int
    name: str
    volume: float
    material: str | None = None
    assembly_path: str | None = None
    cad_id: str | None = None


class StepCutlistResponse(BaseModel):
    cutlist_items: list[StepCutListItemResponse]
    total_items: int
    total_volume: float
    project_name: str | None = None
    units: str
    processing_time: float | None = None
    boards: list[StepCutListItemResponse] = []
    sheets: list[StepCutListItemResponse] = []
    planqer_parts: dict[str, int] | None = None
    board_count: int = 0
    sheet_count: int = 0
    materials_used: list[str] = []
    assembly_structure: dict = {}
