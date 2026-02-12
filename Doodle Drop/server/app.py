"""Doodle Drop — Flask Backend

Stores and serves doodles using SQLite.
Run:  python app.py
"""

import os
import time
import sqlite3
from pathlib import Path
from html import escape

from flask import Flask, request, jsonify, g

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024  # 10 MB

DATA_DIR = Path(os.environ.get("DATA_DIR", os.path.dirname(os.path.abspath(__file__))))
DB_PATH = DATA_DIR / "data.db"
PORT = int(os.environ.get("PORT", 3000))


# ── Database helpers ─────────────────────────────────────────────

def get_db():
    """Return a per-request database connection (stored on flask.g)."""
    if "db" not in g:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        g.db = sqlite3.connect(str(DB_PATH))
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    """Create tables and indexes if they don't exist."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute(
        """CREATE TABLE IF NOT EXISTS doodles (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            to_code    TEXT    NOT NULL,
            from_code  TEXT,
            from_name  TEXT,
            data_url   TEXT    NOT NULL,
            created_at INTEGER NOT NULL
        )"""
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_doodles_to_code ON doodles(to_code)")
    conn.execute(
        """CREATE TABLE IF NOT EXISTS friend_requests (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            from_code  TEXT    NOT NULL,
            from_name  TEXT    NOT NULL,
            to_code    TEXT    NOT NULL,
            status     TEXT    NOT NULL DEFAULT 'pending',
            created_at INTEGER NOT NULL
        )"""
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_fr_to_code ON friend_requests(to_code)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_fr_from_code ON friend_requests(from_code)")
    conn.commit()
    conn.close()


# ── CORS ─────────────────────────────────────────────────────────

@app.before_request
def handle_preflight():
    """Respond to every OPTIONS preflight so the browser is satisfied."""
    if request.method == "OPTIONS":
        response = app.make_default_options_response()
        return response


@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PATCH, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Max-Age"] = "86400"
    return response


# ── API Routes ───────────────────────────────────────────────────

@app.route("/api/doodles", methods=["POST"])
def create_doodle():
    body = request.get_json(silent=True) or {}
    to_code = body.get("toCode")
    data_url = body.get("dataUrl")

    if not to_code or not data_url:
        return jsonify(ok=False, error="Missing toCode or dataUrl"), 400

    from_code = body.get("fromCode", "")
    from_name = body.get("fromName", "")
    created_at = int(time.time() * 1000)  # milliseconds, matching JS Date.now()

    db = get_db()
    cursor = db.execute(
        "INSERT INTO doodles (to_code, from_code, from_name, data_url, created_at) VALUES (?, ?, ?, ?, ?)",
        (to_code, from_code, from_name, data_url, created_at),
    )
    db.commit()

    return jsonify(ok=True, id=cursor.lastrowid, createdAt=created_at)


@app.route("/api/inbox/<code>", methods=["GET"])
def get_inbox(code):
    if not code:
        return jsonify(ok=False, error="Missing code"), 400

    db = get_db()
    rows = db.execute(
        """SELECT id,
                  from_code  AS fromCode,
                  from_name  AS fromName,
                  data_url   AS dataUrl,
                  created_at AS createdAt
             FROM doodles
            WHERE to_code = ?
         ORDER BY created_at DESC
            LIMIT 24""",
        (code,),
    ).fetchall()

    items = [dict(row) for row in rows]
    return jsonify(ok=True, items=items)


# ── Friend Requests ──────────────────────────────────────────────

@app.route("/api/friend-requests", methods=["POST"])
def create_friend_request():
    body = request.get_json(silent=True) or {}
    from_code = body.get("fromCode")
    from_name = body.get("fromName")
    to_code = body.get("toCode")

    if not from_code or not to_code or not from_name:
        return jsonify(ok=False, error="Missing fromCode, fromName, or toCode"), 400

    # Don't send a request to yourself
    if from_code == to_code:
        return jsonify(ok=False, error="Cannot send a request to yourself"), 400

    db = get_db()

    # Check for duplicate pending request
    existing = db.execute(
        "SELECT id FROM friend_requests WHERE from_code = ? AND to_code = ? AND status = 'pending'",
        (from_code, to_code),
    ).fetchone()
    if existing:
        return jsonify(ok=True, id=existing["id"], duplicate=True)

    created_at = int(time.time() * 1000)
    cursor = db.execute(
        "INSERT INTO friend_requests (from_code, from_name, to_code, status, created_at) VALUES (?, ?, ?, 'pending', ?)",
        (from_code, from_name, to_code, created_at),
    )
    db.commit()
    return jsonify(ok=True, id=cursor.lastrowid, createdAt=created_at)


@app.route("/api/friend-requests/<code>", methods=["GET"])
def get_friend_requests(code):
    """Return incoming pending requests and recently accepted outgoing requests."""
    if not code:
        return jsonify(ok=False, error="Missing code"), 400

    db = get_db()

    # Pending requests TO this user
    incoming = db.execute(
        """SELECT id, from_code AS fromCode, from_name AS fromName,
                  to_code AS toCode, status, created_at AS createdAt
             FROM friend_requests
            WHERE to_code = ? AND status = 'pending'
         ORDER BY created_at DESC
            LIMIT 50""",
        (code,),
    ).fetchall()

    # Requests FROM this user that were accepted (so they can get notified)
    accepted = db.execute(
        """SELECT id, from_code AS fromCode, from_name AS fromName,
                  to_code AS toCode, status, created_at AS createdAt
             FROM friend_requests
            WHERE from_code = ? AND status = 'accepted'
         ORDER BY created_at DESC
            LIMIT 50""",
        (code,),
    ).fetchall()

    return jsonify(
        ok=True,
        incoming=[dict(r) for r in incoming],
        accepted=[dict(r) for r in accepted],
    )


@app.route("/api/friend-requests/<int:request_id>", methods=["PATCH"])
def update_friend_request(request_id):
    body = request.get_json(silent=True) or {}
    new_status = body.get("status")
    responder_code = body.get("code", "")

    if new_status not in ("accepted", "declined"):
        return jsonify(ok=False, error="Status must be 'accepted' or 'declined'"), 400

    db = get_db()
    row = db.execute("SELECT * FROM friend_requests WHERE id = ?", (request_id,)).fetchone()
    if not row:
        return jsonify(ok=False, error="Request not found"), 404

    # Only the recipient can accept/decline
    if responder_code and row["to_code"] != responder_code:
        return jsonify(ok=False, error="Not authorized"), 403

    db.execute(
        "UPDATE friend_requests SET status = ? WHERE id = ?",
        (new_status, request_id),
    )
    db.commit()

    return jsonify(ok=True, id=request_id, status=new_status)


# ── Web Inbox Page ───────────────────────────────────────────────

INBOX_HTML = """\
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Doodle Inbox</title>
    <style>
      body {{ font-family: Arial, sans-serif; margin: 24px; background: #f7f2ea; }}
      h1 {{ font-size: 22px; }}
      .grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }}
      .card {{ background: white; border-radius: 12px; border: 1px solid #e4d7ca; overflow: hidden; }}
      .card img {{ width: 100%; height: 160px; object-fit: cover; display: block; }}
      .meta {{ padding: 6px 10px; font-size: 12px; }}
      .empty {{ color: #6b4f34; }}
    </style>
  </head>
  <body>
    <h1>Doodle Inbox</h1>
    <div id="grid" class="grid"></div>
    <div id="empty" class="empty" style="display:none;">No doodles yet.</div>
    <script>
      fetch('/api/inbox/{code}')
        .then(r => r.json())
        .then(data => {{
          const grid = document.getElementById('grid');
          const empty = document.getElementById('empty');
          if (!data.ok || !data.items || data.items.length === 0) {{
            empty.style.display = 'block';
            return;
          }}
          data.items.forEach(item => {{
            const card = document.createElement('div');
            card.className = 'card';
            const img = document.createElement('img');
            img.src = item.dataUrl;
            const meta = document.createElement('div');
            meta.className = 'meta';
            meta.textContent = item.fromName ? 'From ' + item.fromName : 'Doodle';
            card.appendChild(img);
            card.appendChild(meta);
            grid.appendChild(card);
          }});
        }});
    </script>
  </body>
</html>"""


@app.route("/inbox/<code>", methods=["GET"])
def inbox_page(code):
    if not code:
        return "Missing code", 400
    safe_code = escape(code)
    return INBOX_HTML.format(code=safe_code), 200, {"Content-Type": "text/html"}


# ── Main ─────────────────────────────────────────────────────────

if __name__ == "__main__":
    init_db()
    print(f"Doodle Drop backend running at http://localhost:{PORT}")
    app.run(host="0.0.0.0", port=PORT, debug=True)
