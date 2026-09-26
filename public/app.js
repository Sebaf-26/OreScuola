// Ore Funzionali — frontend. Bucket A = art. 29 c.3 lett. a (collegio & co.),
// B = lett. b (consigli di classe), X = outside both 40-hour caps.
const TIPI = {
  consiglio:      { label: "Consiglio di classe",           bucket: "B" },
  collegio:       { label: "Collegio docenti",              bucket: "A" },
  dipartimento:   { label: "Riunione di dipartimento",      bucket: "A" },
  programmazione: { label: "Programmazione e verifica",     bucket: "A" },
  famiglie:       { label: "Incontro con le famiglie",      bucket: "A" },
  scrutinio:      { label: "Scrutinio",                     bucket: "X" },
  esame:          { label: "Esame",                         bucket: "X" },
  altro:          { label: "Altro (fuori monte ore)",       bucket: "X" }
};
const BUCKET_HINT = {
  A: "Conta nelle 40 ore di collegio e programmazione",
  B: "Conta nelle 40 ore di consigli di classe",
  X: "Non conta in nessuno dei due monte ore"
};
const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const GIORNI = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];

const $ = (id) => document.getElementById(id);
const state = { entries: [], settings: { limiteA: 40, limiteB: 40 }, anno: null, editing: null };

// ---------- helpers ----------
const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const durata = (e) => toMin(e.fine) - toMin(e.inizio);
function fmt(min) {
  const h = Math.floor(min / 60), m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}
// School year starts 1 September: 2026-09-26 -> 2026 (a.s. 2026/27).
function annoDi(dateStr) {
  const [y, m] = dateStr.split("-").map(Number);
  return m >= 9 ? y : y - 1;
}
const labelAnno = (y) => `a.s. ${y}/${String(y + 1).slice(2)}`;
function oggi() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const c of children) if (c != null) n.append(c);
  return n;
}
let toastTimer;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { "Content-Type": "application/json" },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Errore del server (${res.status})`);
  return data;
}

// ---------- rendering ----------
const entriesAnno = () => state.entries.filter((e) => annoDi(e.data) === state.anno);

function renderAnni() {
  const anni = new Set(state.entries.map((e) => annoDi(e.data)));
  anni.add(annoDi(oggi()));
  const sel = $("anno");
  sel.replaceChildren(...[...anni].sort((a, b) => b - a).map((y) => el("option", { value: y }, labelAnno(y))));
  sel.value = state.anno;
}

function renderMeter(bucket, used, limite, titolo) {
  const box = $(`meter-${bucket}`);
  const limMin = Math.round(limite * 60);
  const over = used > limMin;
  const pct = limMin ? Math.min(100, (used / limMin) * 100) : 100;
  box.classList.toggle("over", over);
  const rest = over
    ? `Superato di ${fmt(used - limMin)}`
    : used === limMin && limMin ? "Monte ore esaurito" : `Restano ${fmt(limMin - used)}`;
  box.replaceChildren(
    el("span", { class: "label" }, titolo),
    el("div", { class: "big" }, used ? fmt(used) : "0 h", " ", el("small", {}, `/ ${String(limite).replace(".", ",")} h`)),
    el("div", { class: "bar", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(limMin), "aria-valuenow": String(Math.min(used, limMin)), "aria-label": titolo },
      Object.assign(el("span"), { style: `width:${pct}%` })),
    el("p", { class: "rest" }, rest)
  );
}

function renderSummary() {
  const tot = { A: 0, B: 0, X: 0 };
  for (const e of entriesAnno()) tot[TIPI[e.tipo]?.bucket || "X"] += durata(e);
  renderMeter("A", tot.A, state.settings.limiteA, "Collegio e programmazione");
  renderMeter("B", tot.B, state.settings.limiteB, "Consigli di classe");
  $("fuori").textContent = tot.X
    ? `Scrutini, esami e altro: ${fmt(tot.X)}, non conteggiati nei due monte ore.`
    : "";
}

function renderPerClasse() {
  const map = new Map();
  for (const e of entriesAnno()) {
    const k = e.classe || "—";
    const r = map.get(k) || { A: 0, B: 0, X: 0 };
    r[TIPI[e.tipo]?.bucket || "X"] += durata(e);
    map.set(k, r);
  }
  $("sez-classi").hidden = map.size === 0;
  const rows = [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "it", { numeric: true }))
    .map(([classe, r]) => el("tr", {},
      el("td", {}, classe),
      el("td", {}, r.B ? fmt(r.B) : "—"),
      el("td", {}, r.A ? fmt(r.A) : "—"),
      el("td", {}, r.X ? fmt(r.X) : "—"),
      el("td", { class: "tot" }, fmt(r.A + r.B + r.X))
    ));
  $("per-classe").replaceChildren(...rows);
}

function renderElenco() {
  const filtro = $("filtro").value;
  const list = entriesAnno()
    .filter((e) => !filtro || TIPI[e.tipo]?.bucket === filtro)
    .sort((a, b) => (b.data + b.inizio).localeCompare(a.data + a.inizio));
  const box = $("elenco");
  if (!list.length) {
    box.replaceChildren(el("p", { class: "vuoto" },
      state.entries.length ? "Nessun impegno per questo filtro." : "Ancora nessun impegno. Aggiungi il primo dal modulo qui sopra."));
    return;
  }
  const out = [];
  let mese = null, meseTot = 0, meseHead = null;
  const chiudiMese = () => { if (meseHead) meseHead.lastChild.textContent = fmt(meseTot); };
  for (const e of list) {
    const [y, m, d] = e.data.split("-").map(Number);
    const key = `${y}-${m}`;
    if (key !== mese) {
      chiudiMese();
      mese = key; meseTot = 0;
      meseHead = el("h3", { class: "mese" }, el("span", {}, `${MESI[m - 1]} ${y}`), el("span"));
      out.push(meseHead);
    }
    meseTot += durata(e);
    const tipo = TIPI[e.tipo] || { label: e.tipo, bucket: "X" };
    const giorno = GIORNI[new Date(y, m - 1, d).getDay()];
    const del = el("button", { type: "button", class: "ghost danger", "aria-label": `Elimina ${tipo.label} del ${d}/${m}` }, "Elimina");
    del.addEventListener("click", () => confermaElimina(del, e));
    out.push(el("div", { class: "riga" },
      el("div", { class: "giorno" }, `${d} ${MESI[m - 1].slice(0, 3)}`, el("small", {}, giorno)),
      el("div", { class: "cosa" },
        el("span", { class: `chip ${tipo.bucket}` }, tipo.label),
        e.classe ? el("span", { class: "classe" }, e.classe) : null,
        el("span", { class: "orario" }, `${e.inizio}–${e.fine}`),
        e.note ? el("span", { class: "nota" }, e.note) : null
      ),
      el("div", { class: "azioni" },
        el("span", { class: "dur" }, fmt(durata(e))),
        el("button", { type: "button", class: "ghost", onclick: () => modifica(e), "aria-label": `Modifica ${tipo.label} del ${d}/${m}` }, "Modifica"),
        del
      )
    ));
  }
  chiudiMese();
  box.replaceChildren(...out);
}

function renderClassiSuggerite() {
  const classi = [...new Set(state.entries.map((e) => e.classe).filter(Boolean))].sort((a, b) => a.localeCompare(b, "it", { numeric: true }));
  $("classi").replaceChildren(...classi.map((c) => el("option", { value: c })));
}

function render() {
  renderAnni();
  renderSummary();
  renderPerClasse();
  renderElenco();
  renderClassiSuggerite();
}

// ---------- form ----------
function aggiornaDurata() {
  const i = $("inizio").value, f = $("fine").value;
  const out = $("durata");
  if (i && f && toMin(f) > toMin(i)) out.textContent = `Durata: ${fmt(toMin(f) - toMin(i))}`;
  else out.textContent = "";
  $("tipo-hint").textContent = BUCKET_HINT[TIPI[$("tipo").value].bucket];
}

function resetForm() {
  state.editing = null;
  const tipo = $("tipo").value;
  $("form").reset();
  $("tipo").value = tipo; // keep last type: consigli usually come in a row
  $("data").value = oggi();
  $("form-title").textContent = "Nuovo impegno";
  $("salva").textContent = "Aggiungi";
  $("annulla").hidden = true;
  $("errore").textContent = "";
  aggiornaDurata();
}

function modifica(e) {
  state.editing = e.id;
  $("tipo").value = e.tipo;
  $("classe").value = e.classe;
  $("data").value = e.data;
  $("inizio").value = e.inizio;
  $("fine").value = e.fine;
  $("note").value = e.note || "";
  $("form-title").textContent = "Modifica impegno";
  $("salva").textContent = "Salva modifiche";
  $("annulla").hidden = false;
  $("errore").textContent = "";
  aggiornaDurata();
  $("form").scrollIntoView({ behavior: "smooth", block: "center" });
  $("classe").focus({ preventScroll: true });
}

function confermaElimina(btn, e) {
  if (btn.dataset.armed) {
    elimina(e);
    return;
  }
  btn.dataset.armed = "1";
  btn.textContent = "Conferma";
  setTimeout(() => { delete btn.dataset.armed; btn.textContent = "Elimina"; }, 3000);
}

async function elimina(e) {
  try {
    await api(`/api/entries/${e.id}`, { method: "DELETE" });
    state.entries = state.entries.filter((x) => x.id !== e.id);
    if (state.editing === e.id) resetForm();
    render();
    toast("Impegno eliminato");
  } catch (err) {
    toast(err.message);
  }
}

async function salva(ev) {
  ev.preventDefault();
  const body = {
    tipo: $("tipo").value,
    classe: $("classe").value.trim(),
    data: $("data").value,
    inizio: $("inizio").value,
    fine: $("fine").value,
    note: $("note").value.trim()
  };
  const err = $("errore");
  if (!body.data) return (err.textContent = "Inserisci la data.");
  if (!body.inizio || !body.fine) return (err.textContent = "Inserisci ora di inizio e ora di fine.");
  if (toMin(body.fine) <= toMin(body.inizio)) return (err.textContent = "L'ora di fine deve venire dopo l'ora di inizio.");
  if (TIPI[body.tipo].bucket === "B" && !body.classe) return (err.textContent = "Per un consiglio di classe indica la classe.");
  err.textContent = "";
  $("salva").disabled = true;
  try {
    if (state.editing) {
      const saved = await api(`/api/entries/${state.editing}`, { method: "PUT", body });
      state.entries = state.entries.map((x) => (x.id === saved.id ? saved : x));
      toast("Modifiche salvate");
    } else {
      const saved = await api("/api/entries", { method: "POST", body });
      state.entries.push(saved);
      toast(`Aggiunto: ${fmt(durata(saved))}`);
    }
    state.anno = annoDi(body.data);
    resetForm();
    render();
  } catch (e) {
    err.textContent = e.message;
  } finally {
    $("salva").disabled = false;
  }
}

// ---------- CSV ----------
function esportaCsv() {
  const rows = [["Data", "Tipo", "Monte ore", "Classe", "Inizio", "Fine", "Minuti", "Ore", "Note"]];
  const nomeBucket = { A: "Collegio e programmazione", B: "Consigli di classe", X: "Fuori monte ore" };
  for (const e of entriesAnno().sort((a, b) => (a.data + a.inizio).localeCompare(b.data + b.inizio))) {
    const t = TIPI[e.tipo];
    const min = durata(e);
    rows.push([e.data, t.label, nomeBucket[t.bucket], e.classe, e.inizio, e.fine, min, (min / 60).toFixed(2).replace(".", ","), e.note || ""]);
  }
  // Semicolon + BOM so Excel in Italian locale opens it straight away.
  const csv = "﻿" + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = el("a", { href: url, download: `ore-funzionali-${state.anno}-${state.anno + 1}.csv` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- settings ----------
function apriImpostazioni() {
  $("limiteA").value = state.settings.limiteA;
  $("limiteB").value = state.settings.limiteB;
  $("dlg-impostazioni").showModal();
}
async function chiudiImpostazioni() {
  const dlg = $("dlg-impostazioni");
  if (dlg.returnValue !== "ok") return;
  try {
    state.settings = await api("/api/settings", {
      method: "PUT",
      body: { limiteA: Number($("limiteA").value), limiteB: Number($("limiteB").value) }
    });
    renderSummary();
    toast("Limiti aggiornati");
  } catch (e) {
    toast(e.message);
  }
}

// ---------- boot ----------
async function init() {
  $("tipo").replaceChildren(...Object.entries(TIPI).map(([k, t]) => el("option", { value: k }, t.label)));
  $("data").value = oggi();
  state.anno = annoDi(oggi());
  aggiornaDurata();

  $("form").addEventListener("submit", salva);
  $("annulla").addEventListener("click", resetForm);
  for (const id of ["inizio", "fine", "tipo"]) $(id).addEventListener("input", aggiornaDurata);
  $("anno").addEventListener("change", (e) => { state.anno = Number(e.target.value); render(); });
  $("filtro").addEventListener("change", renderElenco);
  $("csv").addEventListener("click", esportaCsv);
  $("btn-impostazioni").addEventListener("click", apriImpostazioni);
  $("dlg-impostazioni").addEventListener("close", chiudiImpostazioni);

  try {
    const [entries, settings] = await Promise.all([api("/api/entries"), api("/api/settings")]);
    state.entries = entries;
    state.settings = settings;
  } catch (e) {
    toast(`Impossibile caricare i dati: ${e.message}`);
  }
  render();
}
init();
