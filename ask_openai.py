import json
import re
import ssl
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).parent
SSL_CONTEXT = ssl.create_default_context()
if Path("/etc/ssl/cert.pem").is_file():
    SSL_CONTEXT.load_verify_locations("/etc/ssl/cert.pem")


class MissingKeyError(Exception):
    pass


def read_env():
    values = {}
    try:
        for raw_line in (ROOT / ".env").read_text().splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            match = re.match(r"^(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$", line, re.I)
            if not match:
                continue
            value = match.group(2).strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                value = value[1:-1]
            values[match.group(1)] = value
    except OSError:
        pass
    return values


def brief_instructions():
    brief = (ROOT / "BRIEF.md").read_text()
    marker = "## My AI’s instructions"
    if marker not in brief:
        return brief
    section = brief.split(marker, 1)[1]
    return f"{marker}{section.split('\\n## ', 1)[0]}".strip()


def model_from_notes():
    notes = (ROOT / "NOTES.md").read_text()
    match = re.search(r"Model with [^:]+:\s*`([^`]+)`", notes, re.I)
    return match.group(1) if match else "gpt-5.6-luna"


def openai_request(user_message, stream=False):
    api_key = read_env().get("OPENAI_API_KEY")
    if not api_key or api_key == "paste-your-key-here":
        raise MissingKeyError()

    instructions = f"""{brief_instructions()}

Safety additions for this prototype:
- Give gentle, practical sleep guidance for stress and habits.
- Do not diagnose, prescribe medication, or make promises.
- If someone mentions danger, self-harm, severe symptoms, or a medical emergency, tell them to contact a trusted adult or qualified healthcare professional right away.
- Keep the response easy for an elementary student to understand.
- Make one short plan with a wind-down step, a calming step, and a next step for tomorrow.
- Mention that this is educational support, not medical care."""

    payload = {
        "model": model_from_notes(),
        "reasoning": {"effort": "none"},
        "instructions": instructions,
        "input": user_message,
        "tools": [{"type": "web_search"}],
        "text": {"verbosity": "low"},
        "max_output_tokens": 320,
        "stream": stream,
    }
    request = urllib.request.Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
        method="POST",
    )
    try:
        return urllib.request.urlopen(request, timeout=75, context=SSL_CONTEXT)
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as error:
        raise RuntimeError("unavailable") from error


def ask_openai(user_message):
    with openai_request(user_message) as response:
        data = json.load(response)

    answer = data.get("output_text", "").strip()
    if not answer:
        pieces = []
        for item in data.get("output", []):
            for content in item.get("content", []):
                if content.get("type") == "output_text" and content.get("text"):
                    pieces.append(content["text"])
        answer = "\n".join(pieces).strip()
    if not answer:
        raise RuntimeError("empty-response")
    return answer


def stream_openai(user_message):
    with openai_request(user_message, stream=True) as response:
        for raw_line in response:
            line = raw_line.decode("utf-8").strip()
            if not line.startswith("data:"):
                continue
            raw_event = line[5:].strip()
            if raw_event == "[DONE]":
                return
            try:
                event = json.loads(raw_event)
            except json.JSONDecodeError:
                continue
            if event.get("type") == "response.output_text.delta":
                delta = event.get("delta", "")
                if delta:
                    yield delta
            if event.get("type") == "error":
                raise RuntimeError("unavailable")
