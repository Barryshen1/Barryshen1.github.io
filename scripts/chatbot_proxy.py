"""
Lightweight HTTP proxy for the on-site chatbot.

Usage (local):
  export GOOGLE_CLOUD_API_KEY="your_api_key"
  python scripts/chatbot_proxy.py --host 0.0.0.0 --port 8080

Deploy this behind HTTPS (for example on Cloud Run or Render) and point
`_config.yml -> chatbot.endpoint` at https://your-service/api/chat.
"""

from __future__ import annotations

import argparse
import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import List

from google import genai
from google.genai import types


def load_local_env() -> None:
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if not env_path.exists():
        return

    try:
        from dotenv import load_dotenv
    except ImportError:
        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip("\"'"))
    else:
        load_dotenv(env_path, override=False)


load_local_env()

MODEL_NAME = os.getenv("CHATBOT_MODEL", "gemini-2.5-pro")
LOCATION = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")
PROJECT = os.getenv("GOOGLE_CLOUD_PROJECT", None)
PERSONA_PROMPT = os.getenv(
    "CHATBOT_SYSTEM_PROMPT",
    (
        "You are Yifei Shen's research assistant. Always say you are Yifei Shen's research assistant "
        "(never a generic model, never 'trained by Google'). If asked whether you are Yifei's bot/assistant, "
        "answer yes and offer help on his work. "
        "About Yifei: incoming PhD student in Computer and Information Science and Engineering at the University of Florida, starting Fall 2026, advised by Professor Zhe Jiang; "
        "MSEE from the University of Washington Department of Electrical and Computer Engineering, based in Seattle, WA / Gainesville, FL; "
        "BEng from Xi'an Jiaotong-Liverpool University and the University of Liverpool (2024); "
        "during his MSEE at UW, he worked on a UW-Lenovo Research project with Professor Radha Poovendran and Dr. Yan Li, and interned at Yale NLP Lab with Professor Arman Cohan and Yilun Zhao; "
        "interests: multimodal foundation models, LLM agents, and AI for healthcare. "
        "Be concise, factual, and helpful; if unsure, say you don't know. "
        "Focus on Yifei's work, research, publications, teaching, and related topics."
    ),
)


def build_client() -> genai.Client:
    api_key = (
        os.environ.get("GOOGLE_API_KEY")
        or os.environ.get("GEMINI_API_KEY")
        or os.environ.get("GOOGLE_CLOUD_API_KEY")
    )
    # Prefer direct API key auth when present; otherwise fall back to Vertex AI.
    if api_key:
        return genai.Client(api_key=api_key)
    if PROJECT:
        return genai.Client(vertexai=True, project=PROJECT, location=LOCATION)
    raise RuntimeError(
        "Missing Google AI credentials. Set GOOGLE_API_KEY (or GOOGLE_CLOUD_API_KEY), "
        "or set GOOGLE_CLOUD_PROJECT with ADC/service-account auth."
    )


def convert_messages(messages: List[dict]) -> List[types.Content]:
    contents: List[types.Content] = [
        types.Content(
            role="user",
            parts=[types.Part(text=PERSONA_PROMPT)],
        )
    ]
    for message in messages:
        text = str(
            message.get("content") or message.get("text") or ""
        ).strip()
        if not text:
            continue
        role = "user" if message.get("role") == "user" else "model"
        contents.append(
            types.Content(
                role=role,
                parts=[types.Part(text=text)],
            )
        )
    return contents


class ChatHandler(BaseHTTPRequestHandler):
    client: genai.Client | None = None

    def _set_headers(self, status_code: int = 200) -> None:
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "OPTIONS, POST")
        self.end_headers()

    def log_message(self, fmt: str, *args) -> None:  # noqa: ARG002
        # Silence default stdout logging to keep Cloud Run logs cleaner.
        return

    def do_OPTIONS(self) -> None:
        self._set_headers(204)

    def do_POST(self) -> None:
        if self.path.rstrip("/") != "/api/chat":
            self._set_headers(404)
            self.wfile.write(b'{"error":"Not Found"}')
            return

        length = int(self.headers.get("content-length", 0))
        body = self.rfile.read(length or 0)

        try:
            payload = json.loads(body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            self._set_headers(400)
            self.wfile.write(b'{"error":"Invalid JSON body."}')
            return

        messages = payload.get("messages") or []
        if not isinstance(messages, list) or not messages:
            self._set_headers(400)
            self.wfile.write(b'{"error":"Provide a non-empty messages array."}')
            return

        try:
            contents = convert_messages(messages)
            if not contents:
                raise ValueError("No usable message content found.")

            if ChatHandler.client is None:
                ChatHandler.client = build_client()

            response = ChatHandler.client.models.generate_content(
                model=MODEL_NAME,
                contents=contents,
                config=types.GenerateContentConfig(
                    temperature=float(os.getenv("CHATBOT_TEMPERATURE", "0.3")),
                    top_p=float(os.getenv("CHATBOT_TOP_P", "0.95")),
                    max_output_tokens=int(os.getenv("CHATBOT_MAX_TOKENS", "1024")),
                    safety_settings=[
                        types.SafetySetting(
                            category="HARM_CATEGORY_HATE_SPEECH",
                            threshold="OFF",
                        ),
                        types.SafetySetting(
                            category="HARM_CATEGORY_DANGEROUS_CONTENT",
                            threshold="OFF",
                        ),
                        types.SafetySetting(
                            category="HARM_CATEGORY_SEXUALLY_EXPLICIT",
                            threshold="OFF",
                        ),
                        types.SafetySetting(
                            category="HARM_CATEGORY_HARASSMENT",
                            threshold="OFF",
                        ),
                    ],
                    tools=[types.Tool(google_search=types.GoogleSearch())],
                    thinking_config=types.ThinkingConfig(thinking_budget=-1),
                ),
            )

            reply_text = response.text
            if not reply_text and response.candidates:
                parts = []
                for cand in response.candidates:
                    if getattr(cand, "content", None):
                        for part in getattr(cand.content, "parts", []) or []:
                            text_val = getattr(part, "text", None)
                            if text_val:
                                parts.append(text_val)
                    if parts:
                        break
                reply_text = "\n".join(parts).strip()
            if not reply_text:
                raise RuntimeError("Model returned an empty response.")

            identity_prefix = "I am Yifei Shen's research assistant."
            if identity_prefix.lower() not in (reply_text or "").lower():
                reply_text = f"{identity_prefix} {reply_text}"

            self._set_headers(200)
            self.wfile.write(json.dumps({"reply": reply_text}).encode("utf-8"))
        except Exception as exc:  # noqa: BLE001
            self._set_headers(500)
            self.wfile.write(json.dumps({"error": str(exc)}).encode("utf-8"))


def serve(host: str, port: int) -> None:
    with HTTPServer((host, port), ChatHandler) as httpd:
        print(f"Chatbot proxy listening on http://{host}:{port}/api/chat")
        httpd.serve_forever()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Vertex AI chatbot proxy.")
    parser.add_argument(
        "--host",
        default=os.getenv("CHATBOT_HOST", "127.0.0.1"),
        help="Host to bind (default: 127.0.0.1)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.getenv("CHATBOT_PORT", "8080")),
        help="Port to bind (default: 8080)",
    )
    args = parser.parse_args()
    serve(args.host, args.port)
