"""
Analyzer: extracts structured takeaways and quotes from a transcript.
Supports Anthropic (claude-haiku-4-5) and OpenAI (gpt-4o-mini).
If both keys are supplied, Anthropic is preferred.
"""

import json
import re
import os

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
    openai_api_key: str = "",
    anthropic_api_key: str = "",
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

    # Resolve keys — fall back to env vars for local/dev use
    ant_key = anthropic_api_key.strip() or os.environ.get("ANTHROPIC_API_KEY", "")
    oai_key = openai_api_key.strip() or os.environ.get("OPENAI_API_KEY", "")

    if ant_key:
        return _call_anthropic(ant_key, prompt)
    if oai_key:
        return _call_openai(oai_key, prompt)

    raise ValueError("No API key available. Provide an Anthropic or OpenAI key.")


def _call_anthropic(api_key: str, prompt: str) -> dict:
    import anthropic
    client = anthropic.Anthropic(api_key=api_key)
    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=4096,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )
    text = ""
    for block in response.content:
        if block.type == "text":
            text = block.text
            break
    return _parse_json_response(text)


def _call_openai(api_key: str, prompt: str) -> dict:
    import openai
    client = openai.OpenAI(api_key=api_key)
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        max_tokens=4096,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
    )
    text = response.choices[0].message.content or ""
    return _parse_json_response(text)


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
        raise ValueError("Model did not return valid JSON. Raw response:\n" + text[:500])
