"""Self-hosted encrypted health journal. Python standard library only."""
import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import threading
import time
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).parent
DB_PATH = os.environ.get('DATABASE_PATH', str(ROOT / 'data' / 'health.sqlite3'))
PORT = int(os.environ.get('PORT', os.environ.get('FLESH_PORT', '8083')))
BIND = os.environ.get('BIND', os.environ.get('FLESH_BIND', '127.0.0.1'))
ORIGIN = os.environ.get('APP_ORIGIN', f'http://localhost:{PORT}').rstrip('/')
ALLOW_REGISTRATION = os.environ.get('FLESH_ALLOW_REGISTRATION', 'false').strip().lower() == 'true'
SECURE = ORIGIN.startswith('https://')
LIMIT = 2_000_000
LOCK = threading.Lock()
ATTEMPTS = {}


def connect():
    db = sqlite3.connect(DB_PATH, timeout=15)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys=ON')
    return db


def init_db():
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    with connect() as db:
        db.executescript('''
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL,
          auth_salt BLOB NOT NULL, auth_hash BLOB NOT NULL,
          key_salt TEXT NOT NULL, vault TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1);
        CREATE TABLE IF NOT EXISTS sessions (
          token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires REAL NOT NULL);
        ''')
    os.chmod(DB_PATH, 0o600)


def password_hash(secret, salt):
    return hashlib.scrypt(secret.encode(), salt=salt, n=16384, r=8, p=1)


def valid_envelope(v):
    if not isinstance(v, dict) or set(v) != {'version', 'iv', 'ciphertext'} or v['version'] != 1:
        return False
    try:
        return (len(base64.b64decode(v['iv'], validate=True)) == 12 and
                16 <= len(base64.b64decode(v['ciphertext'], validate=True)) <= 1_400_000)
    except (ValueError, TypeError):
        return False


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / 'public'), **kwargs)

    def log_message(self, fmt, *args):
        # No account identifiers, request bodies, or tokens in logs.
        pass

    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
        self.send_header('Cache-Control', 'no-store')
        if SECURE:
            self.send_header('Strict-Transport-Security', 'max-age=31536000')
        super().end_headers()

    def reply(self, status, value, cookie=None):
        raw = json.dumps(value).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(raw)))
        if cookie:
            self.send_header('Set-Cookie', cookie)
        self.end_headers()
        self.wfile.write(raw)

    def session(self, db):
        cookie = SimpleCookie()
        try:
            cookie.load(self.headers.get('Cookie', ''))
            token = cookie['session'].value
        except (KeyError, ValueError):
            return None
        return db.execute('SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=? AND expires>?',
                          (hashlib.sha256(token.encode()).hexdigest(), time.time())).fetchone()

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == '/api/health':
            return self.reply(200, {'ok': True})
        if path == '/api/vault':
            with connect() as db:
                user = self.session(db)
                if not user:
                    return self.reply(401, {'error': 'Bitte erneut anmelden.'})
                return self.reply(200, {'vault': json.loads(user['vault']), 'revision': user['revision'], 'keySalt': user['key_salt']})
        if path.startswith('/api/'):
            return self.reply(404, {'error': 'Nicht gefunden.'})
        if path not in ('/', '/index.html', '/app.js', '/crypto.js', '/style.css', '/sw.js', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png', '/favicon.png'):
            return self.reply(404, {'error': 'Nicht gefunden.'})
        super().do_GET()

    def do_POST(self):
        # Exact origin check also protects cookie-authenticated writes against CSRF.
        if self.headers.get('Origin') != ORIGIN:
            return self.reply(403, {'error': 'Ungültiger Ursprung. APP_ORIGIN prüfen.'})
        if self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
            return self.reply(415, {'error': 'JSON erforderlich.'})
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= LIMIT:
                return self.reply(413, {'error': 'Anfrage zu groß oder leer.'})
            body = json.loads(self.rfile.read(size))
            if not isinstance(body, dict):
                raise ValueError()
        except (ValueError, UnicodeDecodeError):
            return self.reply(400, {'error': 'Ungültige Anfrage.'})
        path = urlsplit(self.path).path
        with connect() as db:
            if path in ('/api/register', '/api/login'):
                username = body.get('username', '')
                secret = body.get('auth', '')
                if not isinstance(username, str) or not re.fullmatch(r'[a-z0-9_.-]{3,64}', username) or not isinstance(secret, str) or not re.fullmatch(r'[A-Za-z0-9+/]{43}=', secret):
                    return self.reply(400, {'error': 'Ungültige Zugangsdaten.'})
                # Account-based throttling works behind a reverse proxy without trusting forwarded IPs.
                now = time.time()
                with LOCK:
                    for k in list(ATTEMPTS):
                        if ATTEMPTS[k][1] < now - 900:
                            del ATTEMPTS[k]
                    count, start = ATTEMPTS.get(username, (0, now))
                    if count >= 10 or len(ATTEMPTS) > 10000:
                        return self.reply(429, {'error': 'Zu viele Versuche. Bitte in 15 Minuten erneut versuchen.'})
                    ATTEMPTS[username] = (count + 1, start)
                if path == '/api/register':
                    # Serialize the empty-database check and insert across requests/processes.
                    db.execute('BEGIN IMMEDIATE')
                    if not ALLOW_REGISTRATION and db.execute('SELECT 1 FROM users LIMIT 1').fetchone():
                        return self.reply(403, {'error': 'Weitere Registrierungen sind deaktiviert.'})
                user = db.execute('SELECT * FROM users WHERE username=?', (username,)).fetchone()
                if path == '/api/register':
                    if not valid_envelope(body.get('vault')):
                        return self.reply(400, {'error': 'Ungültiger verschlüsselter Tresor.'})
                    try:
                        if len(base64.b64decode(body.get('keySalt', ''), validate=True)) != 32:
                            raise ValueError()
                    except (ValueError, TypeError):
                        return self.reply(400, {'error': 'Ungültiges Schlüsselsalz.'})
                    if user:
                        return self.reply(409, {'error': 'Benutzername bereits vergeben.'})
                    salt = secrets.token_bytes(32)
                    try:
                        db.execute('INSERT INTO users VALUES (?,?,?,?,?,?,1)', (secrets.token_hex(16), username, salt, password_hash(secret, salt), body['keySalt'], json.dumps(body['vault'])))
                    except sqlite3.IntegrityError:
                        return self.reply(409, {'error': 'Benutzername bereits vergeben.'})
                    user = db.execute('SELECT * FROM users WHERE username=?', (username,)).fetchone()
                else:
                    salt = user['auth_salt'] if user else bytes(32)
                    check = password_hash(secret, salt)
                    if not user or not hmac.compare_digest(check, user['auth_hash']):
                        return self.reply(401, {'error': 'Benutzername oder Passwort falsch.'})
                with LOCK:
                    ATTEMPTS.pop(username, None)
                token = secrets.token_urlsafe(32)
                db.execute('DELETE FROM sessions WHERE expires<?', (now,))
                db.execute('INSERT INTO sessions VALUES (?,?,?)', (hashlib.sha256(token.encode()).hexdigest(), user['id'], now + 43200))
                return self.reply(200, {'vault': json.loads(user['vault']), 'keySalt': user['key_salt'], 'revision': user['revision']},
                                  f'session={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200' + ('; Secure' if SECURE else ''))
            user = self.session(db)
            if not user:
                return self.reply(401, {'error': 'Bitte erneut anmelden.'})
            if path == '/api/logout':
                cookie = SimpleCookie(self.headers.get('Cookie', ''))
                db.execute('DELETE FROM sessions WHERE token_hash=?', (hashlib.sha256(cookie['session'].value.encode()).hexdigest(),))
                return self.reply(200, {'ok': True}, 'session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' + ('; Secure' if SECURE else ''))
            if path == '/api/vault':
                if not valid_envelope(body.get('vault')) or type(body.get('revision')) is not int:
                    return self.reply(400, {'error': 'Ungültiger Tresor.'})
                result = db.execute('UPDATE users SET vault=?, revision=revision+1 WHERE id=? AND revision=?',
                                    (json.dumps(body['vault']), user['id'], body['revision']))
                if not result.rowcount:
                    return self.reply(409, {'error': 'Auf einem anderen Gerät geändert. Bitte sperren und neu anmelden; diese Änderung wurde nicht gespeichert.'})
                return self.reply(200, {'revision': body['revision'] + 1})
        self.reply(404, {'error': 'Nicht gefunden.'})


if __name__ == '__main__':
    init_db()
    ThreadingHTTPServer((BIND, PORT), Handler).serve_forever()
