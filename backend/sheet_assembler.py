import io
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.lib.colors import CMYKColor, black
from models import GridCell, MarkObject, SheetConfig, MarkConfig, BleedConfig
from utils import mm_to_pt


def assemble_sheet_pdf(
    front_grid: list[GridCell],
    back_grid: list[GridCell] | None,
    source_xobjects: dict,
    marks_front: list[MarkObject],
    marks_back: list[MarkObject] | None,
    sheet_config: SheetConfig,
    trim_w: float,
    trim_h: float,
    source_page_trim_rects: dict,
) -> io.BytesIO:
    """
    Assemble a single imposed sheet (front and optionally back) using ReportLab.
    source_xobjects: dict of page_index -> PDF page bytes for embedding.
    """
    buf = io.BytesIO()
    sheet_w_pt = mm_to_pt(sheet_config.sheet_width)
    sheet_h_pt = mm_to_pt(sheet_config.sheet_height)

    c = canvas.Canvas(buf, pagesize=(sheet_w_pt, sheet_h_pt))

    # Draw front side
    _draw_grid_on_canvas(c, front_grid, trim_w, trim_h, sheet_config)
    _draw_marks_on_canvas(c, marks_front)
    c.showPage()

    # Draw back side
    if back_grid is not None:
        c = _ensure_page(c, sheet_w_pt, sheet_h_pt)
        _draw_grid_on_canvas(c, back_grid, trim_w, trim_h, sheet_config)
        if marks_back:
            _draw_marks_on_canvas(c, marks_back)
        c.showPage()

    c.save()
    buf.seek(0)
    return buf


def _ensure_page(c, w, h):
    """Ensure canvas is ready for a new page."""
    return c


def _draw_grid_on_canvas(
    c: canvas.Canvas,
    grid: list[GridCell],
    trim_w: float,
    trim_h: float,
    sheet_config: SheetConfig,
):
    """Draw cell placeholders on the canvas (the actual page content will be placed by pikepdf)."""
    for cell in grid:
        if cell.page_index is None:
            continue

        # Draw a light gray rectangle to represent the cell position
        x_pt = mm_to_pt(cell.trim_origin_x)
        y_pt = mm_to_pt(cell.trim_origin_y)
        w_pt = mm_to_pt(trim_w)
        h_pt = mm_to_pt(trim_h)

        # Draw trim boundary as light dashed line (for reference)
        c.saveState()
        c.setStrokeColor(CMYKColor(0, 0, 0, 0.15))
        c.setLineWidth(0.25)
        c.setDash(2, 2)
        c.rect(x_pt, y_pt, w_pt, h_pt, fill=0, stroke=1)
        c.restoreState()


def _draw_marks_on_canvas(c: canvas.Canvas, marks: list[MarkObject]):
    """Draw all marks on the ReportLab canvas."""
    for mark in marks:
        if mark.type == "crop":
            _draw_crop_mark(c, mark)
        elif mark.type == "registration":
            _draw_registration_mark(c, mark)
        elif mark.type == "color_bar":
            _draw_color_bar(c, mark)
        elif mark.type == "fold":
            _draw_fold_mark(c, mark)
        elif mark.type == "slug_text":
            _draw_slug_text(c, mark)


def _draw_crop_mark(c: canvas.Canvas, mark: MarkObject):
    """Draw a single crop mark line."""
    c.saveState()
    stroke = mark.properties.get("stroke", 0.25)
    color = mark.properties.get("color", "registration")

    if color == "registration":
        c.setStrokeColor(CMYKColor(1, 1, 1, 1))
    else:
        c.setStrokeColor(CMYKColor(0, 0, 0, 1))

    c.setLineWidth(stroke)

    x1 = mm_to_pt(mark.x1)
    y1 = mm_to_pt(mark.y1)
    x2 = mm_to_pt(mark.x2)
    y2 = mm_to_pt(mark.y2)

    c.line(x1, y1, x2, y2)
    c.restoreState()


def _draw_registration_mark(c: canvas.Canvas, mark: MarkObject):
    """Draw a registration target (circle + crosshair)."""
    c.saveState()
    cx = mm_to_pt(mark.x1)
    cy = mm_to_pt(mark.y1)
    radius = mm_to_pt(mark.properties.get("radius", 4.0))
    crosshair_len = mm_to_pt(mark.properties.get("crosshair_length", 6.0))
    weight = mark.properties.get("line_weight", 0.25)

    c.setStrokeColor(CMYKColor(1, 1, 1, 1))
    c.setLineWidth(weight)

    # Outer circle
    c.circle(cx, cy, radius, fill=0, stroke=1)

    # Inner circle
    c.circle(cx, cy, radius * 0.3, fill=0, stroke=1)

    # Crosshair
    half = crosshair_len / 2
    c.line(cx - half, cy, cx + half, cy)
    c.line(cx, cy - half, cx, cy + half)

    c.restoreState()


def _draw_color_bar(c: canvas.Canvas, mark: MarkObject):
    """Draw a color bar patch."""
    c.saveState()
    x = mm_to_pt(mark.x1)
    y = mm_to_pt(mark.y1)
    w = mm_to_pt(mark.properties.get("width", 4.0))
    h = mm_to_pt(mark.properties.get("height", 4.0))
    cmyk = mark.properties.get("cmyk", [0, 0, 0, 1])

    c.setFillColor(CMYKColor(*cmyk))
    c.setStrokeColor(CMYKColor(0, 0, 0, 0.3))
    c.setLineWidth(0.1)
    c.rect(x, y, w, h, fill=1, stroke=1)
    c.restoreState()


def _draw_fold_mark(c: canvas.Canvas, mark: MarkObject):
    """Draw a fold mark (dashed line)."""
    c.saveState()
    c.setStrokeColor(CMYKColor(1, 1, 1, 1))
    c.setLineWidth(0.25)
    c.setDash(3, 3)

    x1 = mm_to_pt(mark.x1)
    y1 = mm_to_pt(mark.y1)
    x2 = mm_to_pt(mark.x2)
    y2 = mm_to_pt(mark.y2)

    c.line(x1, y1, x2, y2)
    c.restoreState()


def _draw_slug_text(c: canvas.Canvas, mark: MarkObject):
    """Draw slug information text."""
    c.saveState()
    x = mm_to_pt(mark.x1)
    y = mm_to_pt(mark.y1)
    text = mark.properties.get("text", "")
    font_size = mark.properties.get("font_size", 6)
    font = mark.properties.get("font", "Helvetica")

    c.setFillColor(CMYKColor(0, 0, 0, 1))
    c.setFont(font, font_size)
    c.drawString(x, y, text)
    c.restoreState()
