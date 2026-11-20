import json
import mimetypes
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from ask_openai import InvalidKeyError, KeygenError, MissingKeyError, stream_openai

ROOT = Path(__file__).parent
PORT = 3000


class AppHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        if self.path != "/api/sleep-coach":
            super().log_message(format, *args)

    def send_json(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_event(self, payload):
        body = f"data: {json.dumps(payload)}\n\n".encode()
        self.wfile.write(body)
        self.wfile.flush()

    def do_POST(self):
        if self.path != "/api/sleep-coach":
            self.send_json(404, {"error": "Not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            if length > 8000:
                raise ValueError("body-too-large")
            body = json.loads(self.rfile.read(length) or "{}")
            concern = body.get("concern", "").strip()
            extra = body.get("extra", "").strip()
            if not concern or len(concern) > 500 or len(extra) > 800:
                self.send_json(400, {"error": "Please choose a sleep concern first."})
                return
            message = f"The person chose this sleep concern: {concern}"
            if extra:
                message += f"\nTheir sleep report: {extra}"
            message += "\nUse the sleep report as the main context. Please give the one-time guided plan now, using fresh wording that fits this concern. Avoid repeating the phrase wind down."
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.end_headers()
            try:
                for delta in stream_openai(message):
                    self.send_event({"type": "delta", "text": delta})
                self.send_event({"type": "done"})
            except MissingKeyError:
                self.send_event({"type": "error", "error": "missing-key"})
            except InvalidKeyError:
                self.send_event({"type": "error", "error": {"message": "OpenAI rejected the AI key.", "fix": "Replace the MindDo key or token, then try again."}})
            except KeygenError as error:
                print(error.fix)
                self.send_event({"type": "error", "error": {"message": error.message, "fix": error.fix}})
            except Exception:
                self.send_event({"type": "error", "error": {"message": "The sleep guide could not answer right now.", "fix": "Check the MindDo service and internet connection, then try again."}})
        except MissingKeyError:
            self.send_json(502, {"error": "missing-key"})
        except KeygenError as error:
            print(error.fix)
            self.send_json(502, {"error": {"message": error.message, "fix": error.fix}})
        except Exception:
            self.send_json(502, {"error": "unavailable"})

    def do_GET(self):
        requested = urlparse(self.path).path
        if requested == "/":
            requested = "/index.html"
        file_path = (ROOT / "public" / requested.lstrip("/")).resolve()
        public_root = (ROOT / "public").resolve()
        if public_root not in file_path.parents or not file_path.is_file():
            self.send_error(404, "Not found")
            return
        body = file_path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mimetypes.guess_type(file_path.name)[0] or "application/octet-stream")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", PORT), AppHandler)
    print(f"Gilgameshthesleeper.com is running at http://localhost:{PORT}")
    server.serve_forever()
