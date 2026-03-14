"""
OpenAI analyzer: extracts structured takeaways and quotes from a transcript.
Uses gpt-4o-mini for cost-effective analysis.
"""

import json
import re
import openai
import os

_client = None


def _get_client(api_key: str = "") -> openai.OpenAI:
    global _client
    key = api_key or os.environ.get("OPENAI_API_KEY", "")
    # Return a fresh client when a per-request key is provided
    if api_key:
        return openai.OpenAI(api_key=key)
    if _client is None:
        _client = openai.OpenAI(api_key=key)
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
    api_key: str = "",
) -> dict:
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
takeaways. Write in third person.",

  "takeaways": [
    {{
      "number": 1,
      "headline": "A punchy, memorable headline capturing the core insight (max 15 words)",
      "sub_bullets": [
        {{
          "bold_phrase": "Opening bold phrase (4–8 words)",
          "body": "Explanatory sentence(s) that follow. 1–2 sentences max."
        }}
      ]
    }}
  ],

  "quotes": [
    {{
      "text": "Verbatim quote from the transcript. 15–50 words.",
      "speaker": "Speaker name, or 'Unknown' if not identifiable",
      "rationale": "One sentence explaining why this quote was selected"
    }}
  ]
}}

RULES:
1. Extract 3–5 key takeaways (aim for 3–4 substantive ones)
2. Each takeaway should have 2–4 sub-bullets
3. Select EXACTLY 3 top quotes — choose the most insightful, memorable, screen-worthy passages
4. Quotes must be short enough to fit on a screen (15–50 words ideal)
5. Make headlines punchy — avoid generic phrases like "Importance of X"
6. If speaker names are visible in the transcript, use them in the social_media_intro and for quote attribution
7. Return ONLY valid JSON"""

    client = _get_client(api_key)
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        max_tokens=4096,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
    )

    text_response = response.choices[0].message.content or ""
    return _parse_json_response(text_response)


def _parse_json_response(text: str) -> dict:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    text = text.strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", text)
        if match:
            return json.loads(match.group())
        raise ValueError("OpenAI did not return valid JSON. Raw response:\n" + text[:500])
