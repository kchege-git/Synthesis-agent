"""
Panel Transcription Agent — FastAPI backend.

Pipeline:
  1. Accept transcript/audio file + up to 3 background images + event metadata
  2. Transcribe (if audio) and parse the transcript
  3. Analyse with Claude (takeaways + quotes)
  4. Generate PPTX slides (image overlays + quote slides)
  5. Generate PNG quote cards (1080×1080) for campus screens
  6. Write plain-text takeaways, quotes, and social media caption
  7. Bundle everything as a ZIP and return download link
"""

import json
import os
import shutil
import uuid
import zipfile
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from src.input_processor import process_input, AUDIO_EXTENSIONS
from src.analyzer import analyze_transcript
from src.slide_generator import generate_pptx
from src.quote_card_generator import generate_quote_cards

app = FastAPI(title="Panel Synthesis Agent", version="2.0.0")

BASE_DIR     = Path(__file__).parent
UPLOAD_DIR   = BASE_DIR / "uploads"
OUTPUT_DIR   = BASE_DIR / "outputs"
STATIC_DIR   = BASE_DIR / "static"
TEMPLATE_DIR = BASE_DIR / "templates"

UPLOAD_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
templates = Jinja2Templates(directory=str(TEMPLATE_DIR))


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/process")
async def process(
    transcript_file: UploadFile = File(...),
    image1: UploadFile = File(None),
    image2: UploadFile = File(None),
    image3: UploadFile = File(None),
    panel_name:    str = Form(default=""),
    speaker_names: str = Form(default=""),
    event_name:    str = Form(default="HBS Africa Business Conference"),
    event_date:    str = Form(default=""),
):
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise HTTPException(500, "ANTHROPIC_API_KEY environment variable is not set.")

    job_id  = str(uuid.uuid4())[:10]
    job_dir = OUTPUT_DIR / job_id
    tmp_dir = UPLOAD_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    tmp_dir.mkdir(parents=True, exist_ok=True)

    try:
        # 1. Save and process transcript / audio
        if not transcript_file or not transcript_file.filename:
            raise HTTPException(400, "Please upload a transcript or audio file.")

        t_path = tmp_dir / _safe_name(transcript_file.filename)
        await _save_upload(transcript_file, t_path)

        ext = Path(transcript_file.filename).suffix.lower().lstrip(".")
        file_type = "audio" if ext in AUDIO_EXTENSIONS else ext

        transcript_text = process_input(str(t_path), file_type)
        if len(transcript_text.strip()) < 50:
            raise HTTPException(400, "Transcript appears to be empty or too short.")

        # 2. Save background images
        bg_images = []
        for img_upload in (image1, image2, image3):
            if img_upload and img_upload.filename:
                p = tmp_dir / _safe_name(img_upload.filename)
                await _save_upload(img_upload, p)
                bg_images.append(str(p))

        if not bg_images:
            raise HTTPException(400, "Please upload at least one background image.")

        # 3. Analyse with Claude
        analysis = analyze_transcript(
            transcript=transcript_text,
            panel_name=panel_name,
            speaker_names=speaker_names,
            event_name=event_name,
            event_date=event_date,
        )

        # 4. Generate PPTX
        pptx_path = str(job_dir / "slides.pptx")
        generate_pptx(
            analysis=analysis,
            bg_images=bg_images,
            output_path=pptx_path,
            panel_name=panel_name,
            event_name=event_name,
            event_date=event_date,
            work_dir=str(tmp_dir),
        )

        # 5. Generate PNG quote cards
        cards_dir   = job_dir / "quote_cards"
        quote_cards = generate_quote_cards(analysis, str(cards_dir))

        # 6. Write plain-text files
        (job_dir / "quotes.txt").write_text(_format_quotes(analysis), encoding="utf-8")
        (job_dir / "takeaways.txt").write_text(_format_takeaways(analysis), encoding="utf-8")
        (job_dir / "social_media_caption.txt").write_text(
            analysis.get("social_media_intro", ""), encoding="utf-8"
        )

        # 7. Bundle as ZIP
        zip_path = OUTPUT_DIR / f"panel_assets_{job_id}.zip"
        with zipfile.ZipFile(str(zip_path), "w", zipfile.ZIP_DEFLATED) as zf:
            zf.write(pptx_path, "slides.pptx")
            for cp in quote_cards:
                zf.write(cp, f"quote_cards/{Path(cp).name}")
            zf.write(str(job_dir / "quotes.txt"), "quotes.txt")
            zf.write(str(job_dir / "takeaways.txt"), "takeaways.txt")
            zf.write(str(job_dir / "social_media_caption.txt"), "social_media_caption.txt")

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(500, f"Processing failed: {exc}") from exc
    finally:
        shutil.rmtree(str(tmp_dir), ignore_errors=True)

    return JSONResponse({
        "success": True,
        "job_id": job_id,
        "download_url": f"/download/{job_id}",
        "analysis": analysis,
    })


@app.get("/download/{job_id}")
async def download(job_id: str):
    zip_path = OUTPUT_DIR / f"panel_assets_{job_id}.zip"
    if not zip_path.exists():
        raise HTTPException(404, "Download not found or expired.")
    return FileResponse(
        str(zip_path),
        media_type="application/zip",
        filename=f"panel_assets_{job_id}.zip",
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _save_upload(upload: UploadFile, dest: Path) -> None:
    dest.write_bytes(await upload.read())


def _safe_name(filename: str) -> str:
    return Path(filename).name or "upload"


def _format_quotes(analysis: dict) -> str:
    lines = ["TOP QUOTES", "=" * 52, ""]
    for i, q in enumerate(analysis.get("quotes", []), 1):
        lines.append(f'{i}.  "{q.get("text", "")}"')
        spk = q.get("speaker", "")
        if spk and spk.lower() != "unknown":
            lines.append(f"    — {spk}")
        lines.append("")
    return "\n".join(lines)


def _format_takeaways(analysis: dict) -> str:
    lines = ["KEY TAKEAWAYS", "=" * 52, ""]
    for t in analysis.get("takeaways", []):
        lines.append(f"{t['number']})  {t['headline']}")
        lines.append("")
        for b in t.get("sub_bullets", []):
            lines.append(f"    • {b.get('bold_phrase', '')}.  {b.get('body', '')}")
        lines.append("")
    return "\n".join(lines)
