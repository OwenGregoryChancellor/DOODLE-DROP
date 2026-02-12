const path = require("path");
const fs = require("fs");
const express = require("express");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || __dirname;
const DB_PATH = path.join(DATA_DIR, "data.db");

app.use(express.json({ limit: "10mb" }));
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

function openDb() {
  return new sqlite3.Database(DB_PATH);
}

function initDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = openDb();
  db.serialize(() => {
    db.run(
      `CREATE TABLE IF NOT EXISTS doodles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        to_code TEXT NOT NULL,
        from_code TEXT,
        from_name TEXT,
        data_url TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`
    );
    db.run("CREATE INDEX IF NOT EXISTS idx_doodles_to_code ON doodles(to_code)");
  });
  db.close();
}

function insertDoodle({ toCode, fromCode, fromName, dataUrl, createdAt }) {
  return new Promise((resolve, reject) => {
    const db = openDb();
    db.run(
      "INSERT INTO doodles (to_code, from_code, from_name, data_url, created_at) VALUES (?, ?, ?, ?, ?)",
      [toCode, fromCode || "", fromName || "", dataUrl, createdAt],
      function (err) {
        db.close();
        if (err) return reject(err);
        resolve({ id: this.lastID });
      }
    );
  });
}

function listInbox(code) {
  return new Promise((resolve, reject) => {
    const db = openDb();
    db.all(
      "SELECT id, from_code as fromCode, from_name as fromName, data_url as dataUrl, created_at as createdAt FROM doodles WHERE to_code = ? ORDER BY created_at DESC LIMIT 24",
      [code],
      (err, rows) => {
        db.close();
        if (err) return reject(err);
        resolve(rows);
      }
    );
  });
}

app.post("/api/doodles", async (req, res) => {
  const { toCode, fromCode, fromName, dataUrl } = req.body || {};
  if (!toCode || !dataUrl) {
    res.status(400).json({ ok: false, error: "Missing toCode or dataUrl" });
    return;
  }
  try {
    const createdAt = Date.now();
    const result = await insertDoodle({ toCode, fromCode, fromName, dataUrl, createdAt });
    res.json({ ok: true, id: result.id, createdAt });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Failed to store doodle" });
  }
});

app.get("/api/inbox/:code", async (req, res) => {
  const { code } = req.params;
  if (!code) {
    res.status(400).json({ ok: false, error: "Missing code" });
    return;
  }
  try {
    const rows = await listInbox(code);
    res.json({ ok: true, items: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Failed to load inbox" });
  }
});

app.get("/inbox/:code", async (req, res) => {
  const { code } = req.params;
  if (!code) {
    res.status(400).send("Missing code");
    return;
  }
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Doodle Inbox</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 24px; background: #f7f2ea; }
      h1 { font-size: 22px; }
      .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
      .card { background: white; border-radius: 12px; border: 1px solid #e4d7ca; overflow: hidden; }
      .card img { width: 100%; height: 160px; object-fit: cover; display: block; }
      .meta { padding: 6px 10px; font-size: 12px; }
      .empty { color: #6b4f34; }
    </style>
  </head>
  <body>
    <h1>Doodle Inbox</h1>
    <div id="grid" class="grid"></div>
    <div id="empty" class="empty" style="display:none;">No doodles yet.</div>
    <script>
      fetch('/api/inbox/${code}')
        .then((r) => r.json())
        .then((data) => {
          const grid = document.getElementById('grid');
          const empty = document.getElementById('empty');
          if (!data.ok || !data.items || data.items.length === 0) {
            empty.style.display = 'block';
            return;
          }
          data.items.forEach((item) => {
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
          });
        });
    </script>
  </body>
</html>`;
  res.send(html);
});

initDb();

app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`Doodle Drop backend running at ${url}`);
  const inboxPath = path.join(__dirname, "inbox.txt");
  fs.writeFileSync(inboxPath, `Backend running at ${url}\n`, "utf8");
});
