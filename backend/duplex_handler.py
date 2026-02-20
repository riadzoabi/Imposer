import copy
from models import (
    GridCell,
    ImpositionLayout,
    ImpositionConfig,
    FlipEdge,
)
from bleed_manager import calculate_per_cell_bleed, calculate_cell_positions


def create_duplex_back(
    front_grid: list[GridCell],
    layout: ImpositionLayout,
    config: ImpositionConfig,
    trim_w: float,
    trim_h: float,
) -> list[GridCell]:
    """
    Create the back side grid by mirroring the front grid.
    The back must mirror the front so pages align when flipped.
    """
    back_grid = [cell.model_copy(deep=True) for cell in front_grid]

    if config.flip_edge == FlipEdge.long:
        # Flip on the long edge (left-right flip)
        # Columns reverse, rows stay the same
        for cell in back_grid:
            cell.col = (layout.cols - 1) - cell.col

    elif config.flip_edge == FlipEdge.short:
        # Flip on the short edge (top-bottom flip)
        # Rows reverse, columns stay the same
        for cell in back_grid:
            cell.row = (layout.rows - 1) - cell.row
            cell.rotation = (cell.rotation + 180) % 360

    # Recalculate bleed and positions for the back grid
    calculate_per_cell_bleed(back_grid, layout, config.bleed, config.gap_between_items)
    calculate_cell_positions(
        back_grid, layout, config.sheet, config.bleed,
        config.gap_between_items, trim_w, trim_h
    )

    return back_grid


def assign_back_pages(
    back_grid: list[GridCell],
    page_cursor: int,
    page_count: int,
) -> tuple[list[GridCell], int]:
    """Assign sequential pages to back grid cells."""
    for cell in sorted(back_grid, key=lambda c: (c.row, c.col)):
        if page_cursor < page_count:
            cell.page_index = page_cursor
            page_cursor += 1
        else:
            cell.page_index = None
    return back_grid, page_cursor
