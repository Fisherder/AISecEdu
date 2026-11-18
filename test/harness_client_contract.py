"""Exercise the real Python client and Node service with a loopback Messages provider."""
import importlib.util
import json
import os
from pathlib import Path
import socket
import subprocess
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch

import requests

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("harness_client", ROOT / "dojo_plugin/agent_runtime/upstream_turn.py")
client = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(client)


class ModelFixture(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_POST(self):
        payload = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        self.server.requests.append((self.path, self.headers.get("x-api-key"), payload))
        events = [
            ("message_start", {"message": {"id": "fixture", "model": "fixture", "usage": {"input_tokens": 5}}}),
            ("content_block_start", {"index": 0, "content_block": {"type": "text", "text": ""}}),
            ("content_block_delta", {"index": 0, "delta": {"type": "text_delta", "text": "教学回执"}}),
            ("content_block_stop", {"index": 0}),
            ("message_delta", {"delta": {"stop_reason": "end_turn"}, "usage": {"output_tokens": 3}}),
            ("message_stop", {}),
        ]
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.end_headers()
        for kind, data in events:
            frame = json.dumps({"type": kind, **data}, ensure_ascii=False)
            self.wfile.write(f"event: {kind}\ndata: {frame}\n\n".encode())


class HarnessClientContract(unittest.TestCase):
    def test_teaching_context_and_usage_cross_both_processes(self):
        model = ThreadingHTTPServer(("127.0.0.1", 0), ModelFixture)
        model.requests = []
        self.addCleanup(model.server_close)
        threading.Thread(target=model.serve_forever, daemon=True).start()
        self.addCleanup(model.shutdown)
        with socket.socket() as reservation:
            reservation.bind(("127.0.0.1", 0))
            port = reservation.getsockname()[1]
        url = f"http://127.0.0.1:{port}"
        config = dict(PATH=os.environ["PATH"], PORT=str(port), HARNESS_SERVICE_SECRET="fixture-service",
                      DEEPSEEK_API_KEY="fixture-provider", DEEPSEEK_MODEL="fixture",
                      DEEPSEEK_BASE_URL=f"http://127.0.0.1:{model.server_port}")
        with subprocess.Popen([os.getenv("HARNESS_NODE", "node"), "server.mjs"], env=config,
                              cwd=ROOT / "services/deepseek-harness") as service:
            try:
                deadline = time.monotonic() + 10
                while time.monotonic() < deadline and service.poll() is None:
                    try:
                        if requests.get(url + "/health", timeout=.25).ok:
                            break
                    except requests.ConnectionError:
                        pass
                    time.sleep(.05)
                else:
                    self.fail("The teaching service did not start")
                context = {"request": "解释本课学习目标", "scope": "合成课程"}
                with patch.dict(os.environ, HARNESS_INTERNAL_URL=url, HARNESS_SERVICE_SECRET="fixture-service"):
                    reply = client.invoke_turn(client.request_body("教学助手", context))
                self.assertEqual(reply, {"text": "教学回执", "model": "fixture", "usage": {
                    "prompt_tokens": 5, "completion_tokens": 3, "total_tokens": 8}})
                self.assertEqual(len(model.requests), 1)
                path, key, payload = model.requests[0]
                self.assertEqual((path, key, payload["system"]), ("/v1/messages", "fixture-provider", "教学助手"))
                self.assertEqual(json.loads(payload["messages"][0]["content"][0]["text"]), context)
            finally:
                service.terminate()
                try:
                    service.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    service.kill()


if __name__ == "__main__":
    unittest.main()
