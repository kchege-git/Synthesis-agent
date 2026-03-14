"""
Input processor: handles all transcript/audio input formats.
Supports: .txt, .srt, .json (timestamped), .docx, and audio files via Whisper.
"""

import json
import re
from pathlib import Path

AUDIO_EXTENSIONS = {"mp3", "mp4", "wav", "m4a", "ogg", "flac", "webm", "aac", "opus", "wma"}


def process_input(file_path: str, file_type: str) -> str:
    """
    Process an input file and return plain transcript text.

    Args:
        file_path: Absolute path to the file.
        file_type: One of 'audio', 'txt', 'srt', 'json', 'docx', or a raw
                   extension string (e.g. 'mp3', 'wav').

    Returns:
        Plain text transcript string.
    """
    fp = Path(file_path)
    ext = fp.suffix.lower().lstrip(".")

    # Normalise file_type
    if file_type in AUDIO_EXTENSIONS or ext in AUDIO_EXTENSIONS:
        return _transcribe_audio(fp)
    if file_type == "srt" or ext == "srt":
        return _parse_srt(fp)
    if file_type == "json" or ext == "json":
        return _parse_json(fp)
    if file_type in ("docx", "doc") or ext in ("docx", "doc"):
        return _parse_docx(fp)
    # Default: plain text
    return fp.read_text(encoding="utf-8", errors="replace").strip()


# ---------------------------------------------------------------------------
# Audio transcription
# ---------------------------------------------------------------------------

def _transcribe_audio(fp: Path) -> str:
    """Transcribe an audio file using OpenAI Whisper (local model)."""
    try:
        import whisper  # type: ignore
    except ImportError as exc:
        raise ImportError(
            "openai-whisper is required for audio files.\n"
            "Install: pip install openai-whisper\n"
            "Also install ffmpeg: apt-get install ffmpeg"
        ) from exc

    model = whisper.load_model("base")
    result = model.transcribe(str(fp))
    return result["text"].strip()


# ---------------------------------------------------------------------------
# SRT parser
# ---------------------------------------------------------------------------

def _parse_srt(fp: Path) -> str:
    """Extract dialogue text from an SRT subtitle file."""
    content = fp.read_text(encoding="utf-8", errors="replace")
    # Remove cue index lines (pure digits) and timestamp lines (contain '-->'),
    # then join remaining non-empty lines.
    lines = []
    for line in content.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.isdigit():
            continue
        if "-->" in stripped:
            continue
        # Strip HTML/SRT tags like <i>, </i>, {bold}, etc.
        stripped = re.sub(r"<[^>]+>", "", stripped)
        stripped = re.sub(r"\{[^}]+\}", "", stripped)
        if stripped:
            lines.append(stripped)
    return " ".join(lines)


# ---------------------------------------------------------------------------
# JSON transcript parser
# ---------------------------------------------------------------------------

def _parse_json(fp: Path) -> str:
    """
    Parse a JSON transcript.  Handles several common formats:
    - Array of segments with 'text' (and optional 'speaker') fields
    - Object with 'segments' list
    - Object with 'results.transcripts' (AWS Transcribe)
    - Object with 'utterances' list
    - Object with top-level 'text' string
    """
    with open(fp, encoding="utf-8") as fh:
        data = json.load(fh)

    if isinstance(data, list):
        return _join_segments(data)

    if isinstance(data, dict):
        # Whisper JSON
        if "segments" in data:
            return _join_segments(data["segments"])
        # AWS Transcribe
        try:
            transcript = data["results"]["transcripts"][0]["transcript"]
            if transcript:
                return transcript
        except (KeyError, IndexError, TypeError):
            pass
        # Assemblyai / generic 'utterances'
        if "utterances" in data:
            return _join_segments(data["utterances"])
        # Plain text field
        if "text" in data:
            return str(data["text"]).strip()

    # Fallback: dump the whole thing as text
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
        if speaker:
            parts.append(f"{speaker}: {text}")
        else:
            parts.append(text)
    return "\n".join(parts)


# ---------------------------------------------------------------------------
# DOCX parser
# ---------------------------------------------------------------------------

def _parse_docx(fp: Path) -> str:
    """Extract text from a Microsoft Word (.docx) file."""
    try:
        from docx import Document  # type: ignore
    except ImportError as exc:
        raise ImportError(
            "python-docx is required for .docx files.\n"
            "Install: pip install python-docx"
        ) from exc

    doc = Document(str(fp))
    paragraphs = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
    return "\n".join(paragraphs)
