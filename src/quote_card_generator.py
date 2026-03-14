"""
Quote card generator: produces standalone 1080×1080 PNG images suitable for
campus screens (or any high-resolution display) with HBS ABC branding.
"""

import os
import textwrap
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont  # type: ignore

# ---------------------------------------------------------------------------
# Brand palette (RGB tuples for Pillow)
# ---------------------------------------------------------------------------
NAVY  = (27,  42,  74)
GREEN = (157, 197,  40)
AMBER = (196, 115,  41)
WHITE = (255, 255, 255)
LGRAY = (200, 200, 200)

CARD_W = 1080
CARD_H = 1080

# ---------------------------------------------------------------------------
# Font helper
# ---------------------------------------------------------------------------

_FONT_CACHE: dict = {}

def _font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    key = (size, bold)
    if key in _FONT_CACHE:
        return _FONT_CACHE[key]

    candidates = []
    if bold:
        candidates = [
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
            "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
            "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
            "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
        ]
    else:
        candidates = [
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
            "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
            "/usr/share/fonts/TTF/DejaVuSans.ttf",
            "/usr/share/fonts/dejavu/DejaVuSans.ttf",
        ]

    for path in candidates:
        if os.path.exists(path):
            try:
                fnt = ImageFont.truetype(path, size)
                _FONT_CACHE[key] = fnt
                return fnt
            except Exception:
                continue

    # Fallback — PIL built-in (no size control, but never crashes)
    fnt = ImageFont.load_default()
    _FONT_CACHE[key] = fnt
    return fnt


# ---------------------------------------------------------------------------
# Card drawer
# ---------------------------------------------------------------------------

def draw_quote_card(quote: dict, output_path: str, card_index: int = 1) -> str:
    """
    Render a single quote card and save to output_path (PNG).

    Args:
        quote:       dict with keys 'text', 'speaker', 'rationale'
        output_path: full path for the output PNG
        card_index:  1-based index for the label in the top bar

    Returns:
        output_path
    """
    img = Image.new("RGB", (CARD_W, CARD_H), color=NAVY)
    draw = ImageDraw.Draw(img)

    # ------------------------------------------------------------------
    # Top bar
    # ------------------------------------------------------------------
    top_h = 68
    draw.rectangle([0, 0, CARD_W, top_h], fill=GREEN)
    label_fnt = _font(20, bold=True)
    draw.text((32, 22), f"MEMORABLE QUOTE  #{card_index}", font=label_fnt, fill=NAVY)

    # Thin right-edge accent line
    draw.rectangle([CARD_W - 14, top_h, CARD_W, CARD_H - 72], fill=GREEN)

    # ------------------------------------------------------------------
    # Opening quotation mark
    # ------------------------------------------------------------------
    qm_fnt = _font(130, bold=True)
    draw.text((28, top_h - 12), "\u201C", font=qm_fnt, fill=GREEN)

    # ------------------------------------------------------------------
    # Quote text  (wrapped)
    # ------------------------------------------------------------------
    quote_text = quote.get("text", "")
    q_fnt = _font(33)
    max_w = CARD_W - 100   # leave side margins

    # Wrap by character width estimation (approx 40 chars per line at size 33)
    wrapped = textwrap.wrap(quote_text, width=42)

    y = top_h + 118
    line_h = 50
    for line in wrapped[:14]:          # max 14 lines
        draw.text((52, y), line, font=q_fnt, fill=WHITE)
        y += line_h

    # Closing quotation mark (smaller)
    close_fnt = _font(55, bold=True)
    draw.text((52, y + 4), "\u201D", font=close_fnt, fill=GREEN)

    # ------------------------------------------------------------------
    # Speaker attribution
    # ------------------------------------------------------------------
    speaker = quote.get("speaker", "")
    if speaker and speaker.lower() not in ("unknown", ""):
        attr_y = max(y + 68, CARD_H - 165)
        spk_fnt = _font(27, bold=True)
        draw.text((52, attr_y), f"\u2014  {speaker}", font=spk_fnt, fill=GREEN)

    # ------------------------------------------------------------------
    # Bottom bar
    # ------------------------------------------------------------------
    bottom_h = 72
    draw.rectangle([0, CARD_H - bottom_h, CARD_W, CARD_H], fill=GREEN)
    br_fnt = _font(21, bold=True)
    draw.text((32, CARD_H - bottom_h + 24), "HBS Africa Business Club", font=br_fnt, fill=NAVY)

    img.save(output_path, "PNG", optimize=True)
    return output_path


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def generate_quote_cards(analysis: dict, output_dir: str) -> list:
    """
    Generate PNG quote card images for all quotes in analysis.

    Returns:
        List of absolute paths to generated PNG files.
    """
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    paths = []
    for i, quote in enumerate(analysis.get("quotes", []), start=1):
        dest = str(out / f"quote_{i}.png")
        draw_quote_card(quote, dest, card_index=i)
        paths.append(dest)

    return paths
