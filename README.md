# Panel Synthesis Agent
### HBS Africa Business Club — Social Content Generator

Turns a panel transcript or audio recording into polished social-ready assets:
- **PPTX slides** — title, takeaway slides (image overlays), quote slides
- **PNG quote cards** — 1080×1080 for campus screens
- **Social media caption** — ready-to-paste LinkedIn/Instagram text
- **Plain-text** takeaways and quotes

---

## Quick Start

### 1. Prerequisites

```bash
# Python 3.10+
pip install -r requirements.txt

# For audio transcription only (optional)
apt-get install ffmpeg          # Linux
# brew install ffmpeg           # macOS
```

### 2. Set API key

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

### 3. Run

```bash
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

Open **http://localhost:8000** in your browser.

---

## Supported Input Formats

| Format | Extension | Notes |
|--------|-----------|-------|
| Plain text | `.txt` | Raw transcript |
| SRT subtitles | `.srt` | Captions export |
| Timestamped JSON | `.json` | Whisper, AssemblyAI, AWS Transcribe |
| Word document | `.docx` | Speaker notes / transcription docs |
| Audio | `.mp3 .wav .m4a .ogg .flac .webm` | Auto-transcribed via Whisper (base model) |

---

## Output Bundle (ZIP)

```
panel_assets_<id>.zip
├── slides.pptx                 ← Full deck (10×10 square slides)
├── quote_cards/
│   ├── quote_1.png             ← 1080×1080 screen card
│   ├── quote_2.png
│   └── quote_3.png
├── social_media_caption.txt    ← LinkedIn/Instagram caption
├── takeaways.txt               ← Plain-text takeaways
└── quotes.txt                  ← Plain-text quotes
```

---

## Branding

Matches HBS Africa Business Club brand:
- **Navy** `#1B2A4A` · **Green** `#9DC528` · **Amber** `#C47329`
- Square 10″ × 10″ slides (export as PNG from PowerPoint for best results)

---

## Model

Uses **Claude Opus 4.6** with adaptive thinking for high-quality analysis.
