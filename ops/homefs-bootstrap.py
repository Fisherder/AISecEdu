import http.client
from contextlib import closing
from http.server import BaseHTTPRequestHandler
import json
import os
from pathlib import Path
import signal
import socket
import socketserver
import sqlite3
import threading
import time


ROOT = Path('/run/homefs')
SOCKET = Path('/run/docker/plugins/homefs.sock')


def mountpoint(name, overlay):
    for value in [name, overlay]:
        if value is not None and (not value or Path(value).name != value or value in {'.', '..'}):
            raise ValueError('Invalid Homefs volume name')
    return str(ROOT / overlay / 'overlays' / name) if overlay else str(ROOT / name / 'active')


def response(path, body):
    if path == '/Plugin.Activate':
        return 200, {'Implements': ['VolumeDriver']}
    if path == '/VolumeDriver.Capabilities':
        return 200, {'Capabilities': {'Scope': 'local'}}
    if path not in {'/VolumeDriver.Get', '/VolumeDriver.Path', '/VolumeDriver.List'}:
        return 503, {'Err': 'Homefs is starting; retry after the storage service is ready'}
    with closing(sqlite3.connect(f'file:{ROOT / "homefs.db"}?mode=ro', uri=True)) as database:
        if path == '/VolumeDriver.List':
            rows = database.execute('SELECT name,overlay FROM docker_volumes ORDER BY name').fetchall()
            return 200, {'Volumes': [{'Name': name, 'Mountpoint': mountpoint(name, overlay)} for name, overlay in rows], 'Err': ''}
        name = body.get('Name')
        row = database.execute('SELECT name,overlay FROM docker_volumes WHERE name=?', (name,)).fetchone()
        if row is None:
            return 404, {'Err': 'Volume not found'}
        path_value = mountpoint(*row)
        if path == '/VolumeDriver.Path':
            return 200, {'Mountpoint': path_value, 'Err': ''}
        return 200, {'Volume': {'Name': row[0], 'Mountpoint': path_value, 'Status': {}}, 'Err': ''}


class UnixConnection(http.client.HTTPConnection):
    def __init__(self, path):
        super().__init__('localhost', timeout=1)
        self.path = str(path)

    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX)
        self.sock.settimeout(self.timeout)
        self.sock.connect(self.path)


def request(path, endpoint, method='GET'):
    connection = UnixConnection(path)
    try:
        connection.request(method, endpoint, body='{}' if method == 'POST' else None,
                           headers={'Content-Type': 'application/json'})
        reply = connection.getresponse()
        return reply.status, json.loads(reply.read())
    finally:
        connection.close()


def notify_ready():
    destination = os.environ.get('NOTIFY_SOCKET')
    if destination:
        if destination.startswith('@'):
            destination = '\0' + destination[1:]
        with socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM) as channel:
            channel.connect(destination)
            channel.sendall(b'READY=1')


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            size = int(self.headers.get('Content-Length', 0))
            if not 0 <= size <= 65536:
                raise ValueError('Invalid request size')
            body = json.loads(self.rfile.read(size) or b'{}')
            if not isinstance(body, dict):
                raise ValueError('Invalid request')
            status, value = response(self.path, body)
        except (ValueError, sqlite3.Error, TypeError):
            status, value = 503, {'Err': 'Homefs metadata is not available yet'}
        encoded = json.dumps(value).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def log_message(self, format, *args):
        pass


class Server(socketserver.ThreadingMixIn, socketserver.UnixStreamServer):
    daemon_threads = True


def main():
    SOCKET.parent.mkdir(parents=True, exist_ok=True)
    try:
        status, body = request(SOCKET, '/Plugin.Activate', 'POST')
        if status == 200 and 'VolumeDriver' in body.get('Implements', []):
            notify_ready()
            return
    except (OSError, ValueError, http.client.HTTPException):
        pass
    SOCKET.unlink(missing_ok=True)
    server = Server(str(SOCKET), Handler)
    SOCKET.chmod(0o660)
    inode = SOCKET.stat().st_ino
    stopped = threading.Event()
    signal.signal(signal.SIGTERM, lambda *args: stopped.set())
    signal.signal(signal.SIGINT, lambda *args: stopped.set())
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    notify_ready()
    try:
        while not stopped.wait(0.2):
            try:
                status, body = request('/run/docker.sock', '/containers/homefs/json')
                if status == 200 and body.get('State', {}).get('Running'):
                    break
            except (OSError, ValueError, http.client.HTTPException):
                pass
    finally:
        try:
            if SOCKET.stat().st_ino == inode:
                SOCKET.unlink()
        except FileNotFoundError:
            pass
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
