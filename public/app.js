// Ore Funzionali — frontend. Bucket A = art. 29 c.3 lett. a (collegio & co.),
// B = lett. b (consigli di classe), X = outside both 40-hour caps.
const TIPI = {
  consiglio:      { label: "Consiglio di classe",       short: "Consiglio",      bucket: "B" },
  collegio:       { label: "Collegio docenti",          short: "Collegio",       bucket: "A" },
  dipartimento:   { label: "Riunione di dipartimento",  short: "Dipartimento",   bucket: "A" },
  programmazione: { label: "Programmazione e verifica", short: "Programmazione", bucket: "A" },
  famiglie:       { label: "Incontro con le famiglie",  short: "Famiglie",       bucket: "A" },
  scrutinio:      { label: "Scrutinio",                 short: "Scrutinio",      bucket: "X" },
  esame:          { label: "Esame",                     short: "Esame",          bucket: "X" },
  altro:          { label: "Altro (fuori monte ore)",   short: "Altro",          bucket: "X" }
};
const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const GIORNI = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];

const $ = (id) => document.getElementById(id);
const state = { entries: [], settings: { limiteA: 40, limiteB: 40, classi: [] }, anno: null, editing: null, tipo: "consiglio" };

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
  if (res.status === 401) {
    location.replace("/login");
    throw new Error("Sessione scaduta");
  }
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

function render() {
  renderAnni();
  renderSummary();
  renderPerClasse();
  renderElenco();
  renderPills();
}

// ---------- form ----------
const DURATE = [30, 45, 60, 90, 120];
const fromMin = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
function spostaGiorni(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const x = new Date(y, m - 1, d + n);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

function pill(label, checked, onclick, cls = "") {
  return el("button", { type: "button", class: `pill ${cls}`, role: "radio", "aria-checked": String(checked), onclick }, label);
}

// Classes used most recently first, so the ones from this round of consigli are at hand.
function classiRecenti() {
  const seen = new Map();
  for (const e of [...state.entries].sort((a, b) => (b.data + b.inizio).localeCompare(a.data + a.inizio))) {
    if (e.classe && !seen.has(e.classe)) seen.set(e.classe, true);
  }
  return [...seen.keys()].slice(0, 12).sort((a, b) => a.localeCompare(b, "it", { numeric: true }));
}

function renderPills() {
  $("tipo").replaceChildren(...Object.entries(TIPI).map(([k, t]) =>
    pill(t.short, state.tipo === k, () => { state.tipo = k; renderPills(); }, t.bucket)));

  const classe = $("classe").value.trim();
  const mie = state.settings.classi || [];
  $("btn-classi-form").hidden = mie.length > 0;
  $("classe").placeholder = mie.length ? "Altra classe, non in elenco" : "Scrivi la classe, es. 3B";
  $("classi-pills").replaceChildren(...(mie.length ? mie : classiRecenti()).map((c) =>
    pill(c, c === classe, () => { $("classe").value = c === classe ? "" : c; renderPills(); })));

  const data = $("data").value, o = oggi();
  $("giorni-pills").replaceChildren(
    pill("Oggi", data === o, () => { $("data").value = o; renderPills(); }),
    pill("Ieri", data === spostaGiorni(o, -1), () => { $("data").value = spostaGiorni(o, -1); renderPills(); })
  );

  const i = $("inizio").value, f = $("fine").value;
  const dur = i && f ? toMin(f) - toMin(i) : null;
  $("durate-pills").replaceChildren(...DURATE.map((m) =>
    pill(fmt(m), dur === m, () => impostaDurata(m))));

  $("durata").textContent = dur > 0 ? `Durata: ${fmt(dur)}` : "";
}

function impostaDurata(m) {
  const i = $("inizio").value;
  if (!i) {
    $("errore").textContent = "Prima scegli l'ora di inizio.";
    $("inizio").focus();
    return;
  }
  $("fine").value = fromMin(Math.min(toMin(i) + m, 23 * 60 + 55));
  $("errore").textContent = "";
  renderPills();
}

function mostraNota(show) {
  $("campo-nota").hidden = !show;
  $("btn-nota").hidden = show;
}

// After adding, keep type and date and chain the next slot on from the last one:
// consigli di classe usually run back to back with the same length.
function prossimo(saved) {
  state.editing = null;
  $("classe").value = "";
  $("note").value = "";
  mostraNota(false);
  if (saved) {
    const len = durata(saved);
    $("inizio").value = saved.fine;
    $("fine").value = fromMin(Math.min(toMin(saved.fine) + len, 23 * 60 + 55));
    if ($("fine").value <= $("inizio").value) $("fine").value = "";
  }
  $("form-title").textContent = "Nuovo impegno";
  $("salva").textContent = "Aggiungi";
  $("annulla").hidden = true;
  $("errore").textContent = "";
  renderPills();
}

function resetForm() {
  state.editing = null;
  $("form").reset();
  $("data").value = oggi();
  prossimo(null);
}

function modifica(e) {
  state.editing = e.id;
  state.tipo = e.tipo;
  $("classe").value = e.classe;
  $("data").value = e.data;
  $("inizio").value = e.inizio;
  $("fine").value = e.fine;
  $("note").value = e.note || "";
  mostraNota(Boolean(e.note));
  $("form-title").textContent = "Modifica impegno";
  $("salva").textContent = "Salva modifiche";
  $("annulla").hidden = false;
  $("errore").textContent = "";
  renderPills();
  $("form").scrollIntoView({ behavior: "smooth", block: "start" });
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
    tipo: state.tipo,
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
      state.anno = annoDi(body.data);
      resetForm();
    } else {
      const saved = await api("/api/entries", { method: "POST", body });
      state.entries.push(saved);
      toast(`Aggiunto ${saved.classe || TIPI[saved.tipo].short}: ${fmt(durata(saved))}`);
      state.anno = annoDi(body.data);
      prossimo(saved);
    }
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

// ---------- le mie classi ----------
const ordina = (xs) => [...xs].sort((a, b) => a.localeCompare(b, "it", { numeric: true }));

function renderListaClassi() {
  $("lista-classi").replaceChildren(...(state.settings.classi || []).map((c) =>
    el("li", {}, c, el("button", { type: "button", "aria-label": `Rimuovi ${c}`, onclick: () => salvaClassi(state.settings.classi.filter((x) => x !== c)) }, "×"))));
}

async function salvaClassi(classi) {
  try {
    state.settings = await api("/api/settings", { method: "PUT", body: { classi: ordina(new Set(classi)) } });
    renderListaClassi();
    renderPills();
  } catch (e) {
    toast(e.message);
  }
}

function aggiungiClassi() {
  const input = $("nuova-classe");
  const nuove = input.value.split(/[,;\n]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (!nuove.length) return;
  input.value = "";
  input.focus();
  salvaClassi([...(state.settings.classi || []), ...nuove]);
}

function apriClassi() {
  renderListaClassi();
  $("dlg-classi").showModal();
  $("nuova-classe").focus();
}

// ---------- boot ----------
async function init() {
  $("data").value = oggi();
  state.anno = annoDi(oggi());
  renderPills();

  $("form").addEventListener("submit", salva);
  $("annulla").addEventListener("click", resetForm);
  for (const id of ["inizio", "fine", "data", "classe"]) $(id).addEventListener("input", renderPills);
  $("btn-nota").addEventListener("click", () => { mostraNota(true); $("note").focus(); });
  $("anno").addEventListener("change", (e) => { state.anno = Number(e.target.value); render(); });
  $("filtro").addEventListener("change", renderElenco);
  $("csv").addEventListener("click", esportaCsv);
  $("btn-impostazioni").addEventListener("click", apriImpostazioni);
  $("btn-classi").addEventListener("click", apriClassi);
  $("btn-esci").addEventListener("click", async () => {
    await fetch("/api/logout", { method: "POST" }).catch(() => {});
    location.replace("/login");
  });
  $("btn-classi-form").addEventListener("click", apriClassi);
  $("btn-aggiungi-classe").addEventListener("click", aggiungiClassi);
  $("nuova-classe").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); aggiungiClassi(); } });
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
