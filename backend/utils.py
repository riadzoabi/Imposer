from models import Rectangle

# 1 pt = 0.3528 mm
PT_TO_MM = 0.3528
MM_TO_PT = 1.0 / PT_TO_MM
INCH_TO_MM = 25.4
MM_TO_INCH = 1.0 / INCH_TO_MM


def pt_to_mm(pt: float) -> float:
    return pt * PT_TO_MM


def mm_to_pt(mm: float) -> float:
    return mm * MM_TO_PT


def inch_to_mm(inch: float) -> float:
    return inch * INCH_TO_MM


def mm_to_inch(mm: float) -> float:
    return mm * MM_TO_INCH


def pdf_rect_to_mm(pdf_rect) -> Rectangle:
    """Convert a PDF rectangle (in points, [x0, y0, x1, y1]) to mm Rectangle."""
    x0 = float(pdf_rect[0])
    y0 = float(pdf_rect[1])
    x1 = float(pdf_rect[2])
    y1 = float(pdf_rect[3])

    x_mm = pt_to_mm(min(x0, x1))
    y_mm = pt_to_mm(min(y0, y1))
    w_mm = pt_to_mm(abs(x1 - x0))
    h_mm = pt_to_mm(abs(y1 - y0))

    return Rectangle(x=x_mm, y=y_mm, width=w_mm, height=h_mm)


def mm_rect_to_pt_array(rect: Rectangle) -> list[float]:
    """Convert mm Rectangle to PDF points array [x0, y0, x1, y1]."""
    return [
        mm_to_pt(rect.x),
        mm_to_pt(rect.y),
        mm_to_pt(rect.x + rect.width),
        mm_to_pt(rect.y + rect.height),
    ]


def expand_rect(rect: Rectangle, top: float, bottom: float, left: float, right: float) -> Rectangle:
    return Rectangle(
        x=rect.x - left,
        y=rect.y - bottom,
        width=rect.width + left + right,
        height=rect.height + top + bottom,
    )


def rects_overlap(a: Rectangle, b: Rectangle) -> bool:
    """Check if two rectangles overlap."""
    if a.right_edge <= b.left_edge or b.right_edge <= a.left_edge:
        return False
    if a.top_edge <= b.bottom_edge or b.top_edge <= a.bottom_edge:
        return False
    return True


def point_in_rect(px: float, py: float, rect: Rectangle) -> bool:
    return rect.x <= px <= rect.x + rect.width and rect.y <= py <= rect.y + rect.height


def line_overlaps_any_rect(
    x1: float, y1: float, x2: float, y2: float,
    rects: list[Rectangle], exclude_idx: int = -1
) -> bool:
    """Check if a line segment overlaps any trim rectangle (excluding one)."""
    mid_x = (x1 + x2) / 2
    mid_y = (y1 + y2) / 2
    for i, r in enumerate(rects):
        if i == exclude_idx:
            continue
        if point_in_rect(mid_x, mid_y, r):
            return True
        if point_in_rect(x1, y1, r) and point_in_rect(x2, y2, r):
            return True
    return False
