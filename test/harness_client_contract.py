"""Exercise the real Python client and Node service with a loopback Messages provider."""
import base64
import importlib.util
import json
import os
from pathlib import Path
import socket
import struct
import subprocess
import threading
import time
import unittest
import zlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch

import requests

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("harness_client", ROOT / "dojo_plugin/agent_runtime/upstream_turn.py")
client = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(client)
CLASSROOM_SPEC = importlib.util.spec_from_file_location(
    "classroom_client", ROOT / "dojo_plugin/agent_runtime/classroom_requests.py",
)
classroom_client = importlib.util.module_from_spec(CLASSROOM_SPEC)
CLASSROOM_SPEC.loader.exec_module(classroom_client)


def synthetic_png():
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

    header = struct.pack(">IIBBBBB", 16, 16, 8, 2, 0, 0, 0)
    rows = (b"\0" + b"\xff\x00\x00" * 16) * 16
    image = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(rows)) + chunk(b"IEND", b"")
    return base64.b64encode(image).decode("ascii")


class ModelFixture(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_POST(self):
        payload = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        self.server.requests.append((self.path, self.headers.get("x-api-key"), payload))
        reply = "教学回执"
        if "publishedClassroomDeck" in payload["messages"][0]["content"][0].get("text", ""):
            deck = json.loads(payload["messages"][0]["content"][0]["text"])["publishedClassroomDeck"]
            reply = json.dumps({"answer": "请确认", "proposal": {
                "tool": "classroom.prepare", "arguments": {"artifactId": deck["artifactId"]},
            }}, ensure_ascii=False)
        events = [
            ("message_start", {"message": {"id": "fixture", "model": "fixture", "usage": {"input_tokens": 5}}}),
            ("content_block_start", {"index": 0, "content_block": {"type": "text", "text": ""}}),
            ("content_block_delta", {"index": 0, "delta": {"type": "text_delta", "text": reply}}),
            ("content_block_stop", {"index": 0}),
            ("message_delta", {"delta": {"stop_reason": "end_turn"}, "usage": {"output_tokens": 3}}),
            ("message_stop", {}),
        ]
        if any(tool.get("name") == "read_teaching_material" for tool in payload.get("tools", [])):
            content = payload["messages"][-1]["content"]
            if not any(block.get("type") == "tool_result" for block in content):
                events[1:-1] = [
                    ("content_block_start", {"index": 0, "content_block": {
                        "type": "tool_use", "id": "read-second", "name": "read_teaching_material", "input": {},
                    }}),
                    ("content_block_delta", {"index": 0, "delta": {
                        "type": "input_json_delta", "partial_json": '{"index":2}',
                    }}),
                    ("content_block_stop", {"index": 0}),
                    ("message_delta", {"delta": {"stop_reason": "tool_use"}, "usage": {"output_tokens": 3}}),
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
                      DEEPSEEK_API_KEY="fixture-provider", DEEPSEEK_MODEL="fixture", DEEPSEEK_IMAGE_INPUT="true",
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
                headers = {"Authorization": "Bearer fixture-service"}
                body = {"messages": [{"role": "user", "content": "描述这张教学色卡"}],
                        "images": [{"mediaType": "image/png", "data": synthetic_png()}]}
                self.assertEqual(requests.post(url + "/v1/turn", json=body, headers=headers, timeout=4).status_code, 400)
                image_url = url + "/v1/teaching-image-turn"
                with patch.dict(os.environ, HARNESS_INTERNAL_URL=url, HARNESS_SERVICE_SECRET="fixture-service",
                                DOJO_AI_ENABLED="true", HARNESS_DEEPSEEK_IMAGE_INPUT="true"):
                    response = client.invoke_teaching_image_turn({"messages": body["messages"]}, body["images"][0])
                self.assertEqual(response["text"], "教学回执")
                self.assertEqual([r[0] for r in model.requests], ["/v1/messages", "/v1/messages"])
                blocks = model.requests[-1][2]["messages"][0]["content"]
                pictures = [b["source"] for b in blocks if b["type"] == "image"]
                self.assertEqual([p["type"] for p in pictures], ["base64"], [b["type"] for b in blocks])
                body["images"][0] = {"mediaType": "image/jpeg", "data": "Tm90IGFuIGltYWdl"}
                invalid = requests.post(image_url, json=body, headers=headers, timeout=5)
                self.assertEqual(invalid.status_code, 400, invalid.text)
                self.assertEqual(len(model.requests), 2)
                pin = {"artifactId": "fixture-deck", "title": "叶片观察", "expectedRevision": 2, "contentHash": "f" * 64}
                with patch.dict(os.environ, HARNESS_INTERNAL_URL=url, HARNESS_SERVICE_SECRET="fixture-service"):
                    turn = client.invoke_turn(classroom_client.classroom_request_body(pin, client.request_body))
                proposed = classroom_client.classroom_proposal_result(pin, client.result_object(turn["text"])["proposal"])
                self.assertEqual(proposed["toolProposals"][0]["arguments"], {"artifactId": "fixture-deck"})
                self.assertEqual(turn["usage"]["total_tokens"], 8)
                self.assertEqual(json.loads(model.requests[-1][2]["messages"][0]["content"][0]["text"]), {
                    "publishedClassroomDeck": {"artifactId": "selected-deck"},
                })
                probe = [os.getenv("HARNESS_NODE", "node"), str(ROOT / "ops/staging/check-harness.mjs")]
                denied = subprocess.run(probe, env={**config, "HARNESS_SERVICE_SECRET": "wrong"},
                                        capture_output=True, text=True, timeout=15)
                self.assertNotEqual(denied.returncode, 0)
                self.assertEqual(len(model.requests), 3)
                ready = subprocess.run(probe, env=config, check=True, capture_output=True, text=True, timeout=15)
                self.assertEqual(json.loads(ready.stdout), {
                    "ready": True, "model": "fixture", "totalTokens": 8, "unauthenticatedStatus": 401,
                })
                self.assertEqual(len(model.requests), 4)
                with self.subTest("only the requested excerpt crosses the provider boundary"):
                    self.check_material_read(url, model.requests)
            finally:
                service.terminate()
                try:
                    service.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    service.kill()

    def check_material_read(self, url, requests_seen):
        first = "第一组样本有九片叶子。"
        second = "第二组样本有六片叶子。"
        body = {"messages": [{"role": "user", "content": "只根据第二份材料回答叶片有几片。"}],
                "materials": [{"text": first}, {"text": second}]}
        start = len(requests_seen)
        with patch.dict(os.environ, HARNESS_INTERNAL_URL=url, HARNESS_SERVICE_SECRET="fixture-service",
                        DOJO_AI_ENABLED="true", HARNESS_DEEPSEEK_MODEL="fixture"):
            result = client.invoke_teaching_material_turn(body)
        calls = requests_seen[start:]
        self.assertEqual([(path, key) for path, key, _ in calls], [("/v1/messages", "fixture-provider")] * 2)
        self.assertEqual(result["materialReads"], [2])
        self.assertEqual(result["usage"]["prompt_tokens"], 10)
        self.assertEqual(result["usage"]["completion_tokens"], 6)
        self.assertEqual(result["usage"]["total_tokens"], 16)
        self.assertEqual([tool["name"] for tool in calls[0][2]["tools"]], ["read_teaching_material"])
        initial = json.dumps(calls[0][2], ensure_ascii=False)
        self.assertNotIn(first, initial)
        self.assertNotIn(second, initial)
        followup = calls[1][2]
        self.assertNotIn(first, json.dumps(followup, ensure_ascii=False))
        blocks = followup["messages"][-1]["content"]
        receipts = [block for block in blocks if block["type"] == "tool_result"]
        self.assertEqual(len(receipts), 1)
        self.assertEqual(receipts[0]["tool_use_id"], "read-second")
        self.assertIn(second, json.dumps(receipts[0]["content"], ensure_ascii=False))


if __name__ == "__main__":
    unittest.main()
