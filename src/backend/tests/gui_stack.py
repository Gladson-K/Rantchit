"""
Full-stack GUI test harness: backend (uvicorn + SQLite + fakeredis),
static SPA server with /api reverse proxy, and a WebSocket relay that can
optionally rewrite public_key frames to emulate an active MITM attacker.
"""
import asyncio
import mimetypes
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

import fakeredis.aioredis
import uvicorn
import websockets

BACKEND_DIR = Path(__file__).resolve().parents[1]
FRONTEND_DIST = BACKEND_DIR.parent / "frontend" / "dist"


def _start_backend(db_path: str):
    """Import + patch the app inside the caller's loop, return (server_task, port, fake_redis)."""
    import sys
    os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{db_path}"
    os.environ["SECRET_KEY"] = "gui-test-secret-key"
    os.environ["ENABLE_DOCS"] = "false"
    os.environ["TRUST_PROXY_HEADERS"] = "false"
    os.environ["LOG_LEVEL"] = "WARNING"
    if str(BACKEND_DIR) not in sys.path:
        sys.path.insert(0, str(BACKEND_DIR))

    from app.main import app
    from app import endpoints

    fake = fakeredis.aioredis.FakeRedis(decode_responses=True)
    endpoints.rooms.redis_client = fake
    endpoints.ws.redis_client = fake
    endpoints.health.redis_client = fake

    return app, fake


class GUIStack:
    def __init__(self, name: str, rewrite_pubkeys: bool = False):
        self.name = name
        self.rewrite_pubkeys = rewrite_pubkeys
        self.http_port: int | None = None
        self.ws_port: int | None = None
        self._threads: list[threading.Thread] = []
        self._stop = threading.Event()
        self._loop: asyncio.AbstractEventLoop | None = None
        self._servers: list = []

    @property
    def base_url(self) -> str:
        return f"http://127.0.0.1:{self.http_port}"

    @property
    def ws_url(self) -> str:
        return f"ws://127.0.0.1:{self.ws_port}"

    def start(self) -> "GUIStack":
        ready = threading.Event()
        errors: list[Exception] = []

        def run_loop():
            try:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                self._loop = loop
                loop.run_until_complete(self._async_start(ready))
                loop.run_forever()
            except Exception as e:  # pragma: no cover
                errors.append(e)
                ready.set()
            finally:
                try:
                    self._loop and self._loop.run_until_complete(self._async_stop())
                except Exception:
                    pass

        t = threading.Thread(target=run_loop, daemon=True, name=f"gui-stack-{self.name}")
        t.start()
        self._threads.append(t)
        if not ready.wait(timeout=20):
            raise RuntimeError(f"GUI stack {self.name} failed to start (timeout)")
        if errors:
            raise RuntimeError(f"GUI stack {self.name} failed: {errors[0]!r}")
        return self

    async def _async_start(self, ready: threading.Event):
        import sys
        import tempfile
        db_path = os.path.join(tempfile.mkdtemp(prefix="rantchit-gui-"), "gui.db")
        app, fake = _start_backend(db_path)

        backend_cfg = uvicorn.Config(app, host="127.0.0.1", port=0, log_level="warning", lifespan="on")
        backend_srv = uvicorn.Server(backend_cfg)
        backend_task = asyncio.ensure_future(backend_srv.serve())
        self._servers.append(("uvicorn", backend_task, backend_srv))
        while not backend_srv.started:
            await asyncio.sleep(0.01)
        while not (backend_srv.servers and backend_srv.servers[0].sockets):
            await asyncio.sleep(0.01)
        self.backend_port = backend_srv.servers[0].sockets[0].getsockname()[1]

        # WebSocket relay (optionally malicious)
        self.ws_port = self._free_port()
        relay_srv = await websockets.serve(
            self._ws_proxy_handler, "127.0.0.1", self.ws_port, ping_interval=None
        )
        self._servers.append(("ws", None, relay_srv))

        # HTTP server (static + /api proxy) in its own thread
        self.http_port = self._free_port()
        stack = self

        class Handler(BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.1"

            def log_message(self, *args):
                pass

            def _proxy(self):
                import http.client
                length = int(self.headers.get("Content-Length") or 0)
                body = self.rfile.read(length) if length else None
                conn = http.client.HTTPConnection("127.0.0.1", stack.backend_port, timeout=10)
                headers = {k: v for k, v in self.headers.items() if k.lower() not in ("host", "connection")}
                try:
                    conn.request(self.command, self.path, body=body, headers=headers)
                    resp = conn.getresponse()
                    data = resp.read()
                    self.send_response(resp.status)
                    for k, v in resp.getheaders():
                        if k.lower() in ("transfer-encoding", "connection", "content-length"):
                            continue
                        self.send_header(k, v)
                    self.send_header("Content-Length", str(len(data)))
                    self.end_headers()
                    self.wfile.write(data)
                except Exception:
                    self.send_error(502, "Bad gateway")
                finally:
                    conn.close()

            def _serve_static(self):
                path = urlparse(self.path).path
                if path in ("/", "") or not os.path.splitext(path)[1]:
                    # SPA fallback for /room/:id routes
                    file_path = FRONTEND_DIST / "index.html"
                else:
                    file_path = (FRONTEND_DIST / path.lstrip("/")).resolve()
                    if not str(file_path).startswith(str(FRONTEND_DIST.resolve())) or not file_path.is_file():
                        self.send_error(404)
                        return
                data = file_path.read_bytes()
                ctype = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
                self.send_response(200)
                self.send_header("Content-Type", ctype)
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def _dispatch(self):
                if self.path.startswith("/api/") or self.path.startswith("/health"):
                    self._proxy()
                else:
                    self._serve_static()

            def do_GET(self):
                self._dispatch()

            def do_POST(self):
                self._dispatch()

            def do_OPTIONS(self):
                self._proxy()

        http_srv = ThreadingHTTPServer(("127.0.0.1", self.http_port), Handler)
        http_thread = threading.Thread(target=http_srv.serve_forever, daemon=True, name=f"gui-http-{self.name}")
        http_thread.start()
        self._threads.append(http_thread)
        self._http_srv = http_srv

        ready.set()

    async def _ws_proxy_handler(self, client_ws):
        query = ""
        try:
            path = client_ws.request.path if hasattr(client_ws, "request") else ""
            if "?" in path:
                query = path.split("?", 1)[1]
        except Exception:
            pass
        upstream_url = f"ws://127.0.0.1:{self.backend_port}/ws/chat?{query}"
        try:
            async with websockets.connect(upstream_url, ping_interval=None) as upstream:
                if self.rewrite_pubkeys:
                    await self._mitm_pipe(client_ws, upstream)
                else:
                    await self._plain_pipe(client_ws, upstream)
        except Exception:
            try:
                await client_ws.close()
            except Exception:
                pass

    async def _plain_pipe(self, a, b):
        async def one_way(src, dst):
            async for msg in src:
                await dst.send(msg)
        tasks = [asyncio.create_task(one_way(a, b)), asyncio.create_task(one_way(b, a))]
        await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for t in tasks:
            t.cancel()

    async def _mitm_pipe(self, a, b):
        """Active attacker: substitutes its own P-256 key into each direction."""
        import json as _json
        from cryptography.hazmat.primitives.asymmetric import ec
        from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
        import base64

        def fresh_key_b64():
            pub = ec.generate_private_key(ec.SECP256R1()).public_key()
            raw = pub.public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
            return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()

        async def one_way(src, dst):
            async for msg in src:
                try:
                    data = _json.loads(msg)
                    if isinstance(data, dict) and data.get("type") == "public_key":
                        data["public_key"] = fresh_key_b64()
                        msg = _json.dumps(data)
                except Exception:
                    pass
                await dst.send(msg)

        tasks = [asyncio.create_task(one_way(a, b)), asyncio.create_task(one_way(b, a))]
        await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for t in tasks:
            t.cancel()

    def stop(self):
        self._stop.set()
        if self._loop and self._loop.is_running():
            self._loop.call_soon_threadsafe(lambda: asyncio.ensure_future(self._async_stop()))
            time.sleep(0.3)
            self._loop.call_soon_threadsafe(self._loop.stop)
        try:
            self._http_srv and self._http_srv.shutdown()
        except Exception:
            pass

    async def _async_stop(self):
        for kind, task, srv in self._servers:
            try:
                if kind == "uvicorn":
                    task and setattr(srv, "should_exit", True)
                elif kind == "ws":
                    srv.close()
                    await srv.wait_closed()
            except Exception:
                pass
        for kind, task, srv in self._servers:
            try:
                if kind == "uvicorn" and task:
                    await asyncio.wait_for(asyncio.shield(task), 5)
            except Exception:
                pass

    @staticmethod
    def _free_port() -> int:
        import socket
        s = socket.socket()
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
        s.close()
        return port
