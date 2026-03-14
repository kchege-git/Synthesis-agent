"""
Quote card generator: produces 1080×1080 PNG images with HBS ABC branding.
"""

import os
import textwrap
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont  # type: ignore

NAVY  = (27,  42,  74)
GREEN = (157, 197,  40)
WHITE = (255, 255, 255)

CARD_W = 1080
CARD_H = 1080

_FONT_CACHE: dict = {}


def _font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    key = (size, bold)
    if key in _FONT_CACHE:
        return _FONT_CACHE[key]

    candidates = (
        [
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        ] if bold else [
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        ]
    )

    for path in candidates:
        if os.path.exists(path):
            try:
                fnt = ImageFont.truetype(path, size)
                _FONT_CACHE[key] = fnt
                return fnt
            except Exception:
                continue

    fnt = ImageFont.load_default()
    _FONT_CACHE[key] = fnt
    return fnt


def draw_quote_card(quote: dict, output_path: str, card_index: int = 1) -> str:
    img = Image.new("RGB", (CARD_W, CARD_H), color=NAVY)
    draw = ImageDraw.Draw(img)

    # Top bar
    top_h = 68
    draw.rectangle([0, 0, CARD_W, top_h], fill=GREEN)
    draw.text((32, 22), f"MEMORABLE QUOTE  #{card_index}",
              font=_font(20, bold=True), fill=NAVY)

    # Right-edge accent
    draw.rectangle([CARD_W - 14, top_h, CARD_W, CARD_H - 72], fill=GREEN)

    # Opening quotation mark
    draw.text((28, top_h - 12), "\u201C", font=_font(130, bold=True), fill=GREEN)

    # Quote text
    quote_text = quote.get("text", "")
    wrapped = textwrap.wrap(quote_text, width=42)
    y = top_h + 118
    for line in wrapped[:14]:
        draw.text((52, y), line, font=_font(33), fill=WHITE)
        y += 50

    draw.text((52, y + 4), "\u201D", font=_font(55, bold=True), fill=GREEN)

    # Speaker attribution
    speaker = quote.get("speaker", "")
    if speaker and speaker.lower() not in ("unknown", ""):
        attr_y = max(y + 68, CARD_H - 165)
        draw.text((52, attr_y), f"\u2014  {speaker}",
                  font=_font(27, bold=True), fill=GREEN)

    # Bottom bar
    bottom_h = 72
    draw.rectangle([0, CARD_H - bottom_h, CARD_W, CARD_H], fill=GREEN)
    draw.text((32, CARD_H - bottom_h + 24), "HBS Africa Business Club",
              font=_font(21, bold=True), fill=NAVY)

    img.save(output_path, "PNG", optimize=True)
    return output_path


def generate_quote_cards(analysis: dict, output_dir: str) -> list:
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    paths = []
    for i, quote in enumerate(analysis.get("quotes", []), start=1):
        dest = str(out / f"quote_{i}.png")
        draw_quote_card(quote, dest, card_index=i)
        paths.append(dest)

    return paths
