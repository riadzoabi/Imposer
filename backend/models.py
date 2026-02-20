from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum


class Rectangle(BaseModel):
    x: float = 0.0
    y: float = 0.0
    width: float = 0.0
    height: float = 0.0

    @property
    def left_edge(self) -> float:
        return self.x

    @property
    def right_edge(self) -> float:
        return self.x + self.width

    @property
    def bottom_edge(self) -> float:
        return self.y

    @property
    def top_edge(self) -> float:
        return self.y + self.height


class DetectedBleed(BaseModel):
    top: float = 0.0
    bottom: float = 0.0
    left: float = 0.0
    right: float = 0.0


class PageGeometry(BaseModel):
    media_box: Rectangle
    trim_box: Optional[Rectangle] = None
    bleed_box: Optional[Rectangle] = None
    art_box: Optional[Rectangle] = None
    detected_bleed: DetectedBleed = DetectedBleed()
    has_existing_marks: bool = False
    existing_marks_stripped: bool = False
    page_index: int = 0


class BleedConfig(BaseModel):
    top: float = 3.0
    bottom: float = 3.0
    left: float = 3.0
    right: float = 3.0
    uniform: bool = True


class CropMarkColor(str, Enum):
    registration = "registration"
    black_only = "black_only"


class MarkConfig(BaseModel):
    crop_marks_enabled: bool = True
    crop_mark_length: float = 5.0
    crop_mark_offset: float = 3.0
    crop_mark_stroke_weight: float = 0.25
    crop_mark_color: CropMarkColor = CropMarkColor.registration
    registration_marks_enabled: bool = True
    color_bars_enabled: bool = True
    fold_marks_enabled: bool = True
    slug_info_enabled: bool = True
    slug_text_content: list[str] = Field(
        default_factory=lambda: ["filename", "date", "sheet_number"]
    )


class SheetConfig(BaseModel):
    sheet_width: float = 488.0
    sheet_height: float = 330.0
    orientation: str = "landscape"
    grip_edge: float = 10.0
    mark_margin: float = 8.0


class ImpositionMode(str, Enum):
    step_and_repeat = "step_and_repeat"
    booklet_saddle_stitch = "booklet_saddle_stitch"
    booklet_perfect_bind = "booklet_perfect_bind"
    cut_and_stack = "cut_and_stack"


class FlipEdge(str, Enum):
    long = "long"
    short = "short"


class ImpositionConfig(BaseModel):
    mode: ImpositionMode = ImpositionMode.step_and_repeat
    trim_width: float = 90.0
    trim_height: float = 55.0
    bleed: BleedConfig = BleedConfig()
    marks: MarkConfig = MarkConfig()
    sheet: SheetConfig = SheetConfig()
    gap_between_items: float = 0.0
    duplex: bool = False
    flip_edge: FlipEdge = FlipEdge.long
    auto_rotate: bool = True
    creep_adjustment: float = 0.0


class EdgeFlags(BaseModel):
    top: bool = False
    bottom: bool = False
    left: bool = False
    right: bool = False


class EdgeBleed(BaseModel):
    top: float = 0.0
    bottom: float = 0.0
    left: float = 0.0
    right: float = 0.0


class GridCell(BaseModel):
    row: int = 0
    col: int = 0
    page_index: Optional[int] = None
    rotation: int = 0
    clip_rect: Optional[Rectangle] = None
    bleed_per_edge: EdgeBleed = EdgeBleed()
    is_interior_edge: EdgeFlags = EdgeFlags()
    trim_origin_x: float = 0.0
    trim_origin_y: float = 0.0


class MarkObject(BaseModel):
    type: str  # "crop", "registration", "fold", "color_bar", "slug_text"
    x1: float = 0.0
    y1: float = 0.0
    x2: float = 0.0
    y2: float = 0.0
    properties: dict = Field(default_factory=dict)


class ImpositionLayout(BaseModel):
    rows: int = 0
    cols: int = 0
    n_up: int = 0
    total_sheets: int = 0
    cell_rotation: int = 0
    grid: list[GridCell] = Field(default_factory=list)


class ImposedSheet(BaseModel):
    sheet_number: int = 0
    front: list[GridCell] = Field(default_factory=list)
    back: Optional[list[GridCell]] = None
    total_rows: int = 0
    total_cols: int = 0
    marks: list[MarkObject] = Field(default_factory=list)
    sheet_width: float = 0.0
    sheet_height: float = 0.0


class AnalysisResult(BaseModel):
    page_count: int
    pages: list[PageGeometry]
    warnings: list[str] = Field(default_factory=list)


class PreviewData(BaseModel):
    layout: ImpositionLayout
    sheets: list[dict] = Field(default_factory=list)
    sheet_width_mm: float = 0.0
    sheet_height_mm: float = 0.0


class PresetConfig(BaseModel):
    name: str
    config: ImpositionConfig
