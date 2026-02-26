import math
from models import (
    ImpositionConfig,
    ImpositionLayout,
    GridCell,
    ImpositionMode,
)


def calculate_imposition_layout(
    config: ImpositionConfig, page_count: int, sheet_number: int = 0
) -> ImpositionLayout:
    """Calculate how many items fit on the sheet and build the grid.

    Args:
        config: Imposition configuration.
        page_count: Total number of pages in the source PDF.
        sheet_number: 0-based sheet index to generate the grid for.
    """

    sheet_w = config.sheet.sheet_width
    sheet_h = config.sheet.sheet_height

    # Apply orientation swap
    if config.sheet.orientation == "landscape" and sheet_w < sheet_h:
        sheet_w, sheet_h = sheet_h, sheet_w
    elif config.sheet.orientation == "portrait" and sheet_w > sheet_h:
        sheet_w, sheet_h = sheet_h, sheet_w

    mark_margin = config.sheet.mark_margin
    grip = config.sheet.grip_edge
    bleed = config.bleed
    gap = config.gap_between_items
    trim_w = config.trim_width
    trim_h = config.trim_height

    # Calculate n-up for normal orientation
    cols_n, rows_n = _calc_grid_count(
        sheet_w, sheet_h, mark_margin, grip, trim_w, trim_h, bleed, gap
    )
    n_up_normal = cols_n * rows_n
    rotation = 0

    best_cols, best_rows = cols_n, rows_n

    # Try rotated orientation
    if config.auto_rotate:
        cols_r, rows_r = _calc_grid_count(
            sheet_w, sheet_h, mark_margin, grip, trim_h, trim_w, bleed, gap
        )
        n_up_rotated = cols_r * rows_r

        if n_up_rotated > n_up_normal:
            best_cols, best_rows = cols_r, rows_r
            rotation = 90
            trim_w, trim_h = trim_h, trim_w

    if best_cols < 1:
        best_cols = 1
    if best_rows < 1:
        best_rows = 1

    n_up = best_cols * best_rows

    # Calculate total sheets needed
    cells_per_sheet = n_up
    if config.duplex:
        pages_per_sheet = cells_per_sheet * 2
    else:
        pages_per_sheet = cells_per_sheet

    if config.mode == ImpositionMode.step_and_repeat:
        if config.duplex:
            total_sheets = max(1, math.ceil(page_count / 2))
        else:
            total_sheets = max(1, page_count)
    else:
        total_sheets = max(1, math.ceil(page_count / pages_per_sheet))

    # Clamp sheet_number
    sheet_number = max(0, min(sheet_number, total_sheets - 1))

    # Build grid based on mode for the requested sheet
    grid = _build_grid(
        config.mode, best_rows, best_cols, page_count, rotation,
        sheet_number=sheet_number, n_up=n_up,
    )

    return ImpositionLayout(
        rows=best_rows,
        cols=best_cols,
        n_up=n_up,
        total_sheets=total_sheets,
        cell_rotation=rotation,
        grid=grid,
    )


def _calc_grid_count(
    sheet_w: float,
    sheet_h: float,
    mark_margin: float,
    grip: float,
    trim_w: float,
    trim_h: float,
    bleed,
    gap: float,
) -> tuple[int, int]:
    """Calculate how many cols x rows fit on the sheet."""

    available_w = sheet_w - 2 * mark_margin
    available_h = sheet_h - 2 * mark_margin - grip

    if available_w <= 0 or available_h <= 0:
        return 0, 0

    if gap == 0:
        # Tight packing: outer edges need bleed, interior edges share trim
        outer_extra_w = bleed.left + bleed.right
        outer_extra_h = bleed.top + bleed.bottom

        cols = max(1, int((available_w - outer_extra_w) / trim_w)) if trim_w > 0 else 0
        # Verify fit
        while cols > 0 and (outer_extra_w + cols * trim_w) > available_w:
            cols -= 1

        rows = max(1, int((available_h - outer_extra_h) / trim_h)) if trim_h > 0 else 0
        while rows > 0 and (outer_extra_h + rows * trim_h) > available_h:
            rows -= 1
    else:
        cell_w = trim_w + bleed.left + bleed.right + gap
        cell_h = trim_h + bleed.top + bleed.bottom + gap

        cols = int(available_w / cell_w) if cell_w > 0 else 0
        rows = int(available_h / cell_h) if cell_h > 0 else 0

    return max(cols, 0), max(rows, 0)


def _build_grid(
    mode: ImpositionMode,
    rows: int,
    cols: int,
    page_count: int,
    rotation: int,
    sheet_number: int = 0,
    n_up: int = 0,
) -> list[GridCell]:
    """Build the grid of cells based on imposition mode.

    Args:
        sheet_number: 0-based sheet index.
        n_up: cells per sheet (rows * cols).
    """

    grid: list[GridCell] = []

    if mode == ImpositionMode.step_and_repeat:
        for r in range(rows):
            for c in range(cols):
                grid.append(
                    GridCell(row=r, col=c, page_index=0, rotation=rotation)
                )

    elif mode == ImpositionMode.cut_and_stack:
        cursor = sheet_number * n_up
        for r in range(rows):
            for c in range(cols):
                if cursor < page_count:
                    grid.append(
                        GridCell(row=r, col=c, page_index=cursor, rotation=rotation)
                    )
                    cursor += 1
                else:
                    grid.append(GridCell(row=r, col=c, page_index=None, rotation=rotation))

    elif mode == ImpositionMode.booklet_saddle_stitch:
        grid = _build_saddle_stitch_grid(rows, cols, page_count, rotation, sheet_number)

    elif mode == ImpositionMode.booklet_perfect_bind:
        cursor = sheet_number * n_up
        for r in range(rows):
            for c in range(cols):
                if cursor < page_count:
                    grid.append(
                        GridCell(row=r, col=c, page_index=cursor, rotation=rotation)
                    )
                    cursor += 1
                else:
                    grid.append(GridCell(row=r, col=c, page_index=None, rotation=rotation))

    return grid


def _build_saddle_stitch_grid(
    rows: int, cols: int, page_count: int, rotation: int,
    sheet_number: int = 0,
) -> list[GridCell]:
    """Build saddle-stitch signature page ordering."""
    # Round up to multiple of 4
    total = math.ceil(page_count / 4) * 4

    # Generate page pairs for each sheet
    # For a 2-up layout (cols=2), each sheet side has 2 pages
    sheets = []
    for i in range(total // 4):
        front_left = total - (2 * i) - 1
        front_right = 2 * i
        back_left = 2 * i + 1
        back_right = total - (2 * i) - 2

        sheets.append(
            {
                "front": [front_left, front_right],
                "back": [back_left, back_right],
            }
        )

    # Pick the requested sheet (clamped)
    grid = []
    if sheets:
        idx = max(0, min(sheet_number, len(sheets) - 1))
        front_pages = sheets[idx]["front"]
        for i, pidx in enumerate(front_pages):
            col = i % cols
            row = i // cols
            actual_idx = pidx if pidx < page_count else None
            grid.append(
                GridCell(row=row, col=col, page_index=actual_idx, rotation=rotation)
            )

    return grid


def get_saddle_stitch_sheets(page_count: int) -> list[dict]:
    """Get all saddle stitch sheet pairings."""
    total = math.ceil(page_count / 4) * 4
    sheets = []
    for i in range(total // 4):
        front_left = total - (2 * i) - 1
        front_right = 2 * i
        back_left = 2 * i + 1
        back_right = total - (2 * i) - 2

        sheets.append(
            {
                "front": [
                    front_left if front_left < page_count else None,
                    front_right if front_right < page_count else None,
                ],
                "back": [
                    back_left if back_left < page_count else None,
                    back_right if back_right < page_count else None,
                ],
            }
        )
    return sheets
