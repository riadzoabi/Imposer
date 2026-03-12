import json
import os
import tempfile
import uuid
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel as PydanticBaseModel
import io

from models import (
    ImpositionConfig,
    ImpositionLayout,
    AnalysisResult,
    PreviewData,
    PresetConfig,
    ImpositionMode,
    BleedConfig,
    MarkConfig,
    SheetConfig,
    GridCell,
    ScaleMode,
)
from pdf_analyzer import analyze_pdf
from imposition_engine import calculate_imposition_layout, get_saddle_stitch_sheets
from bleed_manager import calculate_per_cell_bleed, calculate_cell_positions
from mark_placer import place_all_marks
from pdf_output import generate_imposed_pdf
from auth import register_user, login_user, logout_user, validate_token, get_user_devices, remove_device
from auth_middleware import require_auth, require_subscription_dep
from subscription import (
    get_active_subscription, check_device_limit, create_checkout_session,
    cancel_subscription, PLANS,
)

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app):
    # Clean up expired sessions and stale devices, then seed dummy users
    from database import cleanup_expired
    from seed_users import seed
    cleanup_expired()
    seed()
    yield

app = FastAPI(title="Print Imposition System", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory session storage for uploaded PDFs
_sessions: dict[str, dict] = {}

# Presets directory
PRESETS_DIR = Path(__file__).parent / "presets"
PRESETS_DIR.mkdir(exist_ok=True)

# Built-in presets
BUILTIN_PRESETS = {
    "business_card_sra3": PresetConfig(
        name="Business Card 90x55mm on SRA3, 24-up, 3mm bleed",
        config=ImpositionConfig(
            mode=ImpositionMode.step_and_repeat,
            trim_width=90.0, trim_height=55.0,
            bleed=BleedConfig(top=3, bottom=3, left=3, right=3, uniform=True),
            sheet=SheetConfig(sheet_width=320, sheet_height=450),
            gap_between_items=0,
            auto_rotate=True,
        ),
    ),
    "a5_saddle_sra3": PresetConfig(
        name="A5 Saddle Stitch on SRA3, 4-up",
        config=ImpositionConfig(
            mode=ImpositionMode.booklet_saddle_stitch,
            trim_width=148.0, trim_height=210.0,
            bleed=BleedConfig(top=3, bottom=3, left=3, right=3, uniform=True),
            sheet=SheetConfig(sheet_width=320, sheet_height=450),
            auto_rotate=True,
        ),
    ),
    "a4_cut_stack_sra3": PresetConfig(
        name="A4 on SRA3, 2-up, Cut & Stack",
        config=ImpositionConfig(
            mode=ImpositionMode.cut_and_stack,
            trim_width=210.0, trim_height=297.0,
            bleed=BleedConfig(top=3, bottom=3, left=3, right=3, uniform=True),
            sheet=SheetConfig(sheet_width=320, sheet_height=450),
            auto_rotate=True,
        ),
    ),
    "dl_flyer_sra4": PresetConfig(
        name="DL Flyer on SRA4, 4-up with 2mm gap",
        config=ImpositionConfig(
            mode=ImpositionMode.step_and_repeat,
            trim_width=99.0, trim_height=210.0,
            bleed=BleedConfig(top=3, bottom=3, left=3, right=3, uniform=True),
            sheet=SheetConfig(sheet_width=225, sheet_height=320),
            gap_between_items=2.0,
            auto_rotate=True,
        ),
    ),
    "a6_postcard_sra3": PresetConfig(
        name="A6 Postcard on SRA3, 8-up",
        config=ImpositionConfig(
            mode=ImpositionMode.step_and_repeat,
            trim_width=105.0, trim_height=148.0,
            bleed=BleedConfig(top=3, bottom=3, left=3, right=3, uniform=True),
            sheet=SheetConfig(sheet_width=320, sheet_height=450),
            auto_rotate=True,
        ),
    ),
}


# ── Auth request models ─────────────────────────────────────────────

class RegisterRequest(PydanticBaseModel):
    email: str
    password: str

class LoginRequest(PydanticBaseModel):
    email: str
    password: str
    device_fingerprint: str
    device_name: str = "Browser"

class CheckoutRequest(PydanticBaseModel):
    plan: str = "pro"
    billing_cycle: str = "monthly"


# ── Auth endpoints ──────────────────────────────────────────────────

@app.post("/api/auth/register")
async def api_register(req: RegisterRequest):
    """Create a new user account."""
    try:
        result = register_user(req.email, req.password)
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/api/auth/login")
async def api_login(req: LoginRequest):
    """Log in and receive a session token (7-day expiry)."""
    try:
        result = login_user(req.email, req.password, req.device_fingerprint, req.device_name)
        return result
    except ValueError as e:
        raise HTTPException(401, str(e))


@app.post("/api/auth/logout")
async def api_logout(user: dict = Depends(require_auth)):
    """Revoke the current session token."""
    logout_user(user["token"])
    return {"status": "logged_out"}


@app.get("/api/auth/me")
async def api_me(user: dict = Depends(require_auth)):
    """Return current user info, subscription, and device status."""
    sub = get_active_subscription(user["user_id"])
    device_check = check_device_limit(user["user_id"])
    devices = get_user_devices(user["user_id"])

    return {
        "user": {"id": user["user_id"], "email": user["email"]},
        "subscription": sub,
        "devices": devices,
        "device_limit": device_check,
    }


@app.get("/api/auth/devices")
async def api_devices(user: dict = Depends(require_auth)):
    """List all registered devices for the current user."""
    return {"devices": get_user_devices(user["user_id"])}


@app.delete("/api/auth/devices/{device_id}")
async def api_remove_device(device_id: int, user: dict = Depends(require_auth)):
    """Remove a device and revoke its sessions."""
    remove_device(user["user_id"], device_id)
    return {"status": "removed"}


# ── Subscription endpoints ──────────────────────────────────────────

@app.get("/api/subscription/plans")
async def api_plans():
    """Return available subscription plans."""
    return {"plans": PLANS}


@app.post("/api/subscription/checkout")
async def api_checkout(req: CheckoutRequest, user: dict = Depends(require_auth)):
    """
    PLACEHOLDER: Create a payment checkout session.
    In development, this auto-activates the subscription.
    In production, replace with Stripe/Paddle redirect.
    """
    result = create_checkout_session(user["user_id"], req.plan, req.billing_cycle)
    return result


@app.post("/api/subscription/cancel")
async def api_cancel(user: dict = Depends(require_auth)):
    """Cancel the user's active subscription."""
    cancel_subscription(user["user_id"])
    return {"status": "cancelled"}


@app.get("/api/subscription/status")
async def api_sub_status(user: dict = Depends(require_auth)):
    """Return current subscription status."""
    sub = get_active_subscription(user["user_id"])
    device_check = check_device_limit(user["user_id"])
    return {"subscription": sub, "device_limit": device_check}


# ── Protected imposition endpoints ──────────────────────────────────

@app.post("/api/upload")
async def upload_pdf(file: UploadFile = File(...), user: dict = Depends(require_subscription_dep)):
    """Upload a PDF and analyze its geometry."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are accepted.")

    pdf_bytes = await file.read()

    if len(pdf_bytes) == 0:
        raise HTTPException(400, "Empty file uploaded.")

    try:
        analysis = analyze_pdf(pdf_bytes)
    except ValueError as e:
        raise HTTPException(400, str(e))

    # Store in session
    session_id = str(uuid.uuid4())
    _sessions[session_id] = {
        "pdf_bytes": pdf_bytes,
        "filename": file.filename,
        "analysis": analysis,
    }

    # Clean up old sessions (keep max 10)
    if len(_sessions) > 10:
        oldest = list(_sessions.keys())[0]
        del _sessions[oldest]

    return {
        "session_id": session_id,
        "filename": file.filename,
        "page_count": analysis.page_count,
        "pages": [p.model_dump() for p in analysis.pages],
        "warnings": analysis.warnings,
    }


@app.post("/api/preview")
async def preview_imposition(
    session_id: str,
    config: ImpositionConfig,
    sheet_number: int = 1,
    side: str = "front",
    user: dict = Depends(require_subscription_dep),
):
    """Calculate and return layout preview data for a specific sheet/side."""
    if session_id not in _sessions:
        raise HTTPException(404, "Session not found. Please re-upload the PDF.")

    session = _sessions[session_id]
    analysis = session["analysis"]
    source_page_count = analysis.page_count

    # Use page_sequence if provided, otherwise default sequential
    page_seq = config.page_sequence
    if page_seq is not None:
        effective_page_count = len(page_seq)
    else:
        effective_page_count = source_page_count

    trim_w = config.trim_width
    trim_h = config.trim_height

    # Get source page dimensions for scale calculations
    source_w = trim_w
    source_h = trim_h
    if analysis.pages:
        pg = analysis.pages[0]
        src_box = pg.trim_box or pg.media_box
        source_w = src_box.width
        source_h = src_box.height

    if trim_w == 0 or trim_h == 0:
        trim_w = source_w
        trim_h = source_h

    # For fit_to_sheet: first calculate layout with current trim to get grid
    # dimensions, then expand trim to fill available sheet area
    if config.scale_mode == ScaleMode.fit_to_sheet:
        try:
            layout = calculate_imposition_layout(config, effective_page_count)
        except Exception as e:
            raise HTTPException(400, str(e))

        sheet_w = config.sheet.sheet_width
        sheet_h = config.sheet.sheet_height
        if config.sheet.orientation == "landscape" and sheet_w < sheet_h:
            sheet_w, sheet_h = sheet_h, sheet_w
        elif config.sheet.orientation == "portrait" and sheet_w > sheet_h:
            sheet_w, sheet_h = sheet_h, sheet_w

        mark_margin = config.sheet.mark_margin
        grip = config.sheet.grip_edge
        avail_w = sheet_w - 2 * mark_margin
        avail_h = sheet_h - 2 * mark_margin - grip

        rows = layout.rows
        cols = layout.cols

        if config.gap_between_items == 0:
            # Tight packing: outer bleed + cols*trim = avail
            max_trim_w = (avail_w - config.bleed.left - config.bleed.right) / max(cols, 1)
            max_trim_h = (avail_h - config.bleed.top - config.bleed.bottom) / max(rows, 1)
        else:
            gap = config.gap_between_items
            max_trim_w = (avail_w / max(cols, 1)) - config.bleed.left - config.bleed.right - gap
            max_trim_h = (avail_h / max(rows, 1)) - config.bleed.top - config.bleed.bottom - gap

        # Scale source proportionally to fit within max cell
        if layout.cell_rotation == 90:
            scale_fit = min(max_trim_w / source_h, max_trim_h / source_w) if source_w > 0 and source_h > 0 else 1.0
            trim_w = source_h * scale_fit
            trim_h = source_w * scale_fit
        else:
            scale_fit = min(max_trim_w / source_w, max_trim_h / source_h) if source_w > 0 and source_h > 0 else 1.0
            trim_w = source_w * scale_fit
            trim_h = source_h * scale_fit

        # Recalculate layout with new trim sizes
        config_copy = config.model_copy(update={"trim_width": trim_w, "trim_height": trim_h})
        try:
            layout = calculate_imposition_layout(config_copy, effective_page_count)
        except Exception as e:
            raise HTTPException(400, str(e))
    else:
        try:
            layout = calculate_imposition_layout(config, effective_page_count)
        except Exception as e:
            raise HTTPException(400, str(e))

    eff_trim_w = trim_w
    eff_trim_h = trim_h
    if layout.cell_rotation == 90:
        eff_trim_w = trim_h
        eff_trim_h = trim_w

    # Compute scale factor for preview rendering
    scale_factor = 1.0
    if config.scale_mode == ScaleMode.fit_to_trim:
        if layout.cell_rotation == 90:
            scale_factor = min(eff_trim_w / source_h, eff_trim_h / source_w) if source_w > 0 and source_h > 0 else 1.0
        else:
            scale_factor = min(eff_trim_w / source_w, eff_trim_h / source_h) if source_w > 0 and source_h > 0 else 1.0
    elif config.scale_mode == ScaleMode.fit_to_sheet:
        # For fit_to_sheet the trim was already expanded to fill the sheet,
        # so scale_factor reflects that expansion from original source size
        if layout.cell_rotation == 90:
            scale_factor = min(eff_trim_w / source_h, eff_trim_h / source_w) if source_w > 0 and source_h > 0 else 1.0
        else:
            scale_factor = min(eff_trim_w / source_w, eff_trim_h / source_h) if source_w > 0 and source_h > 0 else 1.0

    # Clamp sheet_number
    sheet_number = max(1, min(sheet_number, layout.total_sheets))

    # Build grid for the requested sheet and side
    grid = _build_preview_grid(
        config, layout, effective_page_count, sheet_number, side, eff_trim_w, eff_trim_h,
    )

    # Remap page indices through page_sequence
    if page_seq is not None:
        for cell in grid:
            if cell.page_index is not None and 0 <= cell.page_index < len(page_seq):
                cell.page_index = page_seq[cell.page_index]
            elif cell.page_index is not None:
                cell.page_index = None

    calculate_per_cell_bleed(grid, layout, config.bleed, config.gap_between_items)
    calculate_cell_positions(
        grid, layout, config.sheet, config.bleed,
        config.gap_between_items, eff_trim_w, eff_trim_h,
    )

    marks = place_all_marks(
        grid, layout, config.marks, config.bleed, config.sheet,
        eff_trim_w, eff_trim_h,
        session["filename"], sheet_number, layout.total_sheets,
    )

    sheet_w = config.sheet.sheet_width
    sheet_h = config.sheet.sheet_height
    if config.sheet.orientation == "landscape" and sheet_w < sheet_h:
        sheet_w, sheet_h = sheet_h, sheet_w

    return {
        "layout": layout.model_dump(),
        "grid": [c.model_dump() for c in grid],
        "marks": [m.model_dump() for m in marks],
        "sheet_width_mm": sheet_w,
        "sheet_height_mm": sheet_h,
        "effective_trim_w": eff_trim_w,
        "effective_trim_h": eff_trim_h,
        "page_count": effective_page_count,
        "source_page_count": source_page_count,
        "current_sheet": sheet_number,
        "current_side": side,
        "scale_mode": config.scale_mode.value,
        "scale_factor": round(scale_factor, 6),
        "source_page_w": source_w,
        "source_page_h": source_h,
    }


def _build_preview_grid(
    config: ImpositionConfig,
    layout: ImpositionLayout,
    page_count: int,
    sheet_number: int,
    side: str,
    eff_trim_w: float,
    eff_trim_h: float,
) -> list:
    """Build the grid cells for a specific sheet number and side.

    Returns a grid with correct page_index and row/col assignments.
    Bleed and positions are calculated by the caller.
    """
    from models import FlipEdge

    n_up = layout.n_up
    rows = layout.rows
    cols = layout.cols
    rotation = layout.cell_rotation

    if config.mode == ImpositionMode.step_and_repeat:
        # Each sheet repeats a single source page
        if config.duplex:
            page_idx = (sheet_number - 1) * 2
            if side == "back":
                page_idx += 1
        else:
            page_idx = sheet_number - 1

        if page_idx >= page_count:
            page_idx = None

        grid = []
        for r in range(rows):
            for c in range(cols):
                grid.append(GridCell(row=r, col=c, page_index=page_idx, rotation=rotation))

    elif config.mode == ImpositionMode.booklet_saddle_stitch:
        sheets_data = get_saddle_stitch_sheets(page_count)
        idx = min(sheet_number - 1, len(sheets_data) - 1)
        pages = sheets_data[idx].get(side, sheets_data[idx]["front"])

        grid = []
        for i, pidx in enumerate(pages):
            col = i % cols
            row = i // cols
            grid.append(GridCell(row=row, col=col, page_index=pidx, rotation=rotation))

        # For back side of saddle stitch, mirror columns
        if side == "back":
            for cell in grid:
                cell.col = (cols - 1) - cell.col

    else:
        # cut_and_stack / perfect_bind: sequential pages
        if config.duplex:
            pages_per_sheet = n_up * 2
            start = (sheet_number - 1) * pages_per_sheet
            if side == "front":
                cursor = start
            else:
                cursor = start + n_up
        else:
            cursor = (sheet_number - 1) * n_up

        grid = []
        for r in range(rows):
            for c in range(cols):
                if cursor < page_count:
                    grid.append(GridCell(row=r, col=c, page_index=cursor, rotation=rotation))
                    cursor += 1
                else:
                    grid.append(GridCell(row=r, col=c, page_index=None, rotation=rotation))

    # Apply duplex mirroring for back side (not saddle stitch, which handles its own mirroring)
    if side == "back" and config.duplex and config.mode != ImpositionMode.booklet_saddle_stitch:
        if config.flip_edge == FlipEdge.long:
            for cell in grid:
                cell.col = (cols - 1) - cell.col
        elif config.flip_edge == FlipEdge.short:
            for cell in grid:
                cell.row = (rows - 1) - cell.row
                cell.rotation = (cell.rotation + 180) % 360

    return grid


@app.get("/api/pdf/{session_id}")
async def get_pdf(session_id: str, user: dict = Depends(require_auth)):
    """Serve the uploaded PDF bytes so the frontend can render thumbnails."""
    if session_id not in _sessions:
        raise HTTPException(404, "Session not found.")

    session = _sessions[session_id]
    return StreamingResponse(
        io.BytesIO(session["pdf_bytes"]),
        media_type="application/pdf",
        headers={"Cache-Control": "private, max-age=3600"},
    )


@app.post("/api/impose")
async def impose_pdf(session_id: str, config: ImpositionConfig, user: dict = Depends(require_subscription_dep)):
    """Run full imposition pipeline and return imposed PDF."""
    if session_id not in _sessions:
        raise HTTPException(404, "Session not found. Please re-upload the PDF.")

    session = _sessions[session_id]

    try:
        result_bytes = generate_imposed_pdf(
            session["pdf_bytes"],
            config,
            session["filename"],
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Imposition failed: {str(e)}")

    return StreamingResponse(
        io.BytesIO(result_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="imposed_{session["filename"]}"'
        },
    )


@app.post("/api/presets/save")
async def save_preset(preset: PresetConfig, user: dict = Depends(require_auth)):
    """Save an imposition preset."""
    safe_name = "".join(
        c if c.isalnum() or c in "-_ " else "" for c in preset.name
    ).strip()
    if not safe_name:
        raise HTTPException(400, "Invalid preset name.")

    filepath = PRESETS_DIR / f"{safe_name}.json"
    filepath.write_text(preset.model_dump_json(indent=2))

    return {"status": "saved", "name": preset.name}


@app.get("/api/presets/list")
async def list_presets():
    """Return all available presets (built-in + saved)."""
    presets = []

    # Built-in
    for key, preset in BUILTIN_PRESETS.items():
        presets.append({
            "id": key,
            "name": preset.name,
            "builtin": True,
            "config": preset.config.model_dump(),
        })

    # Saved
    for filepath in PRESETS_DIR.glob("*.json"):
        try:
            data = json.loads(filepath.read_text())
            presets.append({
                "id": filepath.stem,
                "name": data.get("name", filepath.stem),
                "builtin": False,
                "config": data.get("config", {}),
            })
        except Exception:
            continue

    return {"presets": presets}


@app.get("/api/presets/{preset_id}")
async def get_preset(preset_id: str):
    """Get a specific preset config."""
    if preset_id in BUILTIN_PRESETS:
        preset = BUILTIN_PRESETS[preset_id]
        return {"name": preset.name, "config": preset.config.model_dump()}

    filepath = PRESETS_DIR / f"{preset_id}.json"
    if filepath.exists():
        data = json.loads(filepath.read_text())
        return data

    raise HTTPException(404, "Preset not found.")


# Serve frontend static files (for production deployment)
_static_dir = Path(__file__).parent.parent / "frontend" / "dist"
if _static_dir.exists():
    from fastapi.responses import FileResponse

    # Mount static assets
    app.mount("/assets", StaticFiles(directory=str(_static_dir / "assets")), name="static-assets")

    # Catch-all for SPA: serve index.html for any non-API route
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # If the file exists in dist, serve it
        file_path = _static_dir / full_path
        if full_path and file_path.exists() and file_path.is_file():
            return FileResponse(str(file_path))
        # Otherwise, serve index.html (SPA routing)
        return FileResponse(str(_static_dir / "index.html"))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
