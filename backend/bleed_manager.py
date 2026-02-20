from models import (
    GridCell,
    ImpositionLayout,
    BleedConfig,
    SheetConfig,
    Rectangle,
    EdgeBleed,
    EdgeFlags,
)


def calculate_per_cell_bleed(
    grid: list[GridCell],
    layout: ImpositionLayout,
    bleed_config: BleedConfig,
    gap: float,
) -> list[GridCell]:
    """
    For each cell, determine which edges are interior (touching another page)
    vs exterior (facing sheet edge or empty space).
    Interior edges get 0 bleed. Exterior edges get full configured bleed.
    """
    trim_w = 0.0
    trim_h = 0.0

    for cell in grid:
        if cell.page_index is None:
            continue

        edges = ["top", "bottom", "left", "right"]
        bleed_values = EdgeBleed()
        interior_flags = EdgeFlags()

        for edge in edges:
            neighbor = _get_neighbor(grid, cell, edge, layout.rows, layout.cols)

            bleed_val = _get_bleed_for_edge(bleed_config, edge)

            if gap > 0:
                # With gap, every edge is exterior
                _set_edge_bleed(bleed_values, edge, bleed_val)
                _set_interior_flag(interior_flags, edge, False)

            elif neighbor is None:
                # Edge of grid = exterior
                _set_edge_bleed(bleed_values, edge, bleed_val)
                _set_interior_flag(interior_flags, edge, False)

            elif neighbor.page_index is None:
                # Neighbor is empty = exterior
                _set_edge_bleed(bleed_values, edge, bleed_val)
                _set_interior_flag(interior_flags, edge, False)

            else:
                # Neighbor has content = interior edge, no bleed
                _set_edge_bleed(bleed_values, edge, 0.0)
                _set_interior_flag(interior_flags, edge, True)

        cell.bleed_per_edge = bleed_values
        cell.is_interior_edge = interior_flags

    return grid


def calculate_cell_positions(
    grid: list[GridCell],
    layout: ImpositionLayout,
    sheet_config: SheetConfig,
    bleed_config: BleedConfig,
    gap: float,
    trim_w: float,
    trim_h: float,
) -> list[GridCell]:
    """Calculate the X,Y position of each cell's trim origin on the sheet, centered."""

    # Determine actual sheet dimensions after orientation
    sheet_w = sheet_config.sheet_width
    sheet_h = sheet_config.sheet_height
    if sheet_config.orientation == "landscape" and sheet_w < sheet_h:
        sheet_w, sheet_h = sheet_h, sheet_w
    elif sheet_config.orientation == "portrait" and sheet_w > sheet_h:
        sheet_w, sheet_h = sheet_h, sheet_w

    rows = layout.rows
    cols = layout.cols

    # Calculate total grid extent (trim area + outer bleed)
    if gap == 0:
        grid_w = cols * trim_w + bleed_config.left + bleed_config.right
        grid_h = rows * trim_h + bleed_config.top + bleed_config.bottom
    else:
        cell_pitch_x = trim_w + bleed_config.left + bleed_config.right + gap
        cell_pitch_y = trim_h + bleed_config.top + bleed_config.bottom + gap
        # Last cell doesn't have trailing gap
        grid_w = cols * cell_pitch_x - gap
        grid_h = rows * cell_pitch_y - gap

    # Center the grid on the sheet
    offset_x = (sheet_w - grid_w) / 2.0 + bleed_config.left
    offset_y = (sheet_h - grid_h) / 2.0 + bleed_config.bottom

    for cell in grid:
        if gap == 0:
            cell.trim_origin_x = offset_x + (cell.col * trim_w)
            cell.trim_origin_y = offset_y + (cell.row * trim_h)
        else:
            cell.trim_origin_x = offset_x + (cell.col * cell_pitch_x)
            cell.trim_origin_y = offset_y + (cell.row * cell_pitch_y)

        # Build clip rect
        cell.clip_rect = Rectangle(
            x=cell.trim_origin_x - cell.bleed_per_edge.left,
            y=cell.trim_origin_y - cell.bleed_per_edge.bottom,
            width=trim_w + cell.bleed_per_edge.left + cell.bleed_per_edge.right,
            height=trim_h + cell.bleed_per_edge.top + cell.bleed_per_edge.bottom,
        )

    return grid


def _get_neighbor(
    grid: list[GridCell], cell: GridCell, edge: str, total_rows: int, total_cols: int
) -> GridCell | None:
    """Find the neighboring cell for a given edge."""
    target_row = cell.row
    target_col = cell.col

    if edge == "top":
        target_row = cell.row + 1  # In our grid, row increases upward in placement
    elif edge == "bottom":
        target_row = cell.row - 1
    elif edge == "left":
        target_col = cell.col - 1
    elif edge == "right":
        target_col = cell.col + 1

    if target_row < 0 or target_row >= total_rows:
        return None
    if target_col < 0 or target_col >= total_cols:
        return None

    for c in grid:
        if c.row == target_row and c.col == target_col:
            return c

    return None


def _get_bleed_for_edge(bleed_config: BleedConfig, edge: str) -> float:
    if edge == "top":
        return bleed_config.top
    elif edge == "bottom":
        return bleed_config.bottom
    elif edge == "left":
        return bleed_config.left
    elif edge == "right":
        return bleed_config.right
    return 0.0


def _set_edge_bleed(bleed: EdgeBleed, edge: str, value: float):
    if edge == "top":
        bleed.top = value
    elif edge == "bottom":
        bleed.bottom = value
    elif edge == "left":
        bleed.left = value
    elif edge == "right":
        bleed.right = value


def _set_interior_flag(flags: EdgeFlags, edge: str, value: bool):
    if edge == "top":
        flags.top = value
    elif edge == "bottom":
        flags.bottom = value
    elif edge == "left":
        flags.left = value
    elif edge == "right":
        flags.right = value
