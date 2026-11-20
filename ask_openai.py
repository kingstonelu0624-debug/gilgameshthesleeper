import json
import re
import shutil
import subprocess
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


class InvalidKeyError(Exception):
    pass


class KeygenError(Exception):
    def __init__(self, message, fix):
        super().__init__(message)
        self.message = message
        self.fix = fix


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
    api_key = get_key_from_minddo()

    instructions = f"""{brief_instructions()}

Safety additions for this prototype:
- Give gentle, practical sleep guidance for stress and habits.
- Do not diagnose, prescribe medication, or make promises.
- If someone mentions danger, self-harm, severe symptoms, or a medical emergency, tell them to contact a trusted adult or qualified healthcare professional right away.
- Keep the response easy for an elementary student to understand.
- Make one short plan with a wind-down step, a calming step, and a next step for tomorrow.
- Use fresh, concern-specific wording in every answer. Do not repeatedly use the phrase “wind down” or “wind-down”; vary naturally with phrases such as “settle,” “ease into rest,” “slow your thoughts,” or “get ready for sleep.”
- Do not begin every answer with the same sentence or use the same step names every time.
- Avoid contractions and possessive forms ending in “'s” or “’s” in the answer. Use full wording such as “it is” and “a person” instead.
- Return plain text only. Do not use Markdown, asterisks, bold text, headings, or code blocks. Never include the characters `*` in the answer.
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
    except urllib.error.HTTPError as error:
        if error.code == 401:
            try:
                replacement = get_key_from_minddo(force=True)
                retry = urllib.request.Request(
                    "https://api.openai.com/v1/responses",
                    data=json.dumps(payload).encode(),
                    headers={"Content-Type": "application/json", "Authorization": f"Bearer {replacement}"},
                    method="POST",
                )
                return urllib.request.urlopen(retry, timeout=75, context=SSL_CONTEXT)
            except KeygenError as keygen_error:
                raise keygen_error from error
            except urllib.error.HTTPError as retry_error:
                if retry_error.code == 401:
                    raise InvalidKeyError() from retry_error
                raise RuntimeError("unavailable") from retry_error
        raise RuntimeError("unavailable") from error
    except (urllib.error.URLError, TimeoutError) as error:
        raise RuntimeError("unavailable") from error


def get_key_from_minddo(force=False):
    node = shutil.which("node")
    if not node:
        raise KeygenError("This computer needs Node.js to get the AI key securely.", "Install Node.js, then start the project again.")
    try:
        command = [node, str(ROOT / "getKey.mjs")]
        if force:
            command.append("--force")
        result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, timeout=20, check=False)
    except (OSError, subprocess.TimeoutExpired) as error:
        raise KeygenError("The AI key service took too long to answer.", "Check the MindDo service and internet connection, then try again.") from error
    if result.returncode != 0:
        try: details = json.loads(result.stderr or "{}")
        except json.JSONDecodeError: details = {}
        raise KeygenError(details.get("message", "The AI key service could not provide a key."), details.get("fix", "Check the MindDo values in .env."))
    try:
        details = json.loads(result.stdout)
        api_key = details["apiKey"]
    except (json.JSONDecodeError, KeyError) as error:
        raise KeygenError("The AI key service returned an unexpected reply.", "Check the MindDo service response and try again.") from error
    if not api_key:
        raise KeygenError("The AI key service returned an empty key.", "Check the MindDo service configuration.")
    return api_key


def ask_openai(user_message):
    with openai_request(user_message) as response:
        data = json.load(response)

    answer = data.get("output_text", "").replace("*", "").strip()
    if not answer:
        pieces = []
        for item in data.get("output", []):
            for content in item.get("content", []):
                if content.get("type") == "output_text" and content.get("text"):
                    pieces.append(content["text"])
        answer = "\n".join(pieces).replace("*", "").strip()
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
                delta = event.get("delta", "").replace("*", "")
                if delta:
                    yield delta
            if event.get("type") == "error":
                raise RuntimeError("unavailable")
