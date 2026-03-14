"""
Input processor: handles all transcript/audio input formats.
Supports: .txt, .srt, .json, .docx, and audio files via faster-whisper.
"""

import json
import re
from pathlib import Path

AUDIO_EXTENSIONS = {"mp3", "mp4", "wav", "m4a", "ogg", "flac", "webm", "aac", "opus", "wma"}


def process_input(file_path: str, file_type: str) -> str:
    fp = Path(file_path)
    ext = fp.suffix.lower().lstrip(".")

    if file_type in AUDIO_EXTENSIONS or ext in AUDIO_EXTENSIONS:
        return _transcribe_audio(fp)
    if file_type == "srt" or ext == "srt":
        return _parse_srt(fp)
    if file_type == "json" or ext == "json":
        return _parse_json(fp)
    if file_type in ("docx", "doc") or ext in ("docx", "doc"):
        return _parse_docx(fp)
    return fp.read_text(encoding="utf-8", errors="replace").strip()


# ---------------------------------------------------------------------------
# Audio transcription — faster-whisper (binary wheel, no build tools needed)
# ---------------------------------------------------------------------------

def _transcribe_audio(fp: Path) -> str:
    from faster_whisper import WhisperModel  # type: ignore
    model = WhisperModel("base", device="cpu", compute_type="int8")
    segments, _info = model.transcribe(str(fp), beam_size=5)
    return " ".join(seg.text.strip() for seg in segments)


# ---------------------------------------------------------------------------
# SRT parser
# ---------------------------------------------------------------------------

def _parse_srt(fp: Path) -> str:
    content = fp.read_text(encoding="utf-8", errors="replace")
    lines = []
    for line in content.splitlines():
        s = line.strip()
        if not s or s.isdigit() or "-->" in s:
            continue
        s = re.sub(r"<[^>]+>", "", s)
        s = re.sub(r"\{[^}]+\}", "", s)
        if s:
            lines.append(s)
    return " ".join(lines)


# ---------------------------------------------------------------------------
# JSON transcript parser
# ---------------------------------------------------------------------------

def _parse_json(fp: Path) -> str:
    with open(fp, encoding="utf-8") as fh:
        data = json.load(fh)

    if isinstance(data, list):
        return _join_segments(data)

    if isinstance(data, dict):
        if "segments" in data:
            return _join_segments(data["segments"])
        try:
            t = data["results"]["transcripts"][0]["transcript"]
            if t:
                return t
        except (KeyError, IndexError, TypeError):
            pass
        if "utterances" in data:
            return _join_segments(data["utterances"])
        if "text" in data:
            return str(data["text"]).strip()

    return json.dumps(data, ensure_ascii=False, indent=2)


def _join_segments(segments: list) -> str:
    parts = []
    for seg in segments:
        if not isinstance(seg, dict):
            continue
        text = seg.get("text", seg.get("transcript", "")).strip()
        if not text:
            continue
        speaker = seg.get("speaker", seg.get("speaker_label", "")).strip()
        parts.append(f"{speaker}: {text}" if speaker else text)
    return "\n".join(parts)


# ---------------------------------------------------------------------------
# DOCX parser
# ---------------------------------------------------------------------------

def _parse_docx(fp: Path) -> str:
    from docx import Document  # type: ignore
    doc = Document(str(fp))
    return "\n".join(p.text.strip() for p in doc.paragraphs if p.text.strip())
