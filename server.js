// Zero-dependency server: serves ./public and keeps the teacher's entries in
// DATA_DIR/ore.json so phone and computer see the same list.
import { createServer } from "node:http";
import { readFile, writeFile, rename, mkdir, stat } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "public");
const DATA_DIR = process.env.DATA_DIR || "/data";
const DATA_FILE = join(DATA_DIR, "ore.json");
const PORT = Number(process.env.PORT || 3000);

// Must match TIPI in public/app.js.
const TIPI = new Set([
  "consiglio", "collegio", "dipartimento", "programmazione",
  "famiglie", "scrutinio", "esame", "altro"
]);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

const DEFAULT_SETTINGS = { limiteA: 40, limiteB: 40 };

let db = { entries: [], settings: { ...DEFAULT_SETTINGS } };
try {
  const loaded = JSON.parse(await readFile(DATA_FILE, "utf8"));
  db = {
    entries: Array.isArray(loaded.entries) ? loaded.entries : [],
    settings: { ...DEFAULT_SETTINGS, ...(loaded.settings || {}) }
  };
} catch {
  // first run: empty store
}

// Serialize writes; temp file + rename so a crash never leaves half a JSON.
let writing = Promise.resolve();
function persist() {
  const snapshot = JSON.stringify(db, null, 1);
  writing = writing.then(async () => {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(DATA_FILE + ".tmp", snapshot);
    await rename(DATA_FILE + ".tmp", DATA_FILE);
  }).catch((err) => console.error("persist failed:", err));
  return writing;
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": TYPES[".json"], "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 20_000) reject(new Error("too large"));
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

// Returns a clean entry or an error string.
function validateEntry(p) {
  if (!p || typeof p !== "object") return "dati mancanti";
  const tipo = String(p.tipo || "");
  if (!TIPI.has(tipo)) return "tipo non valido";
  const classe = String(p.classe || "").trim().slice(0, 40);
  const data = String(p.data || "");
  if (!DATE_RE.test(data) || Number.isNaN(Date.parse(data))) return "data non valida";
  const inizio = String(p.inizio || "");
  const fine = String(p.fine || "");
  if (!TIME_RE.test(inizio) || !TIME_RE.test(fine)) return "orario non valido";
  if (toMin(fine) <= toMin(inizio)) return "l'ora di fine deve essere dopo l'inizio";
  const note = String(p.note || "").trim().slice(0, 300);
  return { tipo, classe, data, inizio, fine, note };
}

async function handleApi(req, res, url) {
  const parts = url.pathname.split("/").filter(Boolean); // ["api", "entries", id?]
  const resource = parts[1];
  const id = parts[2];

  if (resource === "entries") {
    if (req.method === "GET" && !id) return sendJson(res, 200, db.entries);

    if (req.method === "POST" && !id) {
      let payload;
      try { payload = JSON.parse(await readBody(req)); } catch { return sendJson(res, 400, { error: "JSON non valido" }); }
      const entry = validateEntry(payload);
      if (typeof entry === "string") return sendJson(res, 400, { error: entry });
      const saved = { id: randomUUID(), ...entry, creato: new Date().toISOString() };
      db.entries.push(saved);
      await persist();
      return sendJson(res, 201, saved);
    }

    const idx = id ? db.entries.findIndex((e) => e.id === id) : -1;
    if (id && idx === -1) return sendJson(res, 404, { error: "impegno non trovato" });

    if (req.method === "PUT" && id) {
      let payload;
      try { payload = JSON.parse(await readBody(req)); } catch { return sendJson(res, 400, { error: "JSON non valido" }); }
      const entry = validateEntry(payload);
      if (typeof entry === "string") return sendJson(res, 400, { error: entry });
      db.entries[idx] = { ...db.entries[idx], ...entry };
      await persist();
      return sendJson(res, 200, db.entries[idx]);
    }

    if (req.method === "DELETE" && id) {
      db.entries.splice(idx, 1);
      await persist();
      return sendJson(res, 200, { ok: true });
    }
  }

  if (resource === "settings" && !id) {
    if (req.method === "GET") return sendJson(res, 200, db.settings);
    if (req.method === "PUT") {
      let payload;
      try { payload = JSON.parse(await readBody(req)); } catch { return sendJson(res, 400, { error: "JSON non valido" }); }
      const next = { ...db.settings };
      for (const key of ["limiteA", "limiteB"]) {
        if (payload[key] === undefined) continue;
        const n = Number(payload[key]);
        if (!Number.isFinite(n) || n < 0 || n > 200) return sendJson(res, 400, { error: `${key} non valido` });
        next[key] = Math.round(n * 100) / 100;
      }
      db.settings = next;
      await persist();
      return sendJson(res, 200, db.settings);
    }
  }

  if (resource === "health") return sendJson(res, 200, { ok: true });

  sendJson(res, 404, { error: "not found" });
}

async function serveStatic(req, res, url) {
  const path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  let file = join(ROOT, path);
  if (!file.startsWith(ROOT)) return res.writeHead(403).end();

  try {
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
  } catch {
    file = join(ROOT, "index.html");
  }

  try {
    const body = await readFile(file);
    res.writeHead(200, {
      "Content-Type": TYPES[extname(file)] || "application/octet-stream",
      "Cache-Control": "no-cache"
    });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}

createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const handler = url.pathname.startsWith("/api/") ? handleApi : serveStatic;
  handler(req, res, url).catch((err) => {
    console.error(err);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
}).listen(PORT, () => console.log(`orescuola listening on :${PORT}, data in ${DATA_FILE}`));
