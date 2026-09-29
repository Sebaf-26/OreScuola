// Zero-dependency server: serves ./public and keeps the teacher's entries in
// DATA_DIR/ore.json so phone and computer see the same list.
import { createServer } from "node:http";
import { readFile, writeFile, rename, mkdir, stat } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID, randomBytes, createHmac, timingSafeEqual } from "node:crypto";

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

// Stamped into index.html as ?v= on CSS/JS so a redeploy is never masked by a
// proxy/CDN cache (Cloudflare keeps .js/.css by extension).
const pkg = JSON.parse(await readFile(join(fileURLToPath(new URL(".", import.meta.url)), "package.json"), "utf8"));
const BUILD = `${pkg.version}-${Date.now().toString(36)}`;

// ---------- auth ----------
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
  console.error("ADMIN_USERNAME e ADMIN_PASSWORD sono obbligatorie: impostale nelle variabili d'ambiente dello stack.");
  process.exit(1);
}
const SESSION_DAYS = 30;
const COOKIE = "orescuola_sid";

// Random secret kept in the data volume so logins survive restarts. The signing
// key also mixes in the credentials: changing the password logs every device out.
async function loadSecret() {
  const file = join(DATA_DIR, "session.secret");
  try {
    const s = (await readFile(file, "utf8")).trim();
    if (s.length >= 32) return s;
  } catch {}
  const s = randomBytes(32).toString("hex");
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(file, s, { mode: 0o600 });
  return s;
}
const SIGNING_KEY = createHmac("sha256", await loadSecret()).update(`${ADMIN_USERNAME}\n${ADMIN_PASSWORD}`).digest();
const sign = (data) => createHmac("sha256", SIGNING_KEY).update(data).digest("base64url");

function safeEqual(a, b) {
  const ha = createHmac("sha256", SIGNING_KEY).update(String(a)).digest();
  const hb = createHmac("sha256", SIGNING_KEY).update(String(b)).digest();
  return timingSafeEqual(ha, hb);
}

function makeToken() {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + SESSION_DAYS * 864e5 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function isAuthed(req) {
  const cookie = (req.headers.cookie || "").split(/;\s*/).find((c) => c.startsWith(COOKIE + "="));
  if (!cookie) return false;
  const [payload, sig] = cookie.slice(COOKIE.length + 1).split(".");
  if (!payload || !sig || !safeEqual(sig, sign(payload))) return false;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString()).exp > Date.now();
  } catch {
    return false;
  }
}

function sessionCookie(req, value, maxAge) {
  const https = req.headers["x-forwarded-proto"] === "https" || req.socket.encrypted;
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${https ? "; Secure" : ""}`;
}

// Brute-force brake: 5 wrong attempts per IP lock it out for 15 minutes.
const failures = new Map();
// Behind Cloudflare → Nginx Proxy Manager: CF-Connecting-IP is the real client; otherwise
// take the hop the proxy appended last (the first X-Forwarded-For entry is client-controlled).
const clientIp = (req) =>
  String(req.headers["cf-connecting-ip"] || "").trim() ||
  String(req.headers["x-forwarded-for"] || "").split(",").pop().trim() ||
  req.socket.remoteAddress;

async function handleLogin(req, res) {
  const ip = clientIp(req);
  const f = failures.get(ip);
  if (f && f.count >= 5 && Date.now() - f.last < 15 * 60_000) {
    return sendJson(res, 429, { error: "Troppi tentativi. Riprova tra 15 minuti." });
  }
  let payload;
  try { payload = JSON.parse(await readBody(req)); } catch { return sendJson(res, 400, { error: "JSON non valido" }); }
  const okUser = safeEqual(payload?.username ?? "", ADMIN_USERNAME);
  const okPass = safeEqual(payload?.password ?? "", ADMIN_PASSWORD);
  if (!okUser || !okPass) {
    const next = f && Date.now() - f.last < 15 * 60_000 ? f.count + 1 : 1;
    failures.set(ip, { count: next, last: Date.now() });
    return sendJson(res, 401, { error: "Nome utente o password errati." });
  }
  failures.delete(ip);
  res.setHeader("Set-Cookie", sessionCookie(req, makeToken(), SESSION_DAYS * 86400));
  sendJson(res, 200, { ok: true });
}

// Reachable without logging in: the login page and what it needs to render.
const PUBLIC_PATHS = new Set(["/login", "/login.js", "/style.css", "/icon.svg", "/manifest.webmanifest", "/api/login", "/api/health"]);

const DEFAULT_SETTINGS = { limiteA: 40, limiteB: 40, classi: [] };

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
      if (payload.classi !== undefined) {
        if (!Array.isArray(payload.classi) || payload.classi.length > 60) return sendJson(res, 400, { error: "elenco classi non valido" });
        const clean = payload.classi.map((c) => String(c).trim().slice(0, 40)).filter(Boolean);
        next.classi = [...new Set(clean)];
      }
      db.settings = next;
      await persist();
      return sendJson(res, 200, db.settings);
    }
  }

  if (resource === "health") return sendJson(res, 200, { ok: true });
  if (resource === "login" && req.method === "POST") return handleLogin(req, res);
  if (resource === "logout" && req.method === "POST") {
    res.setHeader("Set-Cookie", sessionCookie(req, "", 0));
    return sendJson(res, 200, { ok: true });
  }

  sendJson(res, 404, { error: "not found" });
}

async function serveStatic(req, res, url) {
  const path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  let file = join(ROOT, path === "/login" ? "login.html" : path);
  if (!file.startsWith(ROOT)) return res.writeHead(403).end();

  try {
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
  } catch {
    file = join(ROOT, "index.html");
  }

  try {
    let body = await readFile(file);
    const ext = extname(file);
    if (ext === ".html") body = body.toString("utf8").replaceAll("__V__", BUILD);
    res.writeHead(200, {
      "Content-Type": TYPES[ext] || "application/octet-stream",
      // HTML must never be cached; CSS/JS are versioned via ?v= so they can be.
      "Cache-Control": ext === ".html" ? "no-store" : url.searchParams.has("v") ? "public, max-age=31536000, immutable" : "no-cache"
    });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}

createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (!PUBLIC_PATHS.has(url.pathname) && !isAuthed(req)) {
    if (url.pathname.startsWith("/api/")) return sendJson(res, 401, { error: "Accesso richiesto" });
    res.writeHead(302, { Location: "/login", "Cache-Control": "no-store" });
    return res.end();
  }
  if (url.pathname === "/login" && isAuthed(req)) {
    res.writeHead(302, { Location: "/", "Cache-Control": "no-store" });
    return res.end();
  }
  const handler = url.pathname.startsWith("/api/") ? handleApi : serveStatic;
  handler(req, res, url).catch((err) => {
    console.error(err);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
}).listen(PORT, () => console.log(`orescuola listening on :${PORT}, data in ${DATA_FILE}`));
