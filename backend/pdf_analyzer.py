import pikepdf
import io
import re
from models import PageGeometry, Rectangle, DetectedBleed, AnalysisResult
from utils import pdf_rect_to_mm, pt_to_mm


def analyze_pdf(pdf_bytes: bytes) -> AnalysisResult:
    """Analyze uploaded PDF: extract page boxes, detect bleed, detect existing marks."""
    warnings: list[str] = []
    pages: list[PageGeometry] = []

    try:
        pdf = pikepdf.open(io.BytesIO(pdf_bytes))
    except pikepdf.PasswordError:
        raise ValueError("PDF is encrypted. Please provide an unencrypted PDF.")
    except Exception as e:
        raise ValueError(f"Failed to open PDF: {str(e)}")

    if len(pdf.pages) == 0:
        raise ValueError("PDF contains zero pages.")

    first_page_size = None

    for page_index, page in enumerate(pdf.pages):
        # Step 1: Extract PDF boxes
        media_box = _extract_box(page, "/MediaBox")
        if media_box is None:
            raise ValueError(f"Page {page_index + 1} has no MediaBox (invalid PDF).")

        media_rect = pdf_rect_to_mm(media_box)
        trim_box_raw = _extract_box(page, "/TrimBox")
        bleed_box_raw = _extract_box(page, "/BleedBox")
        art_box_raw = _extract_box(page, "/ArtBox")

        trim_rect = pdf_rect_to_mm(trim_box_raw) if trim_box_raw else None
        bleed_rect = pdf_rect_to_mm(bleed_box_raw) if bleed_box_raw else None
        art_rect = pdf_rect_to_mm(art_box_raw) if art_box_raw else None

        # Step 2: Determine bleed amounts
        detected_bleed = DetectedBleed()

        if trim_rect and bleed_rect:
            detected_bleed = DetectedBleed(
                top=max(0, bleed_rect.top_edge - trim_rect.top_edge),
                bottom=max(0, trim_rect.bottom_edge - bleed_rect.bottom_edge),
                left=max(0, trim_rect.left_edge - bleed_rect.left_edge),
                right=max(0, bleed_rect.right_edge - trim_rect.right_edge),
            )
        elif trim_rect and not bleed_rect:
            raw_top = max(0, media_rect.top_edge - trim_rect.top_edge)
            raw_bottom = max(0, trim_rect.bottom_edge - media_rect.bottom_edge)
            raw_left = max(0, trim_rect.left_edge - media_rect.left_edge)
            raw_right = max(0, media_rect.right_edge - trim_rect.right_edge)

            detected_bleed = DetectedBleed(
                top=raw_top if raw_top <= 10.0 else 0.0,
                bottom=raw_bottom if raw_bottom <= 10.0 else 0.0,
                left=raw_left if raw_left <= 10.0 else 0.0,
                right=raw_right if raw_right <= 10.0 else 0.0,
            )
        else:
            # No trim box — use media box as trim
            trim_rect = media_rect
            detected_bleed = DetectedBleed(top=0, bottom=0, left=0, right=0)
            warnings.append(
                f"Page {page_index + 1}: No TrimBox found. Using MediaBox as trim size. "
                "Please verify or manually specify the trim size."
            )

        # Check for mixed page sizes
        page_size_key = (round(trim_rect.width, 1), round(trim_rect.height, 1))
        if first_page_size is None:
            first_page_size = page_size_key
        elif page_size_key != first_page_size:
            warnings.append(
                f"Page {page_index + 1} has a different size "
                f"({trim_rect.width:.1f}x{trim_rect.height:.1f}mm) "
                f"than page 1 ({first_page_size[0]}x{first_page_size[1]}mm)."
            )

        # Step 3: Detect existing marks
        has_marks = detect_existing_marks(page, trim_rect, media_rect)

        pages.append(
            PageGeometry(
                media_box=media_rect,
                trim_box=trim_rect,
                bleed_box=bleed_rect,
                art_box=art_rect,
                detected_bleed=detected_bleed,
                has_existing_marks=has_marks,
                page_index=page_index,
            )
        )

    return AnalysisResult(page_count=len(pages), pages=pages, warnings=warnings)


def _extract_box(page, box_name: str):
    """Extract a box array from a PDF page, resolving inheritance."""
    try:
        box = page.get(box_name)
        if box is not None:
            return [float(v) for v in box]
    except Exception:
        pass

    # Try to get from page tree (inherited)
    try:
        if box_name == "/MediaBox":
            return [float(v) for v in page.mediabox]
        elif box_name == "/TrimBox":
            if hasattr(page, "trimbox"):
                return [float(v) for v in page.trimbox]
    except Exception:
        pass

    return None


def detect_existing_marks(page, trim_rect: Rectangle, media_rect: Rectangle) -> bool:
    """
    Heuristic detection of existing crop marks.
    Looks for thin lines outside the trim box near corners.
    """
    if trim_rect is None:
        return False

    # If trim box equals media box, no room for marks
    if (
        abs(trim_rect.width - media_rect.width) < 1.0
        and abs(trim_rect.height - media_rect.height) < 1.0
    ):
        return False

    # Check if there's significant space outside trim (>5mm on any side)
    space_outside = (
        (trim_rect.left_edge - media_rect.left_edge) > 5.0
        or (media_rect.right_edge - trim_rect.right_edge) > 5.0
        or (trim_rect.bottom_edge - media_rect.bottom_edge) > 5.0
        or (media_rect.top_edge - trim_rect.top_edge) > 5.0
    )

    if not space_outside:
        return False

    # Try to parse content stream for thin line operations
    try:
        content_stream = _get_content_stream_text(page)
        if content_stream:
            return _scan_for_crop_marks(content_stream, trim_rect)
    except Exception:
        pass

    # Fallback: if there's significant margin space, assume marks might exist
    margin = min(
        trim_rect.left_edge - media_rect.left_edge,
        media_rect.right_edge - trim_rect.right_edge,
        trim_rect.bottom_edge - media_rect.bottom_edge,
        media_rect.top_edge - trim_rect.top_edge,
    )
    return margin > 8.0


def _get_content_stream_text(page) -> str:
    """Extract the raw content stream as text."""
    try:
        contents = page.get("/Contents")
        if contents is None:
            return ""

        if isinstance(contents, pikepdf.Array):
            parts = []
            for ref in contents:
                stream = ref.get_object()
                if hasattr(stream, "read_bytes"):
                    parts.append(stream.read_bytes().decode("latin-1", errors="ignore"))
            return "\n".join(parts)
        else:
            obj = contents
            if isinstance(obj, pikepdf.Stream):
                return obj.read_bytes().decode("latin-1", errors="ignore")
            obj = contents.get_object()
            if hasattr(obj, "read_bytes"):
                return obj.read_bytes().decode("latin-1", errors="ignore")
    except Exception:
        pass
    return ""


def _scan_for_crop_marks(content: str, trim_rect: Rectangle) -> bool:
    """
    Scan content stream for patterns that look like crop marks:
    thin stroke lines near corners, outside trim area.
    """
    # Look for line width settings followed by line drawing operations
    # Typical pattern: 0.25 w ... x y m x y l S
    line_width_pattern = re.compile(r"([\d.]+)\s+w")
    line_pattern = re.compile(
        r"([\d.]+)\s+([\d.]+)\s+m\s+([\d.]+)\s+([\d.]+)\s+l"
    )

    thin_lines_outside = 0

    current_width_pt = 1.0
    for line in content.split("\n"):
        # Update current line width
        w_match = line_width_pattern.search(line)
        if w_match:
            current_width_pt = float(w_match.group(1))

        # Only interested in thin lines (0.1 to 1.0 pt)
        if current_width_pt < 0.05 or current_width_pt > 1.0:
            continue

        for match in line_pattern.finditer(line):
            x1_mm = pt_to_mm(float(match.group(1)))
            y1_mm = pt_to_mm(float(match.group(2)))
            x2_mm = pt_to_mm(float(match.group(3)))
            y2_mm = pt_to_mm(float(match.group(4)))

            # Check if it's horizontal or vertical
            is_h = abs(y1_mm - y2_mm) < 0.5
            is_v = abs(x1_mm - x2_mm) < 0.5

            if not (is_h or is_v):
                continue

            length = (
                abs(x2_mm - x1_mm) if is_h else abs(y2_mm - y1_mm)
            )

            # Crop marks are typically 3-15mm
            if length < 2.0 or length > 20.0:
                continue

            # Check if near a corner and outside trim
            corners = [
                (trim_rect.left_edge, trim_rect.bottom_edge),
                (trim_rect.right_edge, trim_rect.bottom_edge),
                (trim_rect.left_edge, trim_rect.top_edge),
                (trim_rect.right_edge, trim_rect.top_edge),
            ]

            for cx, cy in corners:
                dist = (
                    min(abs(x1_mm - cx), abs(x2_mm - cx)) ** 2
                    + min(abs(y1_mm - cy), abs(y2_mm - cy)) ** 2
                ) ** 0.5

                if dist < 20.0:
                    thin_lines_outside += 1
                    break

    # If we found several thin lines near corners, likely crop marks
    return thin_lines_outside >= 4
