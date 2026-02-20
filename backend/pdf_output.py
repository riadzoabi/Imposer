import io
import math
from datetime import datetime

import pikepdf
from reportlab.pdfgen import canvas
from reportlab.lib.colors import CMYKColor

from models import (
    ImpositionConfig,
    ImpositionMode,
    GridCell,
    BleedConfig,
    Rectangle,
)
from pdf_analyzer import analyze_pdf
from imposition_engine import calculate_imposition_layout, get_saddle_stitch_sheets
from bleed_manager import calculate_per_cell_bleed, calculate_cell_positions
from mark_placer import place_all_marks
from duplex_handler import create_duplex_back, assign_back_pages
from utils import mm_to_pt, pt_to_mm


def generate_imposed_pdf(
    source_pdf_bytes: bytes,
    config: ImpositionConfig,
    filename: str = "document.pdf",
) -> bytes:
    """Full pipeline: analyze -> layout -> bleed -> marks -> assemble -> output."""

    # 1. Analyze input
    analysis = analyze_pdf(source_pdf_bytes)
    page_count = analysis.page_count

    # 2. Determine trim and bleed
    trim_w = config.trim_width
    trim_h = config.trim_height

    if trim_w == 0 or trim_h == 0:
        if analysis.pages and analysis.pages[0].trim_box:
            trim_w = analysis.pages[0].trim_box.width
            trim_h = analysis.pages[0].trim_box.height
        elif analysis.pages:
            trim_w = analysis.pages[0].media_box.width
            trim_h = analysis.pages[0].media_box.height

    bleed = config.bleed

    # Validate trim fits on sheet
    sheet_w = config.sheet.sheet_width
    sheet_h = config.sheet.sheet_height
    if config.sheet.orientation == "landscape" and sheet_w < sheet_h:
        sheet_w, sheet_h = sheet_h, sheet_w
    elif config.sheet.orientation == "portrait" and sheet_w > sheet_h:
        sheet_w, sheet_h = sheet_h, sheet_w

    if trim_w + bleed.left + bleed.right > sheet_w:
        raise ValueError(
            f"Trim width ({trim_w}mm) + bleed exceeds sheet width ({sheet_w}mm)."
        )
    if trim_h + bleed.top + bleed.bottom > sheet_h:
        raise ValueError(
            f"Trim height ({trim_h}mm) + bleed exceeds sheet height ({sheet_h}mm)."
        )

    # 3. Calculate layout
    layout = calculate_imposition_layout(config, page_count)

    if layout.n_up == 0:
        raise ValueError("Cannot fit any items on the sheet with current settings.")

    # Handle rotation
    effective_trim_w = trim_w
    effective_trim_h = trim_h
    if layout.cell_rotation == 90:
        effective_trim_w = trim_h
        effective_trim_h = trim_w

    # 4. Open source PDF with pikepdf
    source_pdf = pikepdf.open(io.BytesIO(source_pdf_bytes))

    # 5. Build imposed sheets
    output_pdf = pikepdf.new()

    if config.mode == ImpositionMode.step_and_repeat:
        _build_step_and_repeat(
            output_pdf, source_pdf, layout, config, analysis,
            effective_trim_w, effective_trim_h, trim_w, trim_h,
            filename, page_count,
        )
    elif config.mode == ImpositionMode.booklet_saddle_stitch:
        _build_saddle_stitch(
            output_pdf, source_pdf, layout, config, analysis,
            effective_trim_w, effective_trim_h, trim_w, trim_h,
            filename, page_count,
        )
    else:
        _build_sequential(
            output_pdf, source_pdf, layout, config, analysis,
            effective_trim_w, effective_trim_h, trim_w, trim_h,
            filename, page_count,
        )

    # Set metadata
    with output_pdf.open_metadata() as meta:
        meta["dc:title"] = f"Imposed Output - {filename}"
        meta["dc:creator"] = ["Print Imposition System"]
        meta["xmp:CreateDate"] = datetime.now().isoformat()

    # Write output
    out_buf = io.BytesIO()
    output_pdf.save(out_buf)
    output_pdf.close()
    source_pdf.close()
    out_buf.seek(0)
    return out_buf.read()


def _build_step_and_repeat(
    output_pdf, source_pdf, layout, config, analysis,
    eff_trim_w, eff_trim_h, orig_trim_w, orig_trim_h,
    filename, page_count,
):
    """Build step-and-repeat imposition — one imposed sheet per source page.
    With duplex: pairs consecutive pages (front=page N, back=page N+1)."""
    page_idx = 0
    sheet_num = 0

    while page_idx < page_count:
        sheet_num += 1

        # Front side: all cells use current page
        front_grid = []
        for r in range(layout.rows):
            for c in range(layout.cols):
                front_grid.append(
                    GridCell(row=r, col=c, page_index=page_idx,
                             rotation=layout.cell_rotation)
                )

        calculate_per_cell_bleed(front_grid, layout, config.bleed, config.gap_between_items)
        calculate_cell_positions(
            front_grid, layout, config.sheet, config.bleed,
            config.gap_between_items, eff_trim_w, eff_trim_h,
        )

        marks = place_all_marks(
            front_grid, layout, config.marks, config.bleed, config.sheet,
            eff_trim_w, eff_trim_h, filename, sheet_num, page_count,
        )

        _assemble_pikepdf_sheet(
            output_pdf, source_pdf, front_grid, marks,
            config, analysis, eff_trim_w, eff_trim_h,
        )
        page_idx += 1

        # Duplex back: next source page
        if config.duplex:
            back_page_idx = page_idx if page_idx < page_count else None

            back_grid = []
            for r in range(layout.rows):
                for c in range(layout.cols):
                    back_grid.append(
                        GridCell(row=r, col=c, page_index=back_page_idx,
                                 rotation=layout.cell_rotation)
                    )

            # Mirror for duplex alignment
            back_grid_mirrored = create_duplex_back(
                back_grid, layout, config, eff_trim_w, eff_trim_h
            )

            marks_back = place_all_marks(
                back_grid_mirrored, layout, config.marks, config.bleed, config.sheet,
                eff_trim_w, eff_trim_h, filename, sheet_num, page_count,
            )
            _assemble_pikepdf_sheet(
                output_pdf, source_pdf, back_grid_mirrored, marks_back,
                config, analysis, eff_trim_w, eff_trim_h,
            )

            if back_page_idx is not None:
                page_idx += 1


def _build_sequential(
    output_pdf, source_pdf, layout, config, analysis,
    eff_trim_w, eff_trim_h, orig_trim_w, orig_trim_h,
    filename, page_count,
):
    """Build cut-and-stack or perfect-bind imposition."""
    page_cursor = 0
    sheet_num = 0

    while page_cursor < page_count:
        sheet_num += 1

        front_grid = []
        for r in range(layout.rows):
            for c in range(layout.cols):
                if page_cursor < page_count:
                    front_grid.append(
                        GridCell(row=r, col=c, page_index=page_cursor,
                                 rotation=layout.cell_rotation)
                    )
                    page_cursor += 1
                else:
                    front_grid.append(
                        GridCell(row=r, col=c, page_index=None,
                                 rotation=layout.cell_rotation)
                    )

        calculate_per_cell_bleed(front_grid, layout, config.bleed, config.gap_between_items)
        calculate_cell_positions(
            front_grid, layout, config.sheet, config.bleed,
            config.gap_between_items, eff_trim_w, eff_trim_h,
        )

        marks = place_all_marks(
            front_grid, layout, config.marks, config.bleed, config.sheet,
            eff_trim_w, eff_trim_h, filename, sheet_num, layout.total_sheets,
        )

        _assemble_pikepdf_sheet(
            output_pdf, source_pdf, front_grid, marks,
            config, analysis, eff_trim_w, eff_trim_h,
        )

        if config.duplex:
            back_grid = []
            for r in range(layout.rows):
                for c in range(layout.cols):
                    if page_cursor < page_count:
                        back_grid.append(
                            GridCell(row=r, col=c, page_index=page_cursor,
                                     rotation=layout.cell_rotation)
                        )
                        page_cursor += 1
                    else:
                        back_grid.append(
                            GridCell(row=r, col=c, page_index=None,
                                     rotation=layout.cell_rotation)
                        )

            back_grid_mirrored = create_duplex_back(
                back_grid, layout, config, eff_trim_w, eff_trim_h
            )

            marks_back = place_all_marks(
                back_grid_mirrored, layout, config.marks, config.bleed, config.sheet,
                eff_trim_w, eff_trim_h, filename, sheet_num, layout.total_sheets,
            )

            _assemble_pikepdf_sheet(
                output_pdf, source_pdf, back_grid_mirrored, marks_back,
                config, analysis, eff_trim_w, eff_trim_h,
            )


def _build_saddle_stitch(
    output_pdf, source_pdf, layout, config, analysis,
    eff_trim_w, eff_trim_h, orig_trim_w, orig_trim_h,
    filename, page_count,
):
    """Build saddle-stitch booklet imposition."""
    sheets_data = get_saddle_stitch_sheets(page_count)

    for sheet_num, sheet_data in enumerate(sheets_data, 1):
        front_pages = sheet_data["front"]
        front_grid = []
        for i, pidx in enumerate(front_pages):
            col = i % layout.cols
            row = i // layout.cols
            front_grid.append(
                GridCell(row=row, col=col, page_index=pidx,
                         rotation=layout.cell_rotation)
            )

        calculate_per_cell_bleed(front_grid, layout, config.bleed, config.gap_between_items)
        calculate_cell_positions(
            front_grid, layout, config.sheet, config.bleed,
            config.gap_between_items, eff_trim_w, eff_trim_h,
        )

        marks = place_all_marks(
            front_grid, layout, config.marks, config.bleed, config.sheet,
            eff_trim_w, eff_trim_h, filename, sheet_num, len(sheets_data),
        )

        _assemble_pikepdf_sheet(
            output_pdf, source_pdf, front_grid, marks,
            config, analysis, eff_trim_w, eff_trim_h,
        )

        back_pages = sheet_data["back"]
        back_grid = []
        for i, pidx in enumerate(back_pages):
            col = i % layout.cols
            row = i // layout.cols
            back_grid.append(
                GridCell(row=row, col=col, page_index=pidx,
                         rotation=layout.cell_rotation)
            )

        for cell in back_grid:
            cell.col = (layout.cols - 1) - cell.col

        calculate_per_cell_bleed(back_grid, layout, config.bleed, config.gap_between_items)
        calculate_cell_positions(
            back_grid, layout, config.sheet, config.bleed,
            config.gap_between_items, eff_trim_w, eff_trim_h,
        )

        marks_back = place_all_marks(
            back_grid, layout, config.marks, config.bleed, config.sheet,
            eff_trim_w, eff_trim_h, filename, sheet_num, len(sheets_data),
        )

        _assemble_pikepdf_sheet(
            output_pdf, source_pdf, back_grid, marks_back,
            config, analysis, eff_trim_w, eff_trim_h,
        )


def _get_source_page_boxes_pt(source_pdf, page_idx: int):
    """
    Read the source page's trim and media box directly in PDF points.
    No double-conversion through mm — this avoids precision loss.
    Returns (media_box, trim_x, trim_y, trim_w, trim_h) all in points.
    """
    src_page = source_pdf.pages[page_idx]
    src_media = [float(v) for v in src_page.MediaBox]
    media_x0 = min(src_media[0], src_media[2])
    media_y0 = min(src_media[1], src_media[3])
    media_w = abs(src_media[2] - src_media[0])
    media_h = abs(src_media[3] - src_media[1])

    # Try to read TrimBox directly from PDF
    trim_box_raw = None
    try:
        tb = src_page.get("/TrimBox")
        if tb is not None:
            trim_box_raw = [float(v) for v in tb]
    except Exception:
        pass

    if trim_box_raw:
        trim_x = min(trim_box_raw[0], trim_box_raw[2])
        trim_y = min(trim_box_raw[1], trim_box_raw[3])
        trim_w = abs(trim_box_raw[2] - trim_box_raw[0])
        trim_h = abs(trim_box_raw[3] - trim_box_raw[1])
    else:
        # No TrimBox — treat entire media as trim
        trim_x = media_x0
        trim_y = media_y0
        trim_w = media_w
        trim_h = media_h

    return (media_x0, media_y0, media_w, media_h,
            trim_x, trim_y, trim_w, trim_h)


def _assemble_pikepdf_sheet(
    output_pdf: pikepdf.Pdf,
    source_pdf: pikepdf.Pdf,
    grid: list[GridCell],
    marks: list,
    config: ImpositionConfig,
    analysis,
    eff_trim_w: float,
    eff_trim_h: float,
):
    """
    Assemble a single imposed sheet page using pikepdf.
    Places source pages as Form XObjects with clipping for bleed control.
    """
    sheet_w = config.sheet.sheet_width
    sheet_h = config.sheet.sheet_height

    if config.sheet.orientation == "landscape" and sheet_w < sheet_h:
        sheet_w, sheet_h = sheet_h, sheet_w
    elif config.sheet.orientation == "portrait" and sheet_w > sheet_h:
        sheet_w, sheet_h = sheet_h, sheet_w

    sheet_w_pt = mm_to_pt(sheet_w)
    sheet_h_pt = mm_to_pt(sheet_h)

    # Create marks overlay using ReportLab
    marks_buf = io.BytesIO()
    c = canvas.Canvas(marks_buf, pagesize=(sheet_w_pt, sheet_h_pt))
    _draw_marks_reportlab(c, marks)
    c.showPage()
    c.save()
    marks_buf.seek(0)

    marks_pdf = pikepdf.open(marks_buf)

    # Create new blank page
    new_page = pikepdf.Dictionary(
        Type=pikepdf.Name.Page,
        MediaBox=[0, 0, sheet_w_pt, sheet_h_pt],
        Resources=pikepdf.Dictionary(
            XObject=pikepdf.Dictionary(),
        ),
    )

    content_ops = []

    # Cache XObjects to reuse same page multiple times (step-and-repeat)
    xobj_cache: dict[int, str] = {}
    xobj_counter = 0

    target_trim_w_pt = mm_to_pt(eff_trim_w)
    target_trim_h_pt = mm_to_pt(eff_trim_h)

    for cell in grid:
        if cell.page_index is None:
            continue
        if cell.page_index >= len(source_pdf.pages):
            continue

        page_idx = cell.page_index

        # Import source page as Form XObject (reuse if same page)
        if page_idx not in xobj_cache:
            xobj_name = f"P{xobj_counter}"
            xobj_counter += 1

            src_page = source_pdf.pages[page_idx]
            form_xobj = _page_to_form_xobject(output_pdf, source_pdf, src_page)
            new_page.Resources.XObject[pikepdf.Name(f"/{xobj_name}")] = form_xobj
            xobj_cache[page_idx] = xobj_name
        else:
            xobj_name = xobj_cache[page_idx]

        # Read source page boxes directly in PDF points (no mm round-trip)
        (_, _, _, _, src_trim_x, src_trim_y,
         src_trim_w, src_trim_h) = _get_source_page_boxes_pt(source_pdf, page_idx)

        # Target position on the sheet (in points)
        target_x = mm_to_pt(cell.trim_origin_x)
        target_y = mm_to_pt(cell.trim_origin_y)

        # Clip rect in points
        clip_x = mm_to_pt(cell.clip_rect.x) if cell.clip_rect else target_x
        clip_y = mm_to_pt(cell.clip_rect.y) if cell.clip_rect else target_y
        clip_w = mm_to_pt(cell.clip_rect.width) if cell.clip_rect else target_trim_w_pt
        clip_h = mm_to_pt(cell.clip_rect.height) if cell.clip_rect else target_trim_h_pt

        # Place content at 1:1 scale (no scaling).
        # The clipping rect controls what's visible.
        # The source trim origin is aligned to the target trim position.
        # This preserves the original content size exactly — crop marks
        # define where to cut, and clipping hides anything outside.
        scale = 1.0

        # Build PDF content operation with clipping and transform
        if cell.rotation == 90:
            # 90° CCW rotation matrix: [0, 1, -1, 0, tx, ty]
            # After rotation, source X-axis becomes sheet Y-axis
            # and source Y-axis becomes sheet negative-X-axis.
            # Source trim origin needs to map to target trim origin.
            # Rotated: point (sx, sy) -> (-sy, sx)
            # With scale: (sx, sy) -> (-sy*s, sx*s)
            # We need: src_trim_origin rotated+translated = target_trim_origin
            # target_x = -src_trim_y * s + tx  => tx = target_x + src_trim_y
            # target_y = src_trim_x * s + ty   => ty = target_y - src_trim_x
            # But the cell on sheet is eff_trim_w wide x eff_trim_h tall
            # and after rotation the source width goes into height direction.
            # We shift by target_trim_w_pt to account for the rotation pivot.
            rot_tx = target_x + src_trim_y + target_trim_w_pt
            rot_ty = target_y - src_trim_x
            ops = (
                f"q "
                f"{clip_x:.4f} {clip_y:.4f} {clip_w:.4f} {clip_h:.4f} re W n "
                f"0.000000 1.000000 "
                f"-1.000000 0.000000 "
                f"{rot_tx:.4f} {rot_ty:.4f} cm "
                f"/{xobj_name} Do Q "
            )
        elif cell.rotation == 180:
            # 180° rotation: [-1, 0, 0, -1, tx, ty]
            rot_tx = target_x + src_trim_x + src_trim_w
            rot_ty = target_y + src_trim_y + src_trim_h
            ops = (
                f"q "
                f"{clip_x:.4f} {clip_y:.4f} {clip_w:.4f} {clip_h:.4f} re W n "
                f"-1.000000 0 0 -1.000000 "
                f"{rot_tx:.4f} {rot_ty:.4f} cm "
                f"/{xobj_name} Do Q "
            )
        elif cell.rotation == 270:
            # 270° CCW (= 90° CW): [0, -1, 1, 0, tx, ty]
            rot_tx = target_x - src_trim_y
            rot_ty = target_y + src_trim_x + target_trim_h_pt
            ops = (
                f"q "
                f"{clip_x:.4f} {clip_y:.4f} {clip_w:.4f} {clip_h:.4f} re W n "
                f"0.000000 -1.000000 "
                f"1.000000 0.000000 "
                f"{rot_tx:.4f} {rot_ty:.4f} cm "
                f"/{xobj_name} Do Q "
            )
        else:
            # No rotation: [1, 0, 0, 1, tx, ty]
            # Align source trim origin to target position
            tx = target_x - src_trim_x
            ty = target_y - src_trim_y
            ops = (
                f"q "
                f"{clip_x:.4f} {clip_y:.4f} {clip_w:.4f} {clip_h:.4f} re W n "
                f"1.000000 0 0 1.000000 {tx:.4f} {ty:.4f} cm "
                f"/{xobj_name} Do Q "
            )

        content_ops.append(ops)

    # Import marks overlay as XObject
    if marks_pdf.pages:
        marks_xobj = _page_to_form_xobject(output_pdf, marks_pdf, marks_pdf.pages[0])
        marks_name = "Marks"
        new_page.Resources.XObject[pikepdf.Name(f"/{marks_name}")] = marks_xobj
        content_ops.append(f"q /{marks_name} Do Q ")

    content_bytes = " ".join(content_ops).encode("latin-1")
    new_page.Contents = output_pdf.make_stream(content_bytes)

    output_pdf.pages.append(pikepdf.Page(new_page))
    marks_pdf.close()


def _page_to_form_xobject(target_pdf: pikepdf.Pdf, source_pdf: pikepdf.Pdf, page) -> pikepdf.Object:
    """Convert a PDF page to a Form XObject for embedding."""
    media_box = [float(v) for v in page.MediaBox]

    # Read the content stream bytes
    contents = page.get("/Contents")
    if contents is None:
        content_bytes = b""
    elif isinstance(contents, pikepdf.Array):
        parts = []
        for ref in contents:
            obj = ref
            if hasattr(ref, 'get_object'):
                obj = ref.get_object()
            try:
                parts.append(obj.read_bytes())
            except Exception:
                pass
        content_bytes = b" ".join(parts)
    else:
        try:
            content_bytes = contents.read_bytes()
        except Exception:
            try:
                content_bytes = contents.get_object().read_bytes()
            except Exception:
                content_bytes = b""

    form_xobj_dict = pikepdf.Dictionary(
        Type=pikepdf.Name.XObject,
        Subtype=pikepdf.Name.Form,
        BBox=pikepdf.Array(media_box),
        FormType=1,
    )

    # Copy resources from the source page into the target PDF
    resources = page.get("/Resources")
    if resources is not None:
        try:
            if not resources.is_indirect:
                indirect_ref = source_pdf.make_indirect(resources)
                form_xobj_dict["/Resources"] = target_pdf.copy_foreign(indirect_ref)
            else:
                form_xobj_dict["/Resources"] = target_pdf.copy_foreign(resources)
        except Exception:
            res_copy = pikepdf.Dictionary()
            for key in resources.keys():
                try:
                    val = resources[key]
                    if val.is_indirect:
                        res_copy[key] = target_pdf.copy_foreign(val)
                    else:
                        indirect_val = source_pdf.make_indirect(val)
                        res_copy[key] = target_pdf.copy_foreign(indirect_val)
                except Exception:
                    pass
            form_xobj_dict["/Resources"] = res_copy

    form_xobj = target_pdf.make_stream(content_bytes, form_xobj_dict)
    return form_xobj


def _draw_marks_reportlab(c: canvas.Canvas, marks: list):
    """Draw all marks using ReportLab for the overlay."""
    for mark in marks:
        if mark.type == "crop":
            c.saveState()
            stroke = mark.properties.get("stroke", 0.25)
            color = mark.properties.get("color", "registration")
            if color == "registration":
                c.setStrokeColor(CMYKColor(1, 1, 1, 1))
            else:
                c.setStrokeColor(CMYKColor(0, 0, 0, 1))
            c.setLineWidth(stroke)
            c.line(mm_to_pt(mark.x1), mm_to_pt(mark.y1),
                   mm_to_pt(mark.x2), mm_to_pt(mark.y2))
            c.restoreState()

        elif mark.type == "registration":
            c.saveState()
            cx = mm_to_pt(mark.x1)
            cy = mm_to_pt(mark.y1)
            radius = mm_to_pt(mark.properties.get("radius", 4.0))
            crosshair = mm_to_pt(mark.properties.get("crosshair_length", 6.0))
            c.setStrokeColor(CMYKColor(1, 1, 1, 1))
            c.setLineWidth(0.25)
            c.circle(cx, cy, radius, fill=0, stroke=1)
            c.circle(cx, cy, radius * 0.3, fill=0, stroke=1)
            half = crosshair / 2
            c.line(cx - half, cy, cx + half, cy)
            c.line(cx, cy - half, cx, cy + half)
            c.restoreState()

        elif mark.type == "color_bar":
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

        elif mark.type == "fold":
            c.saveState()
            c.setStrokeColor(CMYKColor(1, 1, 1, 1))
            c.setLineWidth(0.25)
            c.setDash(3, 3)
            c.line(mm_to_pt(mark.x1), mm_to_pt(mark.y1),
                   mm_to_pt(mark.x2), mm_to_pt(mark.y2))
            c.restoreState()

        elif mark.type == "slug_text":
            c.saveState()
            x = mm_to_pt(mark.x1)
            y = mm_to_pt(mark.y1)
            text = mark.properties.get("text", "")
            font_size = mark.properties.get("font_size", 6)
            c.setFillColor(CMYKColor(0, 0, 0, 1))
            c.setFont("Helvetica", font_size)
            c.drawString(x, y, text)
            c.restoreState()
