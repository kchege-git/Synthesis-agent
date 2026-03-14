"""
Claude API analyzer: extracts structured takeaways and quotes from a transcript.
Uses claude-opus-4-6 with adaptive thinking for high-quality analysis.
"""

import json
import re
import anthropic

_client = None


def _get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from env
    return _client


SYSTEM_PROMPT = """You are an expert content analyst and communications strategist for the \
Harvard Business School Africa Business Club (HBS ABC). You specialise in extracting \
high-quality, MBA-level insights from panel discussions and fireside chats at business \
conferences, and packaging them into compelling social-media-ready content.

Your analysis should be:
- Precise and intellectually rigorous (HBS standard)
- Warm and engaging (suitable for LinkedIn and Instagram)
- Accurately attributed to speakers where possible
- Immediately actionable for the reader"""


def analyze_transcript(
    transcript: str,
    panel_name: str = "",
    speaker_names: str = "",
    event_name: str = "HBS Africa Business Conference",
    event_date: str = "",
) -> dict:
    """
    Analyse a transcript and return structured content.

    Returns a dict with keys:
        social_media_intro  – string
        takeaways           – list of takeaway dicts
        quotes              – list of quote dicts
    """
    context_lines = [
        f"Panel/Session: {panel_name or 'Business Panel Discussion'}",
        f"Speakers: {speaker_names or 'Panel speakers (names may appear in transcript)'}",
        f"Event: {event_name}",
    ]
    if event_date:
        context_lines.append(f"Date: {event_date}")
    context = "\n".join(context_lines)

    prompt = f"""\
Analyse the following transcript from a panel discussion at {event_name} and extract \
structured content for social media slides (LinkedIn & Instagram).

CONTEXT:
{context}

TRANSCRIPT:
{transcript}

Return a single JSON object with EXACTLY this structure — no markdown, no extra text:

{{
  "social_media_intro": "A compelling 2–3 sentence caption for LinkedIn/Instagram. \
Introduce the speaker(s) and their credentials, mention the event, and set up the \
takeaways. Write in third person. Use the style of the example: 'This week, the HBS \
Africa Business Club was privileged to host [Name] for a [fireside chat / panel] on \
[topic]. [Name] is [title/role] with a career spanning [brief bio]. Below are a few \
takeaways from the conversation:'",

  "takeaways": [
    {{
      "number": 1,
      "headline": "A punchy, memorable headline capturing the core insight (max 15 words)",
      "sub_bullets": [
        {{
          "bold_phrase": "The opening bold phrase (4–8 words, ends without a period — \
the period goes at the end of the full sentence in the body)",
          "body": "The explanatory sentence(s) that follow the bold phrase. \
1–2 sentences max. Can reference specific examples from the discussion."
        }}
      ]
    }}
  ],

  "quotes": [
    {{
      "text": "Verbatim quote from the transcript. Aim for 15–50 words — \
short enough to read on a screen, long enough to carry meaning.",
      "speaker": "Speaker name, or 'Unknown' if not identifiable",
      "rationale": "One sentence explaining why this quote was selected \
(insightful / memorable / actionable / quotable)"
    }}
  ]
}}

RULES:
1. Extract 3–5 key takeaways (aim for 3–4 substantive ones)
2. Each takeaway should have 2–4 sub-bullets
3. Select EXACTLY 3 top quotes — choose the most insightful, memorable, \
and screen-worthy passages
4. Quotes must be short enough to fit on a screen (15–50 words ideal)
5. Make headlines punchy — avoid generic phrases like "Importance of X"
6. If speaker names are visible in the transcript, use them in the social_media_intro \
and for quote attribution
7. Return ONLY valid JSON"""

    client = _get_client()
    response = client.messages.create(
        model="claude-opus-4-6",
        max_tokens=4096,
        thinking={"type": "adaptive"},
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )

    # Extract text block (thinking blocks come first)
    text_response = ""
    for block in response.content:
        if block.type == "text":
            text_response = block.text
            break

    return _parse_json_response(text_response)


def _parse_json_response(text: str) -> dict:
    """Parse Claude's JSON response, stripping markdown fences if present."""
    text = text.strip()
    # Strip markdown code fences
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    text = text.strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Try to find the JSON object inside the response
        match = re.search(r"\{[\s\S]*\}", text)
        if match:
            return json.loads(match.group())
        raise ValueError(
            "Claude did not return valid JSON. Raw response:\n" + text[:500]
        )
