from models import (
    GridCell,
    ImpositionLayout,
    MarkConfig,
    BleedConfig,
    SheetConfig,
    MarkObject,
    Rectangle,
)
from utils import line_overlaps_any_rect


def place_all_marks(
    grid: list[GridCell],
    layout: ImpositionLayout,
    mark_config: MarkConfig,
    bleed_config: BleedConfig,
    sheet_config: SheetConfig,
    trim_w: float,
    trim_h: float,
    filename: str = "",
    sheet_num: int = 1,
    total_sheets: int = 1,
) -> list[MarkObject]:
    """Place all marks on the sheet."""
    marks: list[MarkObject] = []

    if mark_config.crop_marks_enabled:
        marks.extend(place_crop_marks(grid, layout, mark_config, trim_w, trim_h))

    if mark_config.registration_marks_enabled:
        marks.extend(place_registration_marks(sheet_config))

    if mark_config.color_bars_enabled:
        marks.extend(place_color_bars(sheet_config))

    if mark_config.fold_marks_enabled:
        marks.extend(place_fold_marks(layout, sheet_config))

    if mark_config.slug_info_enabled:
        marks.extend(
            place_slug_info(
                sheet_config, mark_config, filename, sheet_num, total_sheets
            )
        )

    return marks


def place_crop_marks(
    grid: list[GridCell],
    layout: ImpositionLayout,
    mark_config: MarkConfig,
    trim_w: float,
    trim_h: float,
) -> list[MarkObject]:
    """Place crop marks at trim corners, only on exterior edges."""
    marks: list[MarkObject] = []
    length = mark_config.crop_mark_length
    offset = mark_config.crop_mark_offset
    stroke = mark_config.crop_mark_stroke_weight

    # Collect all trim rects for overlap check
    all_trim_rects: list[Rectangle] = []
    for cell in grid:
        if cell.page_index is not None:
            all_trim_rects.append(
                Rectangle(
                    x=cell.trim_origin_x,
                    y=cell.trim_origin_y,
                    width=trim_w,
                    height=trim_h,
                )
            )

    seen_marks: set[tuple[float, float, float, float]] = set()

    for cell_idx, cell in enumerate(grid):
        if cell.page_index is None:
            continue

        tx = cell.trim_origin_x
        ty = cell.trim_origin_y

        corners = {
            "bottom_left": (tx, ty),
            "bottom_right": (tx + trim_w, ty),
            "top_left": (tx, ty + trim_h),
            "top_right": (tx + trim_w, ty + trim_h),
        }

        for corner_name, (cx, cy) in corners.items():
            # Horizontal marks
            if "left" in corner_name and not cell.is_interior_edge.left:
                x1 = cx - offset
                x2 = cx - offset - length
                key = (_round(x1), _round(cy), _round(x2), _round(cy))
                if key not in seen_marks:
                    if not line_overlaps_any_rect(x1, cy, x2, cy, all_trim_rects, cell_idx):
                        marks.append(
                            MarkObject(
                                type="crop",
                                x1=x1, y1=cy, x2=x2, y2=cy,
                                properties={"stroke": stroke, "color": mark_config.crop_mark_color.value},
                            )
                        )
                        seen_marks.add(key)

            if "right" in corner_name and not cell.is_interior_edge.right:
                x1 = cx + offset
                x2 = cx + offset + length
                key = (_round(x1), _round(cy), _round(x2), _round(cy))
                if key not in seen_marks:
                    if not line_overlaps_any_rect(x1, cy, x2, cy, all_trim_rects, cell_idx):
                        marks.append(
                            MarkObject(
                                type="crop",
                                x1=x1, y1=cy, x2=x2, y2=cy,
                                properties={"stroke": stroke, "color": mark_config.crop_mark_color.value},
                            )
                        )
                        seen_marks.add(key)

            # Vertical marks
            if "bottom" in corner_name and not cell.is_interior_edge.bottom:
                y1 = cy - offset
                y2 = cy - offset - length
                key = (_round(cx), _round(y1), _round(cx), _round(y2))
                if key not in seen_marks:
                    if not line_overlaps_any_rect(cx, y1, cx, y2, all_trim_rects, cell_idx):
                        marks.append(
                            MarkObject(
                                type="crop",
                                x1=cx, y1=y1, x2=cx, y2=y2,
                                properties={"stroke": stroke, "color": mark_config.crop_mark_color.value},
                            )
                        )
                        seen_marks.add(key)

            if "top" in corner_name and not cell.is_interior_edge.top:
                y1 = cy + offset
                y2 = cy + offset + length
                key = (_round(cx), _round(y1), _round(cx), _round(y2))
                if key not in seen_marks:
                    if not line_overlaps_any_rect(cx, y1, cx, y2, all_trim_rects, cell_idx):
                        marks.append(
                            MarkObject(
                                type="crop",
                                x1=cx, y1=y1, x2=cx, y2=y2,
                                properties={"stroke": stroke, "color": mark_config.crop_mark_color.value},
                            )
                        )
                        seen_marks.add(key)

    return marks


def place_registration_marks(sheet_config: SheetConfig) -> list[MarkObject]:
    """Place registration target marks at 4 positions outside the printable area."""
    marks: list[MarkObject] = []
    sw = sheet_config.sheet_width
    sh = sheet_config.sheet_height
    margin = sheet_config.mark_margin / 2

    positions = [
        (margin, sh / 2),       # Left center
        (sw - margin, sh / 2),  # Right center
        (sw / 2, margin),       # Bottom center
        (sw / 2, sh - margin),  # Top center
    ]

    for px, py in positions:
        marks.append(
            MarkObject(
                type="registration",
                x1=px, y1=py,
                properties={
                    "radius": 4.0,
                    "crosshair_length": 6.0,
                    "line_weight": 0.25,
                    "color": "registration",
                },
            )
        )

    return marks


def place_color_bars(sheet_config: SheetConfig) -> list[MarkObject]:
    """Place color bar patches in the slug area."""
    marks: list[MarkObject] = []
    bar_y = 2.0  # Near bottom edge
    bar_start_x = sheet_config.mark_margin
    patch_size = 4.0
    patch_gap = 1.0

    colors = [
        (1, 0, 0, 0),      # C
        (0, 1, 0, 0),      # M
        (0, 0, 1, 0),      # Y
        (0, 0, 0, 1),      # K
        (1, 1, 0, 0),      # C+M
        (1, 0, 1, 0),      # C+Y
        (0, 1, 1, 0),      # M+Y
        (1, 1, 1, 0),      # C+M+Y
        (0, 0, 0, 1),      # K 100%
        (0, 0, 0, 0.75),   # K 75%
        (0, 0, 0, 0.50),   # K 50%
        (0, 0, 0, 0.25),   # K 25%
    ]

    for i, cmyk in enumerate(colors):
        x = bar_start_x + i * (patch_size + patch_gap)
        marks.append(
            MarkObject(
                type="color_bar",
                x1=x, y1=bar_y,
                properties={
                    "width": patch_size,
                    "height": patch_size,
                    "cmyk": list(cmyk),
                },
            )
        )

    return marks


def place_fold_marks(
    layout: ImpositionLayout, sheet_config: SheetConfig
) -> list[MarkObject]:
    """Place fold marks for booklet imposition."""
    marks: list[MarkObject] = []

    if layout.cols == 2:
        fold_x = sheet_config.sheet_width / 2
        marks.append(
            MarkObject(
                type="fold",
                x1=fold_x, y1=0,
                x2=fold_x, y2=5.0,
                properties={"length": 5.0, "direction": "vertical"},
            )
        )
        marks.append(
            MarkObject(
                type="fold",
                x1=fold_x, y1=sheet_config.sheet_height,
                x2=fold_x, y2=sheet_config.sheet_height - 5.0,
                properties={"length": 5.0, "direction": "vertical"},
            )
        )

    return marks


def place_slug_info(
    sheet_config: SheetConfig,
    mark_config: MarkConfig,
    filename: str,
    sheet_num: int,
    total_sheets: int,
) -> list[MarkObject]:
    """Place slug text info in the slug area."""
    marks: list[MarkObject] = []
    slug_y = sheet_config.sheet_height - 3.0
    slug_x = sheet_config.mark_margin

    text_parts: list[str] = []
    for item in mark_config.slug_text_content:
        if item == "filename":
            text_parts.append(f"File: {filename}")
        elif item == "date":
            from datetime import datetime
            text_parts.append(f"Date: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
        elif item == "sheet_number":
            text_parts.append(f"Sheet: {sheet_num} of {total_sheets}")
        elif item == "color_profile":
            text_parts.append("Profile: CMYK")

    slug_text = "  |  ".join(text_parts)

    marks.append(
        MarkObject(
            type="slug_text",
            x1=slug_x, y1=slug_y,
            properties={
                "text": slug_text,
                "font_size": 6,
                "font": "Helvetica",
                "color": "registration",
            },
        )
    )

    return marks


def _round(v: float) -> float:
    return round(v, 2)
