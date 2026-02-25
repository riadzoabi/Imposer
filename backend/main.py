import json
import os
import tempfile
import uuid
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
import io

from models import (
    ImpositionConfig,
    AnalysisResult,
    PreviewData,
    PresetConfig,
    ImpositionMode,
    BleedConfig,
    MarkConfig,
    SheetConfig,
)
from pdf_analyzer import analyze_pdf
from imposition_engine import calculate_imposition_layout
from bleed_manager import calculate_per_cell_bleed, calculate_cell_positions
from mark_placer import place_all_marks
from pdf_output import generate_imposed_pdf

app = FastAPI(title="Print Imposition System", version="1.0.0")

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


@app.post("/api/upload")
async def upload_pdf(file: UploadFile = File(...)):
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
async def preview_imposition(session_id: str, config: ImpositionConfig):
    """Calculate and return layout preview data."""
    if session_id not in _sessions:
        raise HTTPException(404, "Session not found. Please re-upload the PDF.")

    session = _sessions[session_id]
    analysis = session["analysis"]

    trim_w = config.trim_width
    trim_h = config.trim_height

    if trim_w == 0 or trim_h == 0:
        if analysis.pages and analysis.pages[0].trim_box:
            trim_w = analysis.pages[0].trim_box.width
            trim_h = analysis.pages[0].trim_box.height
        elif analysis.pages:
            trim_w = analysis.pages[0].media_box.width
            trim_h = analysis.pages[0].media_box.height

    try:
        layout = calculate_imposition_layout(config, analysis.page_count)
    except Exception as e:
        raise HTTPException(400, str(e))

    eff_trim_w = trim_w
    eff_trim_h = trim_h
    if layout.cell_rotation == 90:
        eff_trim_w = trim_h
        eff_trim_h = trim_w

    grid = layout.grid
    calculate_per_cell_bleed(grid, layout, config.bleed, config.gap_between_items)
    calculate_cell_positions(
        grid, layout, config.sheet, config.bleed,
        config.gap_between_items, eff_trim_w, eff_trim_h,
    )

    marks = place_all_marks(
        grid, layout, config.marks, config.bleed, config.sheet,
        eff_trim_w, eff_trim_h,
        session["filename"], 1, layout.total_sheets,
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
        "page_count": analysis.page_count,
    }


@app.get("/api/pdf/{session_id}")
async def get_pdf(session_id: str):
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
async def impose_pdf(session_id: str, config: ImpositionConfig):
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
async def save_preset(preset: PresetConfig):
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
