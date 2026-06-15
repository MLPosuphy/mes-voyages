/* ============================================================
   Mes Voyages — fonctionnalités complémentaires (vague 1)
   Calendrier annuel, thèmes, raccourcis clavier, enveloppes
   budget, courbe des dépenses, remboursements, devise locale,
   menu mobile. Chargé après album.js, avant family.js.
   ============================================================ */

"use strict";

/* ===================== Filet de sécurité : erreurs JS ===================== */
/* Si une erreur inattendue survient, on prévient discrètement au lieu de figer l'app. */

window.addEventListener("error", e => {
  if (e.message && /ResizeObserver|Script error/i.test(e.message)) return; // bruits connus inoffensifs
  try { toast("⚠️ Une action a échoué — réessaie. (" + (e.message || "erreur") + ")"); } catch (_) {}
});
window.addEventListener("unhandledrejection", () => {
  // promesses rejetées non gérées : silencieux (souvent réseau hors ligne), mais on évite le crash
});

/* ===================== Fond de carte moderne (CARTO) ===================== */
/* Tuiles épurées façon app de voyage ; variante sombre selon le thème. */

function baseTiles(map, maxZoom) {
  const dark = (state.settings.theme === "dark");
  const style = dark ? "dark_all" : "voyager";
  return L.tileLayer(`https://{s}.basemaps.cartocdn.com/rastertiles/${style}/{z}/{x}/{y}{r}.png`, {
    maxZoom: maxZoom || 19,
    subdomains: "abcd",
    attribution: "© OpenStreetMap · © CARTO"
  }).addTo(map);
}

/* ===================== Routage sur routes réelles (OSRM) ===================== */
/* Pour les transports terrestres, le trajet suit les vraies routes avec un temps précis.
   Avion/bateau restent en ligne droite (grand cercle) ; le train reste estimé (pas de
   routeur rail gratuit). Cache persistant hors du carnet famille (localStorage séparé). */

const OSRM_PROFILE = { voiture: "routed-car", bus: "routed-car", velo: "routed-bike", pied: "routed-foot" };
const BUS_FACTOR = 1.3; // un bus s'arrête : ~30 % plus lent que la voiture sur le même tracé

let _routeCache = {};
try { _routeCache = JSON.parse(localStorage.getItem("mesVoyages.routes") || "{}"); } catch (e) { _routeCache = {}; }

function saveRouteCache() {
  try {
    // on plafonne le cache pour ne pas remplir le stockage
    const keys = Object.keys(_routeCache);
    if (keys.length > 120) keys.slice(0, keys.length - 120).forEach(k => delete _routeCache[k]);
    localStorage.setItem("mesVoyages.routes", JSON.stringify(_routeCache));
  } catch (e) { /* stockage plein : tant pis pour le cache */ }
}

function routeSig(a, b, transport) {
  const r = n => Math.round(n * 1e5) / 1e5;
  return `${r(a.lat)},${r(a.lng)}>${r(b.lat)},${r(b.lng)}:${transport}`;
}

async function fetchRoute(a, b, transport) {
  const base = OSRM_PROFILE[transport];
  if (!base) return null; // avion/bateau/train : pas de routage routier
  const url = `https://routing.openstreetmap.de/${base}/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`;
  const d = await (await fetch(url)).json();
  if (d.code !== "Ok" || !d.routes || !d.routes[0]) return null;
  const r = d.routes[0];
  let dur = r.duration / 3600;
  if (transport === "bus") dur *= BUS_FACTOR;
  return { coords: r.geometry.coordinates.map(c => [c[1], c[0]]), dist: r.distance / 1000, dur };
}

// Métriques d'un tronçon : routées si disponibles, sinon estimation (haversine + vitesse)
function legMetrics(prev, s) {
  if (OSRM_PROFILE[s.transport]) {
    const cached = _routeCache[routeSig(prev, s, s.transport)];
    if (cached && cached.coords) return { dist: cached.dist, dur: cached.dur, routed: true };
  }
  const dist = haversineKm(prev, s);
  return { dist, dur: estimateLeg(dist, s.transport).h, routed: false };
}

// Géométrie d'un tronçon pour la carte : suit les routes si dispo, sinon ligne droite
function legGeom(prev, s) {
  if (OSRM_PROFILE[s.transport]) {
    const cached = _routeCache[routeSig(prev, s, s.transport)];
    if (cached && cached.coords) return cached.coords;
  }
  return [[prev.lat, prev.lng], [s.lat, s.lng]];
}

// Ligne descriptive d'un tronçon (distance · temps · CO₂), routée si possible
function legLineHTML(prev, s) {
  const m = legMetrics(prev, s);
  const x = TRANSPORT_EXTRA[s.transport] || TRANSPORT_EXTRA.voiture;
  const co2 = Math.round(m.dist * x.co2 / 1000);
  let tag = "";
  if (m.routed) tag = ` <span class="route-tag" title="Trajet calculé sur les vraies routes">🛣️ sur route</span>`;
  else if (OSRM_PROFILE[s.transport]) {
    const failed = (_routeCache[routeSig(prev, s, s.transport)] || {}).fail;
    tag = failed
      ? ` <span class="muted small" title="Calcul indisponible (hors ligne ?)">📏 à vol d'oiseau</span>`
      : ` <span class="muted small">⏳ calcul du trajet…</span>`;
  }
  return `· ${fmtKm(m.dist)} depuis ${esc(prev.name)} · ⏱️ ~${fmtH(m.dur)}${co2 ? ` · 🌱 ${co2} kg CO₂/pers` : " · 🌱 0 💚"}${tag}`;
}

// Récupère (silencieusement) les routes manquantes et met à jour le cache. Renvoie true si du nouveau.
async function ensureRoutesCached(t) {
  const steps = t.steps || [];
  let changed = false;
  for (let i = 1; i < steps.length; i++) {
    const prev = steps[i - 1], s = steps[i];
    if (!OSRM_PROFILE[s.transport]) continue;
    const sig = routeSig(prev, s, s.transport);
    if (_routeCache[sig]) continue; // déjà en cache (succès ou échec)
    try {
      const r = await fetchRoute(prev, s, s.transport);
      _routeCache[sig] = r || { fail: true };
      if (r) changed = true;
    } catch (e) {
      _routeCache[sig] = { fail: true }; // hors ligne : on réessaiera plus tard (vidage manuel)
    }
  }
  if (changed) saveRouteCache();
  return changed;
}

// Récupère en arrière-plan les routes manquantes, puis un seul re-render de la carte
async function hydrateRoutes(t) {
  const changed = await ensureRoutesCached(t);
  if (changed && currentTab === "carte" && currentTripId === t.id && document.getElementById("map")) {
    renderTripDetail(document.getElementById("main"));
  }
}

// Vide le cache des échecs pour réessayer (ex. retour de connexion)
function retryRoutes(tripId) {
  Object.keys(_routeCache).forEach(k => { if (_routeCache[k] && _routeCache[k].fail) delete _routeCache[k]; });
  saveRouteCache();
  const t = getTrip(tripId);
  toast("🔄 Nouvelle tentative de calcul des trajets…");
  hydrateRoutes(t);
}

/* ===================== Ouvrir une étape dans Maps ===================== */

function openStepInMaps(tripId, stepId) {
  const s = getTrip(tripId).steps.find(x => x.id === stepId);
  if (!s) return;
  window.open(`https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`, "_blank");
}

/* ===================== Copier du texte (numéros de réservation…) ===================== */

function copyDoc(tripId, docId) {
  const d = (getTrip(tripId).documents || []).find(x => x.id === docId);
  if (!d) return;
  const txt = d.title + "\n" + d.content;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt).then(() => toast("📋 Copié dans le presse-papier"), () => toast("❌ Copie impossible"));
  } else {
    // Repli pour les navigateurs sans API clipboard (ou hors https)
    const ta = document.createElement("textarea");
    ta.value = txt; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); toast("📋 Copié !"); } catch (e) { toast("❌ Copie impossible"); }
    document.body.removeChild(ta);
  }
}

/* ===================== Menu mobile (burger) ===================== */

function toggleSidebar() {
  document.querySelector(".sidebar").classList.toggle("open");
}

// Sur mobile, choisir une vue referme le menu
document.addEventListener("click", e => {
  if (window.innerWidth > 640) return;
  const sb = document.querySelector(".sidebar");
  if (sb && sb.classList.contains("open") && e.target.closest(".nav-btn, .logo")) {
    sb.classList.remove("open");
  }
});

/* ===================== Thèmes de couleurs ===================== */

const THEMES = {
  light: "☀️ Clair",
  dark:  "🌙 Sombre",
  ocean: "🌊 Océan",
  sable: "🏖️ Sable",
  foret: "🌲 Forêt"
};

function setTheme(key) {
  state.settings.theme = key;
  saveState();
  applyTheme();
  renderSettings(document.getElementById("main"));
  toast(THEMES[key] + " appliqué");
}

function themePickerHTML() {
  const cur = state.settings.theme || "light";
  return `<div class="card" style="margin-bottom:18px;max-width:560px;">
    <h3>🎨 Apparence</h3>
    <div class="filters" style="margin:12px 0 0;">
      ${Object.entries(THEMES).map(([k, label]) =>
        `<button class="chip ${cur === k ? "active" : ""}" onclick="setTheme('${k}')">${label}</button>`).join("")}
    </div>
    <p class="muted small" style="margin-top:10px;">⌨️ Raccourcis clavier : <b>N</b> nouveau voyage · <b>D</b> dépense rapide · <b>C</b> calendrier · <b>/</b> recherche · <b>Échap</b> fermer.</p>
  </div>`;
}

/* ===================== Raccourcis clavier ===================== */

document.addEventListener("keydown", e => {
  // Navigation du diaporama
  if (window._slide) {
    if (e.key === "Escape") closeSlideshow();
    else if (e.key === "ArrowRight") slideMove(1);
    else if (e.key === "ArrowLeft") slideMove(-1);
    else if (e.key === " ") { e.preventDefault(); slideToggle(); }
    return;
  }
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  const tag = (e.target.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable) return;
  if (document.getElementById("modal-overlay").classList.contains("open")) return;
  const k = e.key.toLowerCase();
  if (k === "n") { e.preventDefault(); openTripForm(); }
  else if (k === "d") { e.preventDefault(); quickExpense(); }
  else if (k === "c") { e.preventDefault(); showView("calendrier"); }
  else if (k === "/") {
    e.preventDefault();
    const s = document.querySelector(".sidebar-search");
    if (s) { document.querySelector(".sidebar").classList.add("open"); s.focus(); }
  }
});

/* ===================== Vue Calendrier annuel ===================== */

function renderCalendar(main) {
  const year = window._calYear || +todayISO().slice(0, 4);
  window._calYear = year;
  const today = todayISO();
  const trips = state.trips.filter(t => t.start && t.end);
  const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
  const dows = ["L", "M", "M", "J", "V", "S", "D"];

  let daysTravel = 0, daysOverlap = 0;
  const months = monthNames.map((name, m) => {
    const startDow = (new Date(year, m, 1).getDay() + 6) % 7; // lundi = 0
    const nd = new Date(year, m + 1, 0).getDate();
    let cells = `<div class="cal-days">${dows.map(d => `<span class="cal-dow">${d}</span>`).join("")}`;
    cells += `<span></span>`.repeat(startDow);
    for (let d = 1; d <= nd; d++) {
      const iso = year + "-" + String(m + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
      const covering = trips.filter(t => t.start <= iso && iso <= t.end);
      if (covering.length) daysTravel++;
      if (covering.length > 1) daysOverlap++;
      const cls = "cal-cell" + (covering.length ? " trip" : "") + (covering.length > 1 ? " multi" : "") + (iso === today ? " today" : "");
      const style = covering.length ? `style="background:${esc(covering[0].color || "#4f6df5")}"` : "";
      const title = covering.length ? `title="${esc(covering.map(t => t.title).join(" + "))}"` : "";
      const click = covering.length ? `onclick="openTrip('${covering[0].id}')"` : "";
      cells += `<span class="${cls}" ${style} ${title} ${click}>${d}</span>`;
    }
    cells += `</div>`;
    return `<div class="card cal-month"><b class="small">${name}</b>${cells}</div>`;
  }).join("");

  const yearTrips = trips
    .filter(t => t.start.slice(0, 4) <= String(year) && String(year) <= t.end.slice(0, 4))
    .sort((a, b) => a.start.localeCompare(b.start));
  const legend = yearTrips.map(t =>
    `<span class="country-chip" style="border-left:4px solid ${esc(t.color || "#4f6df5")};cursor:pointer;" onclick="openTrip('${t.id}')">
      ${flagFor(t.country)} ${esc(t.title)} <span class="muted small">· ${fmtDateShort(t.start)} → ${fmtDateShort(t.end)}</span></span>`).join(" ");

  main.innerHTML = `
    <div class="row-between" style="margin-bottom:6px;">
      <div><h1 class="page-title">📅 Calendrier ${year}</h1>
        <p class="page-sub">${daysTravel} jour${daysTravel > 1 ? "s" : ""} de voyage cette année-là${daysOverlap ? ` · ⚠️ ${daysOverlap} jour(s) avec des voyages qui se chevauchent !` : ""}</p></div>
      <div class="row">
        <button class="btn btn-secondary btn-sm" onclick="window._calYear=${year - 1};renderCalendar(document.getElementById('main'))">← ${year - 1}</button>
        <button class="btn btn-ghost btn-sm" onclick="window._calYear=${+todayISO().slice(0, 4)};renderCalendar(document.getElementById('main'))">Aujourd'hui</button>
        <button class="btn btn-secondary btn-sm" onclick="window._calYear=${year + 1};renderCalendar(document.getElementById('main'))">${year + 1} →</button>
      </div>
    </div>
    ${legend ? `<div style="margin-bottom:16px;display:flex;flex-wrap:wrap;gap:6px;">${legend}</div>` : ""}
    <div class="cal-grid">${months}</div>
    ${!yearTrips.length ? `<div class="empty-state card" style="margin-top:18px;"><span class="big-emoji">🗓️</span><p>Aucun voyage daté en ${year}.<br>Les voyages avec dates apparaissent automatiquement ici.</p></div>` : ""}
  `;
}

/* ===================== Taux de change partagés ===================== */

async function ratesGet() {
  let cache = JSON.parse(localStorage.getItem("mesVoyages.rates") || "null");
  if (!cache || cache.date !== todayISO()) {
    const d = await (await fetch("https://open.er-api.com/v6/latest/EUR")).json();
    if (d.result !== "success") throw new Error("api");
    cache = { date: todayISO(), rates: d.rates };
    localStorage.setItem("mesVoyages.rates", JSON.stringify(cache));
  }
  return cache.rates;
}

/* ===================== Enveloppes budget par catégorie ===================== */

function openEnvelopesForm(tripId) {
  const t = getTrip(tripId);
  const env = t.catBudgets || {};
  openModal("🎯 Enveloppes par catégorie", `
    <p class="muted small" style="margin-bottom:14px;">Fixe un plafond par catégorie : chaque jauge de la répartition montrera où tu en es. Laisse vide pour aucune limite.</p>
    ${Object.entries(CAT_DEPENSES).map(([k, c]) => `
      <div class="form-row" style="align-items:center;">
        <label style="flex:1;">${c.emoji} ${c.label}</label>
        <input id="env-${k}" type="number" min="0" step="10" placeholder="—" value="${env[k] || ""}" style="max-width:140px;">
      </div>`).join("")}
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="saveEnvelopes('${tripId}')">Enregistrer</button>
    </div>`);
}

function saveEnvelopes(tripId) {
  const t = getTrip(tripId);
  t.catBudgets = {};
  Object.keys(CAT_DEPENSES).forEach(k => {
    const v = +document.getElementById("env-" + k).value;
    if (v > 0) t.catBudgets[k] = v;
  });
  saveState();
  closeModal();
  renderTripDetail(document.getElementById("main"));
  toast("🎯 Enveloppes enregistrées");
}

/* ===================== Courbe des dépenses cumulées ===================== */

function spendingCurveHTML(t) {
  const exp = (t.expenses || []).filter(e => e.date).slice().sort((a, b) => a.date.localeCompare(b.date));
  if (exp.length < 2) return "";
  const first = t.start && t.start < exp[0].date ? t.start : exp[0].date;
  const last = t.end && t.end > exp[exp.length - 1].date ? t.end : exp[exp.length - 1].date;
  const span = Math.max(1, daysBetween(first, last));

  // points cumulés par jour
  const byDay = {};
  exp.forEach(e => { byDay[e.date] = (byDay[e.date] || 0) + (+e.amount || 0); });
  let cum = 0;
  const pts = Object.keys(byDay).sort().map(d => { cum += byDay[d]; return { d, v: cum }; });
  const total = cum;
  const maxY = Math.max(total, +t.budget || 0) || 1;

  const W = 640, H = 170, padL = 8, padR = 8, padT = 12, padB = 20;
  const X = d => padL + daysBetween(first, d) / span * (W - padL - padR);
  const Y = v => H - padB - v / maxY * (H - padT - padB);

  let path = `M ${X(first)} ${Y(0)}`;
  pts.forEach(p => { path += ` L ${X(p.d).toFixed(1)} ${Y(p.v).toFixed(1)}`; });

  const budgetLine = +t.budget > 0
    ? `<line x1="${padL}" y1="${Y(0)}" x2="${W - padR}" y2="${Y(t.budget)}" stroke="var(--text-soft)" stroke-width="1.5" stroke-dasharray="6 5" opacity="0.6"/>
       <text x="${W - padR - 4}" y="${(Y(t.budget) - 5).toFixed(1)}" font-size="10" fill="var(--text-soft)" text-anchor="end">rythme idéal (${fmtMoney(t.budget)})</text>`
    : "";
  const dots = pts.map(p => `<circle cx="${X(p.d).toFixed(1)}" cy="${Y(p.v).toFixed(1)}" r="3" fill="${t.color || "#4f6df5"}"><title>${fmtDateShort(p.d)} : ${fmtMoney(p.v)} cumulés</title></circle>`).join("");

  return `<div class="card" style="margin-top:18px;">
    <h3>📈 Le rythme des dépenses</h3>
    <p class="muted small" style="margin:6px 0 10px;">Cumul jour par jour${+t.budget > 0 ? " — la ligne pointillée est le rythme idéal pour finir pile au budget" : ""}.</p>
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;">
      ${budgetLine}
      <path d="${path}" fill="none" stroke="${t.color || "#4f6df5"}" stroke-width="2.5" stroke-linejoin="round"/>
      ${dots}
      <text x="${padL}" y="${H - 6}" font-size="10" fill="var(--text-soft)">${fmtDateShort(first)}</text>
      <text x="${W - padR}" y="${H - 6}" font-size="10" fill="var(--text-soft)" text-anchor="end">${fmtDateShort(last)}</text>
    </svg>
  </div>`;
}

/* ===================== Remboursements (transferts réglés) ===================== */

// Calcule les transferts suggérés à partir des soldes nets, avec les identifiants
function computeSettlements(nets) {
  const out = [];
  const debtors = nets.filter(n => n.net < -0.01).map(n => ({ ...n }));
  const creditors = nets.filter(n => n.net > 0.01).map(n => ({ ...n }));
  debtors.sort((a, b) => a.net - b.net);
  creditors.sort((a, b) => b.net - a.net);
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(-debtors[i].net, creditors[j].net);
    out.push({ from: debtors[i].p, to: creditors[j].p, amount });
    debtors[i].net += amount;
    creditors[j].net -= amount;
    if (debtors[i].net > -0.01) i++;
    if (creditors[j].net < 0.01) j++;
  }
  return out;
}

function recordTransfer(tripId, fromId, toId, amount) {
  const t = getTrip(tripId);
  t.transfers = t.transfers || [];
  t.transfers.push({ id: uid(), from: fromId, to: toId, amount: +amount, date: todayISO() });
  saveState();
  renderTripDetail(document.getElementById("main"));
  toast("✅ Remboursement noté — les comptes sont à jour !");
}

function deleteTransfer(tripId, id) {
  const t = getTrip(tripId);
  t.transfers = (t.transfers || []).filter(x => x.id !== id);
  saveState();
  renderTripDetail(document.getElementById("main"));
  toast("🗑️ Remboursement annulé");
}

/* ===================== Import auto des photos dans le journal (date EXIF) ===================== */

async function importJournalPhotos(tripId, input) {
  const t = getTrip(tripId);
  t.journal = t.journal || [];
  toast("⏳ Lecture des photos…");
  let added = 0, dated = 0, skipped = 0;
  const db = await fdb();
  for (const f of input.files) {
    if (!f.type.startsWith("image/")) { skipped++; continue; }
    const meta = await readExifMeta(f).catch(() => null);
    const date = meta && meta.date ? meta.date : todayISO();
    if (meta && meta.date) dated++;
    // entrée existante du même jour, sinon on en crée une
    let entry = t.journal.find(j => j.date === date);
    if (!entry) {
      entry = { id: uid(), title: "📸 Photos du " + fmtDateShort(date), date, mood: "🙂", content: "" };
      t.journal.push(entry);
    }
    const norm = await normalizeFileBlob(f);
    if (!norm) { skipped++; continue; }
    await new Promise((res, rej) => {
      const tx = db.transaction("files", "readwrite");
      tx.objectStore("files").put({ id: uid(), owner: entry.id, name: f.name, type: norm.type, blob: norm.blob });
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
    added++;
  }
  input.value = "";
  saveState();
  renderTripDetail(document.getElementById("main"));
  if (added) toast(`📸 ${added} photo(s) rangée(s) dans le journal — ${dated} datée(s) automatiquement (EXIF)`);
  else toast("Aucune photo importée" + (skipped ? ` (${skipped} fichier(s) ignoré(s))` : ""));
}

/* ===================== Diaporama plein écran ===================== */

async function collectTripImages(t) {
  const items = [];
  const push = async (owner, caption) => {
    try {
      (await fdbList(owner)).filter(f => f.type && f.type.startsWith("image/"))
        .forEach(f => items.push({ blob: f.blob, caption }));
    } catch (e) {}
  };
  const journal = (t.journal || []).slice().sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  for (const j of journal) await push(j.id, `${j.mood || "📔"} ${j.title} — ${fmtDate(j.date)}`);
  for (const s of (t.steps || [])) await push(s.id, "🧭 " + s.name);
  for (const p of (t.geophotos || [])) {
    try { const r = await fdbGet(p.id); if (r) items.push({ blob: r.blob, caption: "📷 " + p.name }); } catch (e) {}
  }
  return items;
}

function _openSlideshow(items) {
  if (!items || !items.length) { toast("Aucune photo à afficher 📷"); return; }
  closeSlideshow();
  window._slide = { items, i: 0, urls: items.map(x => URL.createObjectURL(x.blob)), timer: null };
  const ov = document.createElement("div");
  ov.className = "slideshow";
  ov.id = "slideshow";
  ov.innerHTML = `
    <img id="slide-img" alt="">
    <div class="slide-caption" id="slide-caption"></div>
    <div class="slide-count" id="slide-count"></div>
    <button class="slide-btn slide-prev" title="Précédente (←)" onclick="slideMove(-1)">‹</button>
    <button class="slide-btn slide-next" title="Suivante (→)" onclick="slideMove(1)">›</button>
    <button class="slide-btn slide-close" title="Fermer (Échap)" onclick="closeSlideshow()">✕</button>
    <button class="slide-btn slide-play" id="slide-play" title="Pause / lecture" onclick="slideToggle()">⏸</button>`;
  document.body.appendChild(ov);
  slideShowAt(0);
  window._slide.timer = setInterval(() => slideMove(1), 4000);
  if (ov.requestFullscreen) ov.requestFullscreen().catch(() => {});
}

async function startSlideshow(tripId) {
  const t = getTrip(tripId);
  toast("⏳ Préparation du diaporama…");
  const items = await collectTripImages(t);
  if (!items.length) { toast("Aucune photo dans ce voyage — ajoute des photos au journal ou à la carte 📷"); return; }
  _openSlideshow(items);
}

// 📺 Mode présentation : diaporama plein écran de TOUTES les photos (tous voyages), pour la télé
async function startPresentation() {
  toast("⏳ Préparation du mode présentation…");
  const done = (state.trips || []).filter(t => t.status === "termine" || t.status === "encours");
  const scope = done.length ? done : (state.trips || []);
  const items = [];
  for (const t of scope) {
    const imgs = await collectTripImages(t);
    imgs.forEach(x => items.push({ blob: x.blob, caption: `${flagFor(t.country)} ${t.title}${x.caption ? " — " + x.caption : ""}` }));
  }
  if (!items.length) { toast("Ajoute des photos à tes voyages pour lancer le mode présentation 📷"); return; }
  // petit mélange pour varier l'ordre
  for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; }
  _openSlideshow(items);
}

function slideShowAt(i) {
  const s = window._slide;
  if (!s) return;
  s.i = (i + s.items.length) % s.items.length;
  document.getElementById("slide-img").src = s.urls[s.i];
  document.getElementById("slide-caption").textContent = s.items[s.i].caption;
  document.getElementById("slide-count").textContent = (s.i + 1) + " / " + s.items.length;
}

function slideMove(d) { if (window._slide) slideShowAt(window._slide.i + d); }

function slideToggle() {
  const s = window._slide;
  if (!s) return;
  const btn = document.getElementById("slide-play");
  if (s.timer) { clearInterval(s.timer); s.timer = null; if (btn) btn.textContent = "▶"; }
  else { s.timer = setInterval(() => slideMove(1), 4000); if (btn) btn.textContent = "⏸"; }
}

function closeSlideshow() {
  const s = window._slide;
  if (!s) return;
  clearInterval(s.timer);
  s.urls.forEach(u => URL.revokeObjectURL(u));
  window._slide = null;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  const ov = document.getElementById("slideshow");
  if (ov) ov.remove();
}

/* ===================== 🧩 Collage photo automatique ===================== */

async function buildCollageCanvas(items) {
  const n = items.length;
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const cell = 320, gap = 8, pad = 20;
  const W = pad * 2 + cols * cell + (cols - 1) * gap;
  const H = pad * 2 + rows * cell + (rows - 1) * gap;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#0f172a"; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols), c = i % cols;
    const x = pad + c * (cell + gap), y = pad + r * (cell + gap);
    try {
      const bmp = await createImageBitmap(items[i].blob, { imageOrientation: "from-image" });
      const scale = Math.max(cell / bmp.width, cell / bmp.height);
      const dw = bmp.width * scale, dh = bmp.height * scale;
      ctx.save();
      ctx.beginPath(); ctx.rect(x, y, cell, cell); ctx.clip();
      ctx.drawImage(bmp, x + (cell - dw) / 2, y + (cell - dh) / 2, dw, dh);
      ctx.restore();
      bmp.close();
    } catch (e) { ctx.fillStyle = "#1e293b"; ctx.fillRect(x, y, cell, cell); }
  }
  return canvas;
}

async function generateCollage(tripId) {
  const t = getTrip(tripId);
  toast("⏳ Création du collage…");
  const items = await collectTripImages(t);
  if (items.length < 2) { toast("Ajoute au moins 2 photos au voyage pour faire un collage 🧩"); return; }
  const canvas = await buildCollageCanvas(items.slice(0, 25));
  canvas.toBlob(blob => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "collage-" + (t.title || "voyage").replace(/[^\w\sàâäéèêëîïôöùûüç-]/gi, "").trim().replace(/\s+/g, "-").toLowerCase() + ".jpg";
    a.click();
    URL.revokeObjectURL(a.href);
    toast("🧩 Collage téléchargé !");
  }, "image/jpeg", 0.9);
}

/* ===================== 🖼️ Affiche souvenir imprimable ===================== */

function buildPosterHTML(t, cover, strip) {
  const est = (typeof tripEstimates === "function") ? tripEstimates(t) : { km: 0, co2: 0 };
  const dur = tripDuration(t);
  const spent = (t.expenses || []).reduce((s, e) => s + (+e.amount || 0), 0);
  const stats = [
    [dur || "—", "jours"],
    [(t.steps || []).length, "étapes"],
    [Math.round(est.km).toLocaleString("fr-FR") + " km", "parcourus"],
    spent ? [fmtMoney(spent), "dépensé"] : [Math.round(est.co2) + " kg", "CO₂/pers"]
  ];
  const c = esc(t.color || "#4f6df5");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Affiche — ${esc(t.title)}</title>
  <style>
   @page{size:A4 portrait;margin:0}
   *{box-sizing:border-box;margin:0;font-family:'Segoe UI',system-ui,sans-serif}
   body{background:#e5e7eb;display:flex;justify-content:center;padding:20px}
   .poster{width:794px;min-height:1123px;background:linear-gradient(160deg,${c},${c}cc);color:#fff;display:flex;flex-direction:column}
   .cover{height:520px;background:#1e293b center/cover no-repeat;${cover ? `background-image:url(${cover})` : ""}}
   .body{padding:40px 48px;flex:1;display:flex;flex-direction:column}
   h1{font-size:54px;line-height:1.05;font-weight:800;margin-bottom:8px}
   .meta{font-size:20px;opacity:.92;margin-bottom:30px}
   .stats{display:flex;gap:14px;margin-bottom:30px}
   .stat{flex:1;background:rgba(255,255,255,.16);border-radius:18px;padding:18px;text-align:center}
   .stat b{display:block;font-size:30px}
   .stat span{font-size:14px;opacity:.85}
   .strip{display:flex;gap:10px;margin-top:auto}
   .strip img{flex:1;height:150px;object-fit:cover;border-radius:14px;min-width:0}
   .foot{text-align:center;font-size:14px;opacity:.8;margin-top:24px}
   @media print{body{background:#fff;padding:0}}
  </style></head><body>
   <div class="poster">
    <div class="cover"></div>
    <div class="body">
     <h1>${flagFor(t.country)} ${esc(t.title)}</h1>
     <div class="meta">📍 ${esc(t.destination || "")}${t.country ? " · " + esc(t.country) : ""}${t.start ? ` · ${fmtDate(t.start)} → ${fmtDate(t.end)}` : ""}</div>
     <div class="stats">${stats.map(s => `<div class="stat"><b>${s[0]}</b><span>${s[1]}</span></div>`).join("")}</div>
     ${strip.length ? `<div class="strip">${strip.map(u => `<img src="${u}">`).join("")}</div>` : ""}
     <div class="foot">✈️ Mes Voyages — souvenir imprimé</div>
    </div>
   </div>
  </body></html>`;
}

async function generatePoster(tripId) {
  const t = getTrip(tripId);
  toast("⏳ Création de l'affiche…");
  const imgs = await collectTripImages(t);
  const cover = imgs.length ? await blobToDataURL(imgs[0].blob, 1200, 0.85) : null;
  const strip = [];
  for (const it of imgs.slice(1, 5)) { const u = await blobToDataURL(it.blob, 600, 0.8); if (u) strip.push(u); }
  const w = window.open("", "_blank");
  if (!w) { toast("Autorise les pop-ups pour générer l'affiche 🖼️"); return; }
  w.document.write(buildPosterHTML(t, cover, strip));
  w.document.close();
  toast("🖼️ Affiche prête — imprime-la ou enregistre-la en PDF !");
}

/* ===================== Glisser-déposer des photos ===================== */
/* Tout élément portant data-dropowner accepte les fichiers déposés. */

// Vrai glisser de fichiers depuis l'OS (≠ réorganisation interne d'une activité)
function isFileDrag(e) {
  return e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files");
}

document.addEventListener("dragover", e => {
  if (!isFileDrag(e)) return;
  const zone = e.target.closest("[data-dropowner]");
  if (!zone) return;
  e.preventDefault();
  zone.classList.add("drop-hover");
});

document.addEventListener("dragleave", e => {
  const zone = e.target.closest("[data-dropowner]");
  if (zone && !zone.contains(e.relatedTarget)) zone.classList.remove("drop-hover");
});

document.addEventListener("drop", async e => {
  if (!isFileDrag(e)) return;
  const zone = e.target.closest("[data-dropowner]");
  if (!zone) return;
  e.preventDefault();
  zone.classList.remove("drop-hover");
  const files = [...(e.dataTransfer.files || [])].filter(f => f.type.startsWith("image/") || f.type === "application/pdf");
  if (!files.length) { toast("Dépose des images ou des PDF 📎"); return; }
  await attachFilesList(zone.dataset.dropowner, files);
});

/* ===================== Réorganisation des activités (glisser-déposer) ===================== */

// Assigne un ordre (ord) aux activités qui n'en ont pas, par heure, jour par jour
function ensureActOrd(t) {
  const byDate = {};
  (t.activities || []).forEach(a => (byDate[a.date] = byDate[a.date] || []).push(a));
  Object.values(byDate).forEach(list => {
    if (list.some(a => a.ord == null)) {
      list.sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
      list.forEach((a, i) => { if (a.ord == null) a.ord = i; });
    }
  });
}

// Ordre à donner à une nouvelle activité pour qu'elle se place par heure
function activityInsertOrd(t, date, time) {
  const same = (t.activities || []).filter(a => a.date === date && a.ord != null).sort((a, b) => a.ord - b.ord);
  if (!same.length) return 0;
  const tt = time || "99:99";
  for (let i = 0; i < same.length; i++) {
    if ((same[i].time || "99:99") > tt) return i === 0 ? same[0].ord - 1 : (same[i - 1].ord + same[i].ord) / 2;
  }
  return same[same.length - 1].ord + 1;
}

let _dragAct = null;

document.addEventListener("dragstart", e => {
  const row = e.target.closest("[data-act]");
  if (!row) return;
  _dragAct = { id: row.dataset.act };
  e.dataTransfer.effectAllowed = "move";
});

document.addEventListener("dragover", e => {
  const row = e.target.closest("[data-act]");
  if (row && _dragAct) { e.preventDefault(); row.classList.add("act-drop"); }
});

document.addEventListener("dragend", () => {
  document.querySelectorAll(".act-drop").forEach(r => r.classList.remove("act-drop"));
});

document.addEventListener("drop", e => {
  const row = e.target.closest("[data-act]");
  if (!row || !_dragAct) return;
  e.preventDefault();
  row.classList.remove("act-drop");
  if (row.dataset.act !== _dragAct.id) reorderActivity(currentTripId, _dragAct.id, row.dataset.act, row.dataset.actdate);
  _dragAct = null;
});

function reorderActivity(tripId, draggedId, targetId, targetDate) {
  const t = getTrip(tripId);
  const dragged = (t.activities || []).find(a => a.id === draggedId);
  if (!dragged) return;
  dragged.date = targetDate; // permet aussi de déplacer vers un autre jour
  const day = t.activities.filter(a => a.date === targetDate && a.id !== draggedId).sort((a, b) => (a.ord || 0) - (b.ord || 0));
  const ti = day.findIndex(a => a.id === targetId);
  day.splice(ti < 0 ? day.length : ti, 0, dragged);
  day.forEach((a, i) => a.ord = i);
  saveState();
  renderTripDetail(document.getElementById("main"));
  toast("↕️ Activité déplacée");
}

/* ===================== Position GPS d'une entrée de journal ===================== */

function captureJournalPos() {
  if (!navigator.geolocation) { toast("❌ Géolocalisation non disponible"); return; }
  const status = document.getElementById("j-geo-status");
  if (status) status.textContent = "⏳ localisation…";
  navigator.geolocation.getCurrentPosition(pos => {
    window._jpos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    const st = document.getElementById("j-geo-status");
    if (st) st.textContent = `enregistrée 📍 (${window._jpos.lat.toFixed(3)}, ${window._jpos.lng.toFixed(3)})`;
  }, () => {
    const st = document.getElementById("j-geo-status");
    if (st) st.textContent = "refusée ou impossible ❌";
  }, { timeout: 8000 });
}

/* ===================== Notes audio du journal (MediaRecorder) ===================== */

async function toggleAudioRec() {
  if (window._recAudio) { window._recAudio.stop(); return; }
  if (!navigator.mediaDevices || !window.MediaRecorder) { toast("❌ Enregistrement audio non supporté par ce navigateur"); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(stream);
    window._recAudio = rec;
    const chunks = [];
    rec.ondataavailable = e => chunks.push(e.data);
    rec.onstop = () => {
      stream.getTracks().forEach(tr => tr.stop());
      window._recAudio = null;
      const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
      window._jaudio = window._jaudio || [];
      window._jaudio.push(blob);
      const st = document.getElementById("j-audio-status");
      if (st) st.textContent = `${window._jaudio.length} note(s) audio prête(s) — jointe(s) à l'enregistrement 💾`;
      const btn = document.getElementById("j-audio-btn");
      if (btn) { btn.textContent = "🎙️ Enregistrer une note audio"; btn.style.background = ""; }
      toast("🎙️ Note audio capturée !");
    };
    rec.start();
    const btn = document.getElementById("j-audio-btn");
    if (btn) { btn.textContent = "⏹ Arrêter l'enregistrement"; btn.style.background = "var(--danger)"; }
    toast("🎙️ Enregistrement… (le bruit des vagues, l'ambiance du marché…)");
  } catch (e) {
    toast("❌ Micro refusé ou indisponible");
  }
}

// Joint les notes audio en attente à une entrée de journal
async function flushPendingAudio(entryId) {
  const audios = window._jaudio || [];
  window._jaudio = [];
  if (!audios.length) return;
  const db = await fdb();
  for (const b of audios) {
    await new Promise((res, rej) => {
      const tx = db.transaction("files", "readwrite");
      tx.objectStore("files").put({ id: uid(), owner: entryId, name: "note-audio-" + Date.now() + ".webm", type: b.type || "audio/webm", blob: b });
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  }
  loadAttachZones();
}

/* ===================== Carte postale numérique ===================== */

async function openPostcard(tripId) {
  const t = getTrip(tripId);
  toast("⏳ Recherche des photos…");
  const items = await collectTripImages(t);
  if (!items.length) { toast("Ajoute d'abord des photos au voyage 📷"); return; }
  window._pcItems = items;
  window._pcSel = 0;
  openModal("💌 Carte postale — " + esc(t.title), `
    <p class="muted small" style="margin-bottom:10px;">Choisis la photo, écris ton message, télécharge… et envoie à la famille !</p>
    <div class="pc-grid" id="pc-grid"></div>
    <div class="form-group" style="margin-top:12px;"><label>Message au dos</label>
      <textarea id="pc-msg" style="min-height:70px;">Bons baisers de ${esc(t.destination)} ! On pense bien à vous.</textarea></div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="makePostcard('${tripId}')">💌 Générer la carte</button>
    </div>`);
  const grid = document.getElementById("pc-grid");
  grid.innerHTML = items.map((x, i) =>
    `<img class="pc-thumb ${i === 0 ? "sel" : ""}" data-i="${i}" title="${esc(x.caption)}"
      onclick="window._pcSel=${i};document.querySelectorAll('.pc-thumb').forEach(im=>im.classList.remove('sel'));this.classList.add('sel')">`).join("");
  items.forEach((x, i) => {
    const img = grid.querySelector(`[data-i="${i}"]`);
    if (img) img.src = URL.createObjectURL(x.blob);
  });
}

async function makePostcard(tripId) {
  const t = getTrip(tripId);
  const item = window._pcItems[window._pcSel || 0];
  const msg = document.getElementById("pc-msg").value.trim();
  const W = 1400, H = 980;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");

  // fond blanc + photo recadrée plein cadre (avec marge façon polaroid)
  ctx.fillStyle = "#fdfcf8";
  ctx.fillRect(0, 0, W, H);
  const bmp = await createImageBitmap(item.blob, { imageOrientation: "from-image" });
  const px = 36, py = 36, pw = W - 72, ph = H - 290;
  const scale = Math.max(pw / bmp.width, ph / bmp.height);
  const sw = pw / scale, sh = ph / scale;
  ctx.save();
  ctx.beginPath(); ctx.rect(px, py, pw, ph); ctx.clip();
  ctx.drawImage(bmp, (bmp.width - sw) / 2, (bmp.height - sh) / 2, sw, sh, px, py, pw, ph);
  ctx.restore();
  bmp.close();

  // bandeau du bas : message + lieu + timbre
  ctx.fillStyle = "#1c2333";
  ctx.font = "italic 600 44px Georgia, serif";
  ctx.fillText("Bons baisers de " + t.destination + " !", 56, H - 175);
  ctx.font = "30px Georgia, serif";
  ctx.fillStyle = "#454f63";
  // message sur 2 lignes max
  const words = msg.split(/\s+/);
  let line = "", lines = [];
  for (const w of words) {
    if (ctx.measureText(line + " " + w).width > W - 420) { lines.push(line); line = w; }
    else line = line ? line + " " + w : w;
    if (lines.length === 2) break;
  }
  if (line && lines.length < 2) lines.push(line);
  lines.forEach((l, i) => ctx.fillText(l, 56, H - 118 + i * 42));
  ctx.font = "24px Georgia, serif";
  ctx.fillStyle = "#8a93a8";
  ctx.fillText(fmtDate(t.start && t.start <= todayISO() && todayISO() <= (t.end || "") ? todayISO() : t.start || todayISO()), 56, H - 30);

  // timbre dessiné
  ctx.strokeStyle = "#c4cbd9";
  ctx.setLineDash([7, 5]);
  ctx.lineWidth = 3;
  ctx.strokeRect(W - 220, H - 215, 165, 165);
  ctx.setLineDash([]);
  ctx.font = "78px serif";
  ctx.fillText("✈️", W - 188, H - 110);
  ctx.font = "20px Georgia, serif";
  ctx.fillStyle = "#8a93a8";
  ctx.fillText("Mes Voyages", W - 212, H - 66);

  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/jpeg", 0.9);
  a.download = "carte-postale-" + t.destination.replace(/[^\w\sàâäéèêëîïôöùûüç-]/gi, "").trim().replace(/\s+/g, "-").toLowerCase() + ".jpg";
  a.click();
  closeModal();
  toast("💌 Carte postale téléchargée — prête à envoyer !");
}

/* ===================== Rétrospective annuelle ===================== */

function retroCardHTML() {
  const years = [...new Set(state.trips.filter(t => t.start).map(t => t.start.slice(0, 4)))].sort().reverse();
  if (!years.length) return "";
  return `<div class="card" style="margin-bottom:20px;">
    <h3>🎁 Rétrospective annuelle</h3>
    <p class="muted small" style="margin:6px 0 10px;">Toute une année de voyages dans une page souvenir : chiffres, photos, palmarès de chaque aventure.</p>
    <div class="row">
      <select id="retro-year" class="transport-select">${years.map(y => `<option>${y}</option>`).join("")}</select>
      <button class="btn btn-primary btn-sm" onclick="generateRetro(document.getElementById('retro-year').value)">🎁 Générer la rétrospective</button>
    </div></div>`;
}

async function generateRetro(year) {
  const trips = state.trips
    .filter(t => t.start && (t.start.slice(0, 4) === String(year) || (t.end || "").slice(0, 4) === String(year)))
    .sort((a, b) => a.start.localeCompare(b.start));
  if (!trips.length) { toast("Aucun voyage daté en " + year); return; }
  toast("⏳ Préparation de la rétrospective " + year + "…");

  const visited = trips.filter(t => t.status === "termine" || t.status === "encours");
  let km = 0, co2 = 0, spent = 0, days = 0, journal = 0;
  const countries = new Set();
  visited.forEach(t => {
    const e = tripEstimates(t);
    km += e.km; co2 += e.co2; days += tripDuration(t);
    if (countryInfo(t.country)) countries.add(t.country);
  });
  trips.forEach(t => {
    spent += (t.expenses || []).reduce((s, e) => s + (+e.amount || 0), 0);
    journal += (t.journal || []).length;
  });

  let blocks = "";
  for (const t of trips) {
    const imgs = (await collectTripImages(t)).slice(0, 4);
    const thumbs = [];
    for (const im of imgs) {
      const src = await blobToDataURL(im.blob, 900, 0.72);
      if (src) thumbs.push(src);
    }
    const aw = t.awards || {};
    const sp = (t.expenses || []).reduce((s, e) => s + (+e.amount || 0), 0);
    blocks += `<div class="al-entry">
      <h3>${flagFor(t.country)} ${esc(t.title)} <small>— ${fmtDateShort(t.start)} → ${fmtDateShort(t.end)} · ${tripDuration(t)} j${sp ? " · " + fmtMoney(sp) : ""} · ${STATUTS[t.status] ? STATUTS[t.status].label : ""}</small></h3>
      ${aw.moment ? `<p>🌟 Meilleur moment : <b>${esc(aw.moment)}</b></p>` : ""}
      ${aw.note ? `<p style="color:#f59e0b;font-size:1.2rem;">${"★".repeat(aw.note)}${"☆".repeat(5 - aw.note)}</p>` : ""}
      ${thumbs.length ? `<div class="al-photos">${thumbs.map(s => `<img src="${s}">`).join("")}</div>` : ""}
    </div>`;
  }

  const stats = [
    [trips.length, "voyage" + (trips.length > 1 ? "s" : "")],
    [countries.size || null, "pays"],
    [days || null, "jours en voyage"],
    [km ? fmtKm(km) : null, "parcourus"],
    [journal || null, "récits écrits"],
    [spent ? fmtMoney(spent) : null, "dépensés"],
    [co2 ? Math.round(co2) + " kg" : null, "CO₂ / pers."]
  ].filter(([n]) => n).map(([n, l]) => `<div class="al-stat"><b>${n}</b><span>${l}</span></div>`).join("");

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>🎁 Rétrospective ${year} — Mes Voyages</title>
<style>
  @font-face { font-family: "TwemojiFlags"; src: url("https://cdn.jsdelivr.net/npm/country-flag-emoji-polyfill@0.1.8/dist/TwemojiCountryFlags.woff2") format("woff2"); unicode-range: U+1F1E6-1F1FF, U+1F3F4, U+E0062-E0063, U+E0065, U+E0067, U+E006C, U+E006E, U+E0073-E0074, U+E0077, U+E007F; font-display: swap; }
  body { font-family: "TwemojiFlags", "Segoe UI", system-ui, sans-serif; margin: 0; background: #f2f4fa; color: #1c2333; line-height: 1.65; }
  .page { max-width: 860px; margin: 0 auto; padding: 26px 22px 70px; }
  .cover { border-radius: 22px; color: #fff; padding: 70px 40px; text-align: center; background: linear-gradient(135deg, #4f6df5, #8b5cf6); box-shadow: 0 10px 35px rgba(28,35,51,0.22); }
  .cover h1 { font-size: 2.7rem; margin: 0; }
  .al-statgrid { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 18px; }
  .al-stat { flex: 1 1 130px; background: #fff; border-radius: 14px; padding: 14px 10px; text-align: center; box-shadow: 0 3px 12px rgba(28,35,51,0.07); }
  .al-stat b { display: block; font-size: 1.35rem; color: #4f6df5; }
  .al-stat span { font-size: 0.82rem; color: #6b7487; }
  .al-entry { background: #fff; border-radius: 14px; padding: 16px 22px; margin-top: 16px; box-shadow: 0 3px 12px rgba(28,35,51,0.06); }
  .al-entry small { color: #6b7487; font-weight: 400; }
  .al-photos { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 12px; }
  .al-photos img { max-width: calc(50% - 5px); border-radius: 12px; box-shadow: 0 3px 10px rgba(28,35,51,0.15); }
  footer { text-align: center; margin-top: 50px; color: #6b7487; font-size: 0.85rem; }
  .print-btn { position: fixed; right: 20px; bottom: 20px; background: #4f6df5; color: #fff; border: none; border-radius: 999px; padding: 13px 22px; font-size: 1rem; cursor: pointer; box-shadow: 0 6px 20px rgba(28,35,51,0.3); }
  @media print { .print-btn { display: none; } .al-entry { break-inside: avoid; } body { background: #fff; } .cover { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body><div class="page">
  <div class="cover"><div style="font-size:3rem;">🎁</div><h1>Ton année ${year}</h1><p>en voyages — ${trips.map(t => flagFor(t.country)).join(" ")}</p></div>
  <div class="al-statgrid">${stats}</div>
  ${blocks}
  <footer>🎁 Rétrospective générée le ${fmtDate(todayISO())} avec ❤️ par <b>Mes Voyages</b>.</footer>
</div><button class="print-btn" onclick="window.print()">🖨️ Imprimer / PDF</button></body></html>`;

  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "retrospective-" + year + ".html";
  a.click();
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  toast("🎁 Rétrospective " + year + " générée !");
}

/* ===================== Comparatif de voyages ===================== */

function compareCardHTML() {
  const dated = state.trips.filter(t => t.start);
  if (dated.length < 2) return "";
  const opts = sel => dated.map(t => `<option value="${t.id}" ${sel === t.id ? "selected" : ""}>${esc(t.title)}</option>`).join("");
  return `<div class="card" style="margin-bottom:20px;">
    <h3>⚖️ Comparer deux voyages</h3>
    <div class="row" style="margin-top:10px;flex-wrap:wrap;">
      <select id="cmp-a" class="transport-select">${opts(dated[0].id)}</select>
      <b>vs</b>
      <select id="cmp-b" class="transport-select">${opts(dated[1].id)}</select>
      <button class="btn btn-secondary btn-sm" onclick="compareTrips()">Comparer</button>
    </div>
    <div id="cmp-result" style="margin-top:14px;"></div></div>`;
}

function compareTrips() {
  const a = getTrip(document.getElementById("cmp-a").value);
  const b = getTrip(document.getElementById("cmp-b").value);
  if (!a || !b) return;
  const spend = t => (t.expenses || []).reduce((s, e) => s + (+e.amount || 0), 0);
  const rows = [
    ["📅 Durée", t => tripDuration(t) + " j"],
    ["👥 Voyageurs", t => t.travelers || 1],
    ["🧭 Étapes", t => (t.steps || []).length],
    ["📏 Distance", t => fmtKm(tripEstimates(t).km)],
    ["🌱 CO₂ / pers.", t => Math.round(tripEstimates(t).co2) + " kg"],
    ["💰 Budget prévu", t => t.budget ? fmtMoney(t.budget) : "—"],
    ["💸 Dépensé", t => spend(t) ? fmtMoney(spend(t)) : "—"],
    ["📆 Coût / jour", t => spend(t) && tripDuration(t) ? fmtMoney(spend(t) / tripDuration(t)) : "—"],
    ["🗓️ Activités", t => (t.activities || []).length],
    ["📔 Récits", t => (t.journal || []).length],
    ["📷 Photos géolocalisées", t => (t.geophotos || []).length],
    ["⭐ Note", t => t.awards && t.awards.note ? "★".repeat(t.awards.note) : "—"]
  ].map(([label, fn]) =>
    `<tr><td class="muted">${label}</td><td style="text-align:center;"><b>${fn(a)}</b></td><td style="text-align:center;"><b>${fn(b)}</b></td></tr>`).join("");
  document.getElementById("cmp-result").innerHTML = `
    <table class="phrase-table" style="width:100%;">
      <tr><td></td><td style="text-align:center;"><b>${flagFor(a.country)} ${esc(a.title)}</b></td><td style="text-align:center;"><b>${flagFor(b.country)} ${esc(b.title)}</b></td></tr>
      ${rows}
    </table>`;
}

/* ===================== Pratique : prises, pourboires, soleil ===================== */

function pratiqueExtraCards(t, info) {
  const iso = info && info.iso2;

  // 🔌 Prises électriques
  let plugHTML = `<p class="muted small">Renseigne le pays du voyage pour connaître les prises.</p>`;
  if (iso && PRISES[iso]) {
    const p = PRISES[iso];
    const compatible = /[CEF]/.test(p.t); // un chargeur français passe dans C, E et F
    plugHTML = `
      <table class="phrase-table">
        <tr><td class="muted">Type de prise</td><td><b>${esc(p.t)}</b></td></tr>
        <tr><td class="muted">Tension</td><td><b>${esc(p.v)}</b></td></tr>
      </table>
      <p class="small" style="margin-top:10px;${compatible ? "" : "font-weight:600;"}">
        ${compatible ? "✅ Tes chargeurs français rentrent directement." : "🔌 <b>Adaptateur nécessaire</b> pour les appareils français !"}
        ${p.v.includes("⚡") ? "<br>⚡ Tension plus basse qu'en France : vérifie que tes appareils acceptent 100-240 V (c'est écrit sur le chargeur)." : ""}
      </p>
      <p class="muted small" style="margin-top:8px;">💉 Santé : vérifie les vaccins conseillés sur <b>pasteur.fr</b> (rubrique « préparer son voyage ») — pense-y 2 mois avant le départ.</p>`;
  }

  // 💵 Pourboires + calculateur
  const tipText = iso ? (TIPS[iso] || (info.cont === "Europe" ? TIPS_EU : TIPS_DEFAULT)) : TIPS_DEFAULT;
  const tipHTML = `
    <p class="small" style="margin-top:10px;">${tipText}</p>
    <div class="row" style="margin-top:12px;flex-wrap:wrap;">
      <input class="search-input" id="tip-amount" type="number" min="0" placeholder="Addition…" style="max-width:120px;" oninput="calcTip()">
      <select id="tip-pct" class="transport-select" onchange="calcTip()">
        ${[5, 10, 12, 15, 18, 20].map(p => `<option value="${p}" ${p === 10 ? "selected" : ""}>${p} %</option>`).join("")}
      </select>
      <b id="tip-result"></b>
    </div>`;

  // 🌅 Soleil (sur la première étape)
  const s0 = (t.steps || [])[0];
  let sunHTML = `<p class="muted small">Ajoute une étape sur la carte 🗺️ pour voir les horaires du soleil sur place.</p>`;
  if (s0) {
    const sun = sunTimes(s0.lat, s0.lng, new Date());
    if (sun) {
      const fmtMin = min => {
        const d = new Date();
        return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + min * 60000)
          .toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
      };
      const lenH = Math.floor(sun.len / 60), lenM = Math.round(sun.len % 60);
      sunHTML = `
        <table class="phrase-table">
          <tr><td class="muted">🌅 Lever du soleil</td><td><b>${fmtMin(sun.rise)}</b></td></tr>
          <tr><td class="muted">🌇 Coucher du soleil</td><td><b>${fmtMin(sun.set)}</b></td></tr>
          <tr><td class="muted">☀️ Durée du jour</td><td><b>${lenH} h ${String(lenM).padStart(2, "0")}</b></td></tr>
        </table>
        <p class="muted small" style="margin-top:8px;">Aujourd'hui à ${esc(s0.name)}, affiché dans <b>ton</b> fuseau horaire. Idéal pour planifier les photos dorées ! 📸</p>`;
    } else {
      sunHTML = `<p class="muted small">☀️ Soleil de minuit ou nuit polaire à ${esc(s0.name)} en ce moment !</p>`;
    }
  }

  return `
    <div class="card"><h3>🔌 Prises et santé</h3><div style="margin-top:10px;">${plugHTML}</div></div>
    <div class="card"><h3>💵 Pourboires</h3>${tipHTML}</div>
    <div class="card"><h3>🌅 Le soleil sur place</h3><div style="margin-top:10px;">${sunHTML}</div></div>
    <div class="card"><h3>😋 Spécialités & souvenirs</h3><div style="margin-top:10px;">${specialtiesHTML(iso)}</div></div>
    <div class="card"><h3>🔁 Convertisseurs</h3>${convCardHTML()}</div>`;
}

/* 😋 Spécialités à goûter + souvenirs à rapporter, selon le pays */
function specialtiesHTML(iso) {
  const s = iso && SPECIALITES[iso];
  if (!s) return `<p class="muted small">Renseigne le pays du voyage pour découvrir ses spécialités à goûter et des idées de souvenirs à rapporter. 🌍</p>`;
  return `<div class="grid grid-2" style="gap:16px;">
    <div><div class="muted small" style="margin-bottom:5px;">🍽️ À goûter sur place</div>${s.food.map(x => `<div class="small" style="padding:2px 0;">• ${esc(x)}</div>`).join("")}</div>
    <div><div class="muted small" style="margin-bottom:5px;">🛍️ À rapporter</div>${s.buy.map(x => `<div class="small" style="padding:2px 0;">• ${esc(x)}</div>`).join("")}</div>
  </div>`;
}

/* 🔁 Convertisseurs d'unités + tailles de vêtements/chaussures */
function convCardHTML() {
  const units = [
    ["c2f", "°C → °F"], ["f2c", "°F → °C"],
    ["km2mi", "km → miles"], ["mi2km", "miles → km"],
    ["cm2in", "cm → pouces"], ["in2cm", "pouces → cm"],
    ["kg2lb", "kg → livres"], ["lb2kg", "livres → kg"]
  ];
  return `
    <div class="row" style="margin-top:10px;flex-wrap:wrap;gap:8px;align-items:center;">
      <input class="search-input" id="conv-val" type="number" placeholder="Valeur…" style="max-width:120px;" oninput="runConv()">
      <select id="conv-type" class="transport-select" onchange="runConv()">
        ${units.map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}
      </select>
      <b id="conv-out"></b>
    </div>
    <div style="margin-top:14px;">
      <div class="row-between" style="margin-bottom:8px;">
        <label class="muted small">📏 Tailles à l'étranger</label>
        <select id="size-cat" class="transport-select" onchange="renderSizes(this.value)">
          ${Object.entries(CONV_SIZES).map(([k, c]) => `<option value="${k}">${c.label}</option>`).join("")}
        </select>
      </div>
      <div id="size-table">${sizeTableHTML("vf")}</div>
    </div>`;
}

function sizeTableHTML(cat) {
  const c = CONV_SIZES[cat] || CONV_SIZES.vf;
  return `<table class="phrase-table">
    <tr>${c.cols.map(h => `<th class="muted small" style="text-align:left;">${esc(h)}</th>`).join("")}</tr>
    ${c.rows.map(r => `<tr>${r.map((v, i) => `<td${i === 0 ? ' class="muted"' : ""}><b>${esc(v)}</b></td>`).join("")}</tr>`).join("")}
  </table>
  <p class="muted small" style="margin-top:6px;">Indicatif — les coupes varient selon les marques, essaie toujours si possible 🙂</p>`;
}

function renderSizes(cat) {
  const box = document.getElementById("size-table");
  if (box) box.innerHTML = sizeTableHTML(cat);
}

function runConv() {
  const v = parseFloat(document.getElementById("conv-val").value);
  const out = document.getElementById("conv-out");
  if (!out) return;
  if (!isFinite(v)) { out.textContent = ""; return; }
  const f = {
    c2f: x => [x * 9 / 5 + 32, "°F"], f2c: x => [(x - 32) * 5 / 9, "°C"],
    km2mi: x => [x / 1.609344, "miles"], mi2km: x => [x * 1.609344, "km"],
    cm2in: x => [x / 2.54, "pouces"], in2cm: x => [x * 2.54, "cm"],
    kg2lb: x => [x * 2.2046226, "livres"], lb2kg: x => [x / 2.2046226, "kg"]
  }[document.getElementById("conv-type").value];
  if (!f) { out.textContent = ""; return; }
  const [res, unit] = f(v);
  out.textContent = `→ ${(Math.round(res * 100) / 100).toLocaleString("fr-FR")} ${unit}`;
}

/* 🔊 Prononciation d'une phrase du guide de conversation (synthèse vocale du navigateur) */
function speakPhrase(lang, i) {
  if (!("speechSynthesis" in window)) { toast("🔇 La synthèse vocale n'est pas disponible sur ce navigateur."); return; }
  const p = PHRASES[lang];
  if (!p) return;
  // On enlève la romanisation entre parenthèses (ja/th) et on remplace " / " par une pause
  const txt = (p.list[i] || "").replace(/\s*\([^)]*\)/g, "").replace(/\s*\/\s*/g, ", ").trim();
  if (!txt) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(txt);
    u.lang = PHRASE_LOCALE[lang] || "en-US";
    u.rate = 0.9;
    window.speechSynthesis.speak(u);
  } catch (e) { toast("🔇 Lecture impossible."); }
}

/* ✉️ Capsule temporelle : un message scellé jusqu'à une date future */
function capsuleCardHTML(t) {
  const c = t.capsule;
  if (!c) {
    return `<div class="card capsule-card" style="margin-bottom:18px;">
      <h3>✉️ Capsule temporelle</h3>
      <p class="muted small" style="margin:6px 0 12px;">Écris un message à toi-même (ou à la famille) à rouvrir plus tard — une surprise du futur ! 💌</p>
      <button class="btn btn-secondary btn-sm" onclick="openCapsuleForm('${t.id}')">＋ Créer une capsule</button></div>`;
  }
  const today = todayISO();
  if (c.openDate && today >= c.openDate) {
    return `<div class="card capsule-card capsule-open" style="margin-bottom:18px;">
      <h3>🎉 Capsule temporelle ouverte !</h3>
      <p class="muted small">Scellée le ${fmtDateShort(c.createdAt)} · révélée le ${fmtDateShort(c.openDate)}</p>
      <p style="white-space:pre-wrap;margin-top:12px;font-size:1.05rem;line-height:1.5;">${esc(c.message)}</p>
      <button class="icon-btn" style="margin-top:10px;" onclick="deleteCapsule('${t.id}')" title="Supprimer la capsule">🗑️ Supprimer</button></div>`;
  }
  const days = daysBetween(today, c.openDate);
  return `<div class="card capsule-card capsule-sealed" style="margin-bottom:18px;">
    <h3>🔒 Capsule scellée</h3>
    <p style="margin-top:8px;">À rouvrir le <b>${fmtDate(c.openDate)}</b> — encore <b>${days} jour${days > 1 ? "s" : ""}</b> de patience ⏳</p>
    <p class="muted small" style="margin-top:6px;">Le message reste caché jusqu'à cette date. Pas de triche ! 😄</p>
    <button class="icon-btn" style="margin-top:8px;" onclick="deleteCapsule('${t.id}')" title="Supprimer la capsule">🗑️</button></div>`;
}

function openCapsuleForm(tripId) {
  const t = getTrip(tripId);
  const def = t.start && t.start > todayISO() ? t.start : addDaysISO(todayISO(), 365);
  openModal("✉️ Capsule temporelle", `
    <p class="muted small" style="margin-bottom:12px;">Ton message sera scellé jusqu'à la date choisie, puis révélé ici même. 💌</p>
    <div class="form-group"><label>Ton message</label>
      <textarea id="cap-msg" rows="5" placeholder="Ce que tu ressens, tes espoirs, un mot pour le toi du futur…"></textarea></div>
    <div class="form-group"><label>À ouvrir le</label>
      <input id="cap-date" type="date" value="${def}"></div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="saveCapsule('${tripId}')">🔒 Sceller la capsule</button></div>`);
}

function saveCapsule(tripId) {
  const t = getTrip(tripId);
  const msg = document.getElementById("cap-msg").value.trim();
  const date = document.getElementById("cap-date").value;
  if (!msg) { toast("✍️ Écris un petit message d'abord"); return; }
  if (!date || date <= todayISO()) { toast("📅 Choisis une date dans le futur"); return; }
  t.capsule = { message: msg, openDate: date, createdAt: todayISO() };
  saveState();
  closeModal();
  renderTripDetail(document.getElementById("main"));
  toast("🔒 Capsule scellée — rendez-vous le " + fmtDateShort(date) + " !");
}

function deleteCapsule(tripId) {
  const t = getTrip(tripId);
  if (!confirm("Supprimer cette capsule temporelle ?")) return;
  delete t.capsule;
  saveState();
  renderTripDetail(document.getElementById("main"));
  toast("🗑️ Capsule supprimée");
}

/* ===================== Import / export GPX ===================== */

function exportGPX(tripId) {
  const t = getTrip(tripId);
  if (!(t.steps || []).some(s => typeof s.lat === "number")) { toast("Ajoute des étapes à la carte d'abord 🗺️"); return; }
  const x = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const steps = t.steps.filter(s => typeof s.lat === "number");
  const wpts = steps.map((s, i) => `  <wpt lat="${s.lat}" lon="${s.lng}"><name>${x((i + 1) + ". " + s.name)}</name>${s.notes ? `<desc>${x(s.notes)}</desc>` : ""}</wpt>`).join("\n");
  const trkpts = steps.map(s => `      <trkpt lat="${s.lat}" lon="${s.lng}"></trkpt>`).join("\n");
  const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Mes Voyages" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${x(t.title)}</name></metadata>
${wpts}
  <trk><name>${x(t.title)}</name><trkseg>
${trkpts}
  </trkseg></trk>
</gpx>`;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([gpx], { type: "application/gpx+xml" }));
  a.download = (t.title || "voyage").replace(/[^\w\sàâäéèêëîïôöùûüç-]/gi, "").trim().replace(/\s+/g, "-").toLowerCase() + ".gpx";
  a.click();
  URL.revokeObjectURL(a.href);
  toast("📤 Itinéraire exporté en GPX");
}

async function importGPX(tripId, input) {
  const file = input.files[0];
  input.value = "";
  if (!file) return;
  let doc;
  try { doc = new DOMParser().parseFromString(await file.text(), "application/xml"); }
  catch (e) { toast("❌ Fichier GPX illisible"); return; }
  if (doc.querySelector("parsererror")) { toast("❌ Fichier GPX invalide"); return; }
  const t = getTrip(tripId);
  t.steps = t.steps || [];
  const pts = [];
  // 1) points de cheminement nommés (<wpt>)
  doc.querySelectorAll("wpt").forEach(w => {
    const lat = parseFloat(w.getAttribute("lat")), lng = parseFloat(w.getAttribute("lon"));
    if (!isFinite(lat) || !isFinite(lng)) return;
    const nm = w.querySelector("name");
    pts.push({ lat, lng, name: (nm && nm.textContent.trim()) || ("Point " + (pts.length + 1)) });
  });
  // 2) sinon, trace (<trkpt>/<rtept>) échantillonnée pour ne pas créer des centaines d'étapes
  if (!pts.length) {
    const trk = [...doc.querySelectorAll("trkpt, rtept")]
      .map(p => ({ lat: parseFloat(p.getAttribute("lat")), lng: parseFloat(p.getAttribute("lon")) }))
      .filter(p => isFinite(p.lat) && isFinite(p.lng));
    if (trk.length) {
      const step = Math.max(1, Math.ceil(trk.length / 12));
      for (let i = 0; i < trk.length; i += step) pts.push({ lat: trk[i].lat, lng: trk[i].lng, name: "Point " + (pts.length + 1) });
      const last = trk[trk.length - 1];
      if (pts.length && (pts[pts.length - 1].lat !== last.lat || pts[pts.length - 1].lng !== last.lng)) pts.push({ lat: last.lat, lng: last.lng, name: "Point " + (pts.length + 1) });
    }
  }
  if (!pts.length) { toast("Aucun point trouvé dans ce GPX 🤔"); return; }
  pts.forEach(p => t.steps.push({ id: uid(), name: p.name, lat: p.lat, lng: p.lng, transport: "voiture", notes: "" }));
  saveState();
  renderTripDetail(document.getElementById("main"));
  toast(`📥 ${pts.length} étape(s) importée(s) depuis le GPX`);
}

/* ===================== 🧠 Valise intelligente ===================== */

function smartPackPlan(t) {
  const keys = ["essentiels"];
  const reasons = [];
  const s0 = (t.steps || []).find(s => typeof s.lat === "number");
  const lat = s0 ? s0.lat : null;
  const absLat = lat != null ? Math.abs(lat) : null;
  const month = t.start ? +t.start.slice(5, 7) : (new Date().getMonth() + 1);
  const south = lat != null && lat < 0;
  const summer = south ? [11, 12, 1, 2, 3] : [6, 7, 8, 9];
  const winter = south ? [6, 7, 8] : [12, 1, 2];
  const isSummer = summer.includes(month), isWinter = winter.includes(month);

  if ((absLat != null && absLat < 35) || isSummer) { keys.push("plage"); reasons.push("destination chaude / saison estivale → 🏖️ Plage"); }
  if (isWinter && (absLat == null || absLat > 45)) { keys.push("montagne"); reasons.push("hiver en région fraîche → 🏔️ Montagne"); }
  keys.push("ville");
  keys.push("pharmacie");
  const dur = tripDuration(t);
  if (dur >= 10) reasons.push(`séjour long (${dur} j) → de quoi laver le linge`);
  return { keys: [...new Set(keys)].filter(k => PACK_TEMPLATES[k]), reasons };
}

function smartPackHTML(t) {
  const plan = smartPackPlan(t);
  const chips = plan.keys.map(k => PACK_TEMPLATES[k].label).join(" · ");
  return `<div class="smart-pack">
    <div class="row-between" style="gap:10px;flex-wrap:wrap;">
      <div><b>🧠 Valise intelligente</b>
        <div class="muted small" style="margin-top:3px;">Conseillé : ${esc(chips)}${plan.reasons.length ? " — " + esc(plan.reasons.join(" ; ")) : ""}</div></div>
      <button class="btn btn-primary btn-sm" style="flex-shrink:0;" onclick="applySmartPack('${t.id}')">✨ Ajouter la sélection</button>
    </div></div>`;
}

function applySmartPack(tripId) {
  const t = getTrip(tripId);
  t.packing = t.packing || [];
  const existing = new Set(t.packing.map(i => i.label.toLowerCase()));
  let added = 0;
  smartPackPlan(t).keys.forEach(k => PACK_TEMPLATES[k].items.forEach(label => {
    if (!existing.has(label.toLowerCase())) { t.packing.push({ id: uid(), label, done: false }); existing.add(label.toLowerCase()); added++; }
  }));
  saveState();
  renderTripDetail(document.getElementById("main"));
  toast(added ? `🎒 ${added} élément(s) ajouté(s) selon la saison & la destination` : "Tout y est déjà ! 👍");
}

/* ===================== 🧮 Itinéraire optimisé (plus court trajet) ===================== */

function optimizeRoute(tripId) {
  const t = getTrip(tripId);
  const steps = (t.steps || []).filter(s => typeof s.lat === "number" && typeof s.lng === "number");
  if (steps.length < 3) { toast("Il faut au moins 3 étapes géolocalisées pour optimiser 🧮"); return; }
  const hsum = arr => { let s = 0; for (let i = 1; i < arr.length; i++) s += haversineKm(arr[i - 1], arr[i]); return s; };
  const before = hsum(steps);
  // Plus proche voisin, en gardant la 1re étape comme point de départ
  const ordered = [steps[0]];
  const pool = steps.slice(1);
  let cur = steps[0];
  while (pool.length) {
    let bi = 0, bd = Infinity;
    pool.forEach((s, i) => { const d = haversineKm(cur, s); if (d < bd) { bd = d; bi = i; } });
    cur = pool.splice(bi, 1)[0];
    ordered.push(cur);
  }
  const after = hsum(ordered);
  if (after >= before - 1) { toast("Ton itinéraire est déjà quasi optimal ! 👍"); return; }
  if (!confirm(`Réordonner les étapes pour raccourcir le trajet ?\n\nAvant : ${fmtKm(before)}\nAprès : ${fmtKm(after)}\n(la 1re étape reste le point de départ)`)) return;
  t.steps = ordered;
  saveState();
  renderTripDetail(document.getElementById("main"));
  toast(`🧮 Itinéraire optimisé — ${fmtKm(before - after)} économisés !`);
}

/* ===================== 💡 « Où partir ? » ===================== */

const WT_MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

function openWhereTo() {
  const monthOpts = `<option value="">Indifférent</option>` + WT_MONTHS.map((m, i) => `<option value="${i + 1}">${m}</option>`).join("");
  openModal("💡 Où partir ?", `
    <p class="muted small" style="margin-bottom:12px;">Dis-moi tes envies, je te propose des destinations à ajouter à ta liste. ✨</p>
    <div class="form-row">
      <div class="form-group"><label>Quand ?</label><select id="wt-month">${monthOpts}</select></div>
      <div class="form-group"><label>Budget</label>
        <select id="wt-budget"><option value="">Indifférent</option><option value="low">€ Petit</option><option value="med">€€ Moyen</option><option value="high">€€€ Confort</option></select></div>
      <div class="form-group"><label>Envie</label>
        <select id="wt-type"><option value="">Tout</option><option value="mer">🏖️ Mer</option><option value="montagne">🏔️ Montagne</option><option value="ville">🏙️ Ville</option><option value="decouverte">🧭 Découverte</option><option value="famille">👨‍👩‍👧 Famille</option></select></div>
    </div>
    <div class="form-actions" style="justify-content:flex-start;"><button class="btn btn-primary" onclick="runWhereTo()">🔎 Trouver</button></div>
    <div id="wt-results" style="margin-top:8px;"></div>`);
}

function runWhereTo() {
  const month = +document.getElementById("wt-month").value || 0;
  const budget = document.getElementById("wt-budget").value;
  const type = document.getElementById("wt-type").value;
  const scored = DESTINATIONS_IDEES.map(d => {
    let score = 0, ok = true;
    if (month) { if (d.months.includes(month)) score += 2; else ok = false; }
    if (budget) { if (d.budget === budget) score += 1; else ok = false; }
    if (type) { if (d.type.includes(type)) score += 2; else ok = false; }
    return { d, score, ok };
  }).filter(x => x.ok).sort((a, b) => b.score - a.score);
  window._wtResults = scored.map(x => x.d);
  const box = document.getElementById("wt-results");
  if (!scored.length) {
    box.innerHTML = `<p class="muted small">Aucune idée ne colle pile à ces critères — essaie d'en assouplir un. 🙂</p>`;
    return;
  }
  const budgetLabel = { low: "€", med: "€€", high: "€€€" };
  box.innerHTML = scored.slice(0, 8).map((x, i) => {
    const d = x.d;
    return `<div class="row-between" style="padding:8px 0;border-bottom:1px solid var(--border);gap:10px;">
      <div><b>${d.emoji} ${esc(d.name)}</b> <span class="muted small">· ${esc(d.country)} · ${budgetLabel[d.budget]} · ${d.months.map(m => WT_MONTHS[m - 1].slice(0, 4)).join(", ")}</span></div>
      <button class="btn btn-ghost btn-sm" style="flex-shrink:0;" onclick="addIdeaToWishlist(${i})">＋ Mes envies</button>
    </div>`;
  }).join("");
}

function addIdeaToWishlist(i) {
  const d = (window._wtResults || [])[i];
  if (!d) return;
  state.wishlist = state.wishlist || [];
  if (state.wishlist.some(w => (w.destination || "").toLowerCase() === d.name.toLowerCase())) { toast("Déjà dans ta liste d'envies 😉"); return; }
  state.wishlist.push({
    id: uid(), destination: d.name, country: d.country, priority: 2,
    season: d.months.map(m => WT_MONTHS[m - 1]).join(", "), budget: 0,
    notes: "Idée suggérée par « Où partir ? »"
  });
  saveState();
  toast(`💫 ${d.name} ajouté à ta liste d'envies !`);
}

/* ===================== 🌍 Jeu « Devine où ? » ===================== */

function guessWhereLaunchHTML(t) {
  const n = (t.geophotos || []).filter(p => typeof p.lat === "number" && typeof p.lng === "number").length;
  if (n < 3) return `<p class="muted small">Ajoute au moins 3 photos géolocalisées (onglet 🗺️ Carte) pour pouvoir jouer.</p>`;
  return `<button class="btn btn-primary btn-sm" onclick="startGuessWhere('${t.id}')">▶️ Jouer (${n} photos)</button>`;
}

async function startGuessWhere(tripId) {
  const t = getTrip(tripId);
  const pool = (t.geophotos || []).filter(p => typeof p.lat === "number" && typeof p.lng === "number");
  if (!pool.length) { toast("Pas assez de photos géolocalisées 🗺️"); return; }
  if (!window._guess || window._guess.tripId !== tripId) window._guess = { score: 0, round: 0, tripId };
  if (window._guess.url) { try { URL.revokeObjectURL(window._guess.url); } catch (e) {} }
  const photo = pool[Math.floor(Math.random() * pool.length)];
  window._guess.photo = photo;
  window._guess.guess = null;
  const rec = await fdbGet(photo.id);
  const url = rec ? URL.createObjectURL(rec.blob) : null;
  window._guess.url = url;
  openModal("🌍 Devine où ?", `
    <p class="muted small" style="margin-bottom:8px;">Manche ${window._guess.round + 1} · Score : <b id="guess-score">${window._guess.score}</b></p>
    ${url ? `<img src="${url}" style="width:100%;max-height:230px;object-fit:cover;border-radius:12px;margin-bottom:10px;">` : `<p class="muted small">(photo introuvable sur ce PC)</p>`}
    <p class="small" style="margin-bottom:6px;">Clique sur la carte là où tu penses qu'elle a été prise :</p>
    <div id="guess-map" style="height:300px;border-radius:12px;overflow:hidden;"></div>
    <div id="guess-result" class="small" style="margin-top:10px;"></div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Fermer</button>
      <button class="btn btn-primary" id="guess-validate" disabled onclick="validateGuess()">Valider mon choix</button>
    </div>`);
  setTimeout(initGuessMap, 60);
}

function initGuessMap() {
  if (typeof L === "undefined" || !document.getElementById("guess-map")) return;
  if (window._guessMap) { try { window._guessMap.remove(); } catch (e) {} window._guessMap = null; }
  const map = L.map("guess-map", { worldCopyJump: true, minZoom: 1 }).setView([30, 10], 1);
  window._guessMap = map;
  if (typeof baseTiles === "function") baseTiles(map, 8);
  else L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 8 }).addTo(map);
  let marker = null;
  map.on("click", e => {
    window._guess.guess = { lat: e.latlng.lat, lng: e.latlng.lng };
    if (marker) marker.setLatLng(e.latlng); else marker = L.marker(e.latlng).addTo(map);
    const b = document.getElementById("guess-validate");
    if (b) b.disabled = false;
  });
}

function validateGuess() {
  const g = window._guess;
  if (!g || !g.guess || !window._guessMap) return;
  const actual = { lat: g.photo.lat, lng: g.photo.lng };
  const dist = haversineKm(g.guess, actual);
  const pts = Math.max(0, Math.round(1000 * (1 - Math.min(dist, 3000) / 3000)));
  g.score += pts;
  g.round++;
  const map = window._guessMap;
  L.marker([actual.lat, actual.lng], { icon: L.divIcon({ className: "leg-emoji-icon", html: `<div class="photo-marker">📍</div>`, iconSize: [30, 30], iconAnchor: [15, 15] }) }).addTo(map);
  L.polyline([[g.guess.lat, g.guess.lng], [actual.lat, actual.lng]], { color: "#ef4444", weight: 2, dashArray: "5 6" }).addTo(map);
  try { map.fitBounds(L.latLngBounds([[g.guess.lat, g.guess.lng], [actual.lat, actual.lng]]).pad(0.3)); } catch (e) {}
  const res = document.getElementById("guess-result");
  if (res) res.innerHTML = `📍 <b>${esc(g.photo.name || "")}</b> — à <b>${fmtKm(dist)}</b> de ton point · <b>+${pts}</b> points 🎯`;
  const sc = document.getElementById("guess-score");
  if (sc) sc.textContent = g.score;
  const b = document.getElementById("guess-validate");
  if (b) { b.textContent = "Photo suivante ▶️"; b.disabled = false; b.setAttribute("onclick", `startGuessWhere('${g.tripId}')`); }
}

/* ===================== 🍴 Carnet gourmand ===================== */

function foodCardHTML(t) {
  const food = t.food || [];
  const rows = food.map(f => `
    <div class="pack-item">
      <span style="flex:1;">${f.type ? esc(f.type) + " " : ""}<b>${esc(f.name)}</b>
        <span style="color:#f59e0b;">${"★".repeat(f.rating || 0)}${"☆".repeat(5 - (f.rating || 0))}</span>${f.place ? ` <span class="muted small">· ${esc(f.place)}</span>` : ""}${f.price ? ` <span class="muted small">· ${fmtMoney(f.price)}</span>` : ""}${f.notes ? `<div class="muted small">${esc(f.notes)}</div>` : ""}</span>
      <button class="icon-btn" onclick="deleteFood('${t.id}','${f.id}')">🗑️</button>
    </div>`).join("");
  return `<div class="card" style="margin-bottom:18px;">
    <h3>🍴 Carnet gourmand${food.length ? ` (${food.length})` : ""}</h3>
    <p class="muted small" style="margin:4px 0 10px;">Garde la trace des plats et restos que tu as adorés (ou pas !).</p>
    <div class="form-row" style="align-items:flex-end;">
      <div class="form-group" style="margin:0;flex:2;"><label>Plat / restaurant</label>
        <input id="food-name" placeholder="Ex : Carbonara chez Mario" onkeydown="if(event.key==='Enter')addFood('${t.id}')"></div>
      <div class="form-group" style="margin:0;"><label>Type</label>
        <select id="food-type"><option>🍽️ Resto</option><option>🍕 Plat</option><option>☕ Café</option><option>🍦 Dessert</option><option>🛒 Marché</option></select></div>
      <div class="form-group" style="margin:0;"><label>Note</label>
        <select id="food-rating"><option value="5">★★★★★</option><option value="4">★★★★</option><option value="3">★★★</option><option value="2">★★</option><option value="1">★</option></select></div>
      <button class="btn btn-primary btn-sm" onclick="addFood('${t.id}')">＋</button>
    </div>
    <div class="form-row" style="margin-top:8px;">
      <div class="form-group" style="margin:0;flex:1;"><input id="food-place" placeholder="Lieu (optionnel)"></div>
      <div class="form-group" style="margin:0;"><input id="food-price" type="number" min="0" placeholder="Prix €"></div>
    </div>
    <div style="margin-top:12px;">${rows || `<p class="muted small">Rien encore — note ton premier coup de cœur gourmand ! 😋</p>`}</div>
  </div>`;
}

function addFood(tripId) {
  const t = getTrip(tripId);
  t.food = t.food || [];
  const name = (document.getElementById("food-name").value || "").trim();
  if (!name) { toast("Donne un nom au plat / resto 🍽️"); return; }
  t.food.unshift({
    id: uid(), name, type: document.getElementById("food-type").value,
    rating: +document.getElementById("food-rating").value || 0,
    place: (document.getElementById("food-place").value || "").trim(),
    price: +document.getElementById("food-price").value || 0, notes: ""
  });
  saveState();
  renderTripDetail(document.getElementById("main"));
  toast("😋 Ajouté au carnet gourmand !");
}

function deleteFood(tripId, id) {
  const t = getTrip(tripId);
  t.food = (t.food || []).filter(f => f.id !== id);
  saveState();
  renderTripDetail(document.getElementById("main"));
}

/* ===================== Carte « une vie de voyages » (onglet Stats) ===================== */

function lifeMapTrips() {
  return (state.trips || []).filter(t => (t.status === "termine" || t.status === "encours")
    && (t.steps || []).some(s => typeof s.lat === "number" && typeof s.lng === "number"));
}

function lifeMapHTML() {
  const trips = lifeMapTrips();
  if (!trips.length) return "";
  const all = [];
  trips.forEach(t => (t.steps || []).forEach(s => { if (typeof s.lat === "number" && typeof s.lng === "number") all.push({ s, t }); }));
  const ext = pick => all.reduce((a, b) => pick(a, b) ? a : b);
  const N = ext((a, b) => a.s.lat >= b.s.lat), S = ext((a, b) => a.s.lat <= b.s.lat);
  const E = ext((a, b) => a.s.lng >= b.s.lng), W = ext((a, b) => a.s.lng <= b.s.lng);
  const line = (emoji, label, x) => `<div class="small" style="padding:2px 0;">${emoji} <b>${label}</b> : ${flagFor(x.t.country)} ${esc(x.s.name)} <span class="muted">(${esc(x.t.title)})</span></div>`;
  return `<div class="card" style="margin-bottom:20px;">
    <h3>🗺️ La carte de toutes tes aventures</h3>
    <p class="muted small" style="margin:6px 0 12px;">Tous tes parcours réunis sur une seule carte — ${all.length} étapes sur ${trips.length} voyage(s).</p>
    <div id="life-map" class="map-container" style="height:440px;"></div>
    <div style="margin-top:14px;">
      ${line("⬆️", "Le plus au nord", N)}
      ${line("⬇️", "Le plus au sud", S)}
      ${line("➡️", "Le plus à l'est", E)}
      ${line("⬅️", "Le plus à l'ouest", W)}
    </div>
  </div>`;
}

function initLifeMap() {
  if (typeof L === "undefined" || !document.getElementById("life-map")) return;
  if (window._lifeMap) { try { window._lifeMap.remove(); } catch (e) {} window._lifeMap = null; }
  const map = L.map("life-map", { worldCopyJump: true, minZoom: 1 }).setView([25, 10], 2);
  window._lifeMap = map;
  if (typeof baseTiles === "function") baseTiles(map, 12);
  else L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 12, attribution: "© OpenStreetMap" }).addTo(map);
  const all = [];
  lifeMapTrips().forEach(t => {
    const c = t.color || "#4f6df5";
    const pts = (t.steps || []).filter(s => typeof s.lat === "number" && typeof s.lng === "number");
    const coords = pts.map(s => [s.lat, s.lng]);
    if (coords.length > 1) L.polyline(coords, { color: c, weight: 3, opacity: 0.7 }).addTo(map);
    pts.forEach(s => {
      all.push([s.lat, s.lng]);
      L.circleMarker([s.lat, s.lng], { radius: 5, color: "#fff", weight: 1.5, fillColor: c, fillOpacity: 1 })
        .addTo(map).bindPopup(`<b>${esc(s.name)}</b><br>${esc(t.title)}`);
    });
  });
  if (all.length) { try { map.fitBounds(L.latLngBounds(all).pad(0.2)); } catch (e) {} }
}

function calcTip() {
  const amount = +document.getElementById("tip-amount").value || 0;
  const pct = +document.getElementById("tip-pct").value;
  const out = document.getElementById("tip-result");
  if (!amount) { out.textContent = ""; return; }
  const tip = amount * pct / 100;
  out.innerHTML = `→ pourboire ${fmtMoney(tip)} <span class="muted small">(total ${fmtMoney(amount + tip)})</span>`;
}

// Lever/coucher du soleil (algorithme NOAA simplifié, précision ±3 min) — minutes UTC
function sunTimes(lat, lng, d) {
  const rad = Math.PI / 180;
  const day = Math.floor((d - new Date(Date.UTC(d.getUTCFullYear(), 0, 0))) / 86400000);
  const decl = -23.44 * Math.cos(rad * (360 / 365) * (day + 10));
  const cosHa = (Math.sin(-0.83 * rad) - Math.sin(lat * rad) * Math.sin(decl * rad)) / (Math.cos(lat * rad) * Math.cos(decl * rad));
  if (cosHa < -1 || cosHa > 1) return null; // soleil de minuit / nuit polaire
  const ha = Math.acos(cosHa) / rad;
  const B = rad * (360 / 365) * (day - 81);
  const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B); // équation du temps (min)
  const noon = 720 - 4 * lng - eot;
  return { rise: noon - 4 * ha, set: noon + 4 * ha, len: 8 * ha };
}

// Conseil anti-jetlag selon le décalage horaire (en heures)
function jetlagAdvice(diffH) {
  const a = Math.abs(diffH);
  if (a < 3) return "";
  const dir = diffH > 0
    ? "Vers l'est : couche-toi 1 h plus tôt les soirs précédant le départ, et cherche la lumière du matin sur place."
    : "Vers l'ouest : couche-toi 1 h plus tard les soirs précédant le départ, et profite de la lumière du soir sur place.";
  return `😴 Jetlag : compte ~${Math.ceil(a * 0.75)} jour(s) d'adaptation. ${dir} Hydrate-toi bien dans l'avion et cale-toi sur les horaires locaux dès l'arrivée.`;
}

/* ===================== Météo automatique du tableau de bord ===================== */

async function dashWeather(t) {
  const s0 = (t.steps || [])[0];
  const el = document.getElementById("dash-weather");
  if (!s0 || !el) return;
  try {
    const d = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${s0.lat}&longitude=${s0.lng}&current=temperature_2m,weather_code&timezone=auto`)).json();
    const [emo, txt] = wmoInfo(d.current.weather_code);
    el.innerHTML = `${emo} <b>${Math.round(d.current.temperature_2m)}°</b> ${txt.toLowerCase()} à ${esc(s0.name)}`;
  } catch (e) { /* hors ligne : on n'affiche rien */ }
}

/* ===================== Chasse aux défis ===================== */

function defisHTML(t) {
  t.defis = t.defis || [];
  const done = t.defis.filter(d => d.done).length;
  const people = t.people || [];
  if (!t.defis.length) {
    return `<p class="muted small" style="margin:6px 0 12px;">Relevez des défis pendant le voyage et gardez la photo-preuve ! Parfait avec les enfants.</p>
      <button class="btn btn-primary btn-sm" onclick="generateDefis('${t.id}')">⚡ Tirer 8 défis au hasard</button>`;
  }
  const rows = t.defis.map(d => {
    const by = people.find(p => p.id === d.by);
    return `<div class="defi-item ${d.done ? "done" : ""}">
      <button class="defi-check" onclick="toggleDefi('${t.id}','${d.id}')" title="${d.done ? "Annuler" : "Défi relevé !"}">${d.done ? "🏅" : "⭕"}</button>
      <div style="flex:1;">
        <div>${esc(d.label)}</div>
        ${people.length ? `<button class="chip" style="margin-top:4px;padding:1px 8px;" onclick="cycleDefiWinner('${t.id}','${d.id}')" title="Qui l'a relevé ?">${by ? by.emoji + " " + esc(by.name) : "👤 Attribuer"}</button>` : ""}
        <div class="attach-zone" data-owner="defi:${d.id}" data-dropowner="defi:${d.id}"></div>
        <label class="muted small" style="cursor:pointer;display:inline-block;margin-top:2px;">📎 photo-preuve
          <input type="file" accept="image/*" capture="environment" style="display:none" onchange="attachFile('defi:${d.id}',this)">
        </label>
      </div>
      <button class="icon-btn" onclick="deleteDefi('${t.id}','${d.id}')">🗑️</button>
    </div>`;
  }).join("");
  return `
    <div class="row" style="margin-bottom:8px;">
      <div class="progress-pill"><div class="fill" style="width:${Math.round(done / t.defis.length * 100)}%"></div></div>
      <span class="muted small" style="flex-shrink:0;">${done}/${t.defis.length} 🏅</span>
    </div>
    ${rows}
    <div class="row" style="margin-top:10px;">
      <input class="search-input" id="defi-new" placeholder="Défi personnalisé… (Entrée)" onkeydown="if(event.key==='Enter')addDefi('${t.id}')">
      <button class="btn btn-ghost btn-sm" onclick="generateDefis('${t.id}')">⚡ +8 au hasard</button>
    </div>`;
}

function generateDefis(tripId) {
  const t = getTrip(tripId);
  t.defis = t.defis || [];
  const existing = new Set(t.defis.map(d => d.label));
  let added = 0;
  shuffle(DEFIS).forEach(label => {
    if (added >= 8 || existing.has(label)) return;
    t.defis.push({ id: uid(), label, done: false, by: "" });
    added++;
  });
  saveState();
  renderTripDetail(document.getElementById("main"));
  loadAttachZones();
  toast(added ? `🏅 ${added} défi(s) ajouté(s) !` : "Tous les défis types sont déjà là !");
}

function addDefi(tripId) {
  const input = document.getElementById("defi-new");
  const label = input.value.trim();
  if (!label) return;
  getTrip(tripId).defis.push({ id: uid(), label, done: false, by: "" });
  saveState();
  renderTripDetail(document.getElementById("main"));
  loadAttachZones();
}

function toggleDefi(tripId, id) {
  const d = getTrip(tripId).defis.find(x => x.id === id);
  d.done = !d.done;
  saveState();
  renderTripDetail(document.getElementById("main"));
  loadAttachZones();
  if (d.done) toast("🏅 Défi relevé, bravo !");
}

function cycleDefiWinner(tripId, id) {
  const t = getTrip(tripId);
  const d = t.defis.find(x => x.id === id);
  const ids = ["", ...t.people.map(p => p.id)];
  d.by = ids[(ids.indexOf(d.by || "") + 1) % ids.length];
  saveState();
  renderTripDetail(document.getElementById("main"));
  loadAttachZones();
}

function deleteDefi(tripId, id) {
  const t = getTrip(tripId);
  deleteAttachmentsFor("defi:" + id);
  t.defis = t.defis.filter(x => x.id !== id);
  saveState();
  renderTripDetail(document.getElementById("main"));
  loadAttachZones();
}

/* ===================== Tableau des scores de quiz (par profil) ===================== */

function quizScores() {
  try { return JSON.parse(localStorage.getItem("mesVoyages.scores") || "{}"); } catch (e) { return {}; }
}

function saveQuizScoreByIdx(i, score, total) {
  const name = (window._quizNames || [])[i];
  if (!name) return;
  saveQuizScore(name, score, total);
  toast("🏆 Score enregistré pour " + name + " !");
  renderQuizQ();
}

function saveQuizScore(name, score, total) {
  if (!name) return;
  const all = quizScores();
  const rec = all[name] || { best: 0, games: 0, totalPts: 0 };
  rec.games++;
  rec.totalPts += score;
  rec.best = Math.max(rec.best, score);
  rec.lastTotal = total;
  all[name] = rec;
  localStorage.setItem("mesVoyages.scores", JSON.stringify(all));
}

function leaderboardHTML() {
  const all = quizScores();
  const entries = Object.entries(all).sort((a, b) => b[1].best - a[1].best);
  if (!entries.length) return "";
  const medals = ["🥇", "🥈", "🥉"];
  return `<div style="margin-top:12px;border-top:1px solid var(--border);padding-top:10px;">
    <b class="small">🏆 Classement famille</b>
    ${entries.map(([name, r], i) => `<div class="row" style="padding:3px 0;">
      <span style="width:24px;">${medals[i] || ""}</span>
      <span style="flex:1;">${esc(name)}</span>
      <span class="muted small">record ${r.best}/${r.lastTotal || 8} · ${r.games} partie(s)</span>
    </div>`).join("")}</div>`;
}

/* ===================== Jeu du pendu (voyage) ===================== */

function startPendu() {
  const word = PENDU_WORDS[Math.floor(Math.random() * PENDU_WORDS.length)];
  window._pendu = { word: word.toUpperCase(), found: new Set(), miss: 0, max: 7 };
  renderPendu();
}

function renderPendu() {
  const z = document.getElementById("pendu-zone");
  const p = window._pendu;
  if (!z || !p) return;
  const display = p.word.split("").map(c => c === " " ? "&nbsp;&nbsp;" : (p.found.has(c) ? c : "_")).join(" ");
  const won = p.word.split("").every(c => c === " " || p.found.has(c));
  const lost = p.miss >= p.max;
  const heads = "😀😟😦😧😨😰😱💀";
  if (won || lost) {
    z.innerHTML = `<div style="font-size:2.4rem;">${won ? "🎉" : "💀"}</div>
      <p style="font-size:1.3rem;letter-spacing:3px;margin:6px 0;"><b>${p.word}</b></p>
      <p style="margin-bottom:10px;">${won ? "Gagné ! 🏆" : "Perdu… le mot était ci-dessus."}</p>
      <button class="btn btn-primary btn-sm" onclick="startPendu()">🔄 Nouveau mot</button>`;
    return;
  }
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map(l =>
    `<button class="pendu-key" ${p.found.has(l) || p._tried && p._tried.has(l) ? "disabled" : ""} onclick="guessPendu('${l}')">${l}</button>`).join("");
  z.innerHTML = `
    <div style="font-size:2.4rem;">${heads[Math.min(p.miss, 7)]}</div>
    <p style="font-size:1.4rem;letter-spacing:4px;margin:8px 0;font-family:monospace;">${display}</p>
    <p class="muted small">Erreurs : ${p.miss}/${p.max}</p>
    <div class="pendu-keys">${letters}</div>`;
}

function guessPendu(l) {
  const p = window._pendu;
  if (!p) return;
  p._tried = p._tried || new Set();
  if (p._tried.has(l)) return;
  p._tried.add(l);
  if (p.word.includes(l)) p.found.add(l);
  else p.miss++;
  renderPendu();
}

/* ===================== Suivi des papiers d'identité ===================== */

function passportsHTML() {
  const docs = state.passports || [];
  const today = todayISO();
  const rows = docs.map(d => {
    const days = d.expires ? daysBetween(today, d.expires) : null;
    let badge = "";
    if (days != null) {
      if (days < 0) badge = `<span class="todo-late small">⛔ expiré</span>`;
      else if (days < 180) badge = `<span class="todo-late small">⚠️ expire dans ${days} j</span>`;
      else badge = `<span class="muted small">✅ valide (${Math.floor(days / 30)} mois)</span>`;
    }
    return `<div class="row-between" style="padding:7px 0;border-bottom:1px solid var(--border);">
      <span>${d.type === "passeport" ? "🛂" : "🪪"} <b>${esc(d.name)}</b> <span class="muted small">${d.type}${d.expires ? " · exp. " + fmtDateShort(d.expires) : ""}</span> ${badge}</span>
      <button class="icon-btn" onclick="deletePassport('${d.id}')">🗑️</button>
    </div>`;
  }).join("");
  return `<div class="card" style="margin-bottom:18px;max-width:560px;">
    <h3>🛂 Papiers d'identité de la famille</h3>
    <p class="muted small" style="margin:8px 0 10px;">Enregistre les dates d'expiration : l'app te prévient sur le tableau de bord quand un papier approche de sa fin de validité (beaucoup de pays exigent 6 mois de validité après le retour).</p>
    ${rows || `<p class="muted small">Aucun papier enregistré.</p>`}
    <div class="form-row" style="margin-top:12px;align-items:flex-end;">
      <div class="form-group" style="margin:0;flex:2;"><label>Titulaire</label><input id="pp-name" placeholder="Ex : Mateo"></div>
      <div class="form-group" style="margin:0;"><label>Type</label><select id="pp-type"><option value="passeport">🛂 Passeport</option><option value="CNI">🪪 Carte d'identité</option></select></div>
      <div class="form-group" style="margin:0;"><label>Expire le</label><input id="pp-exp" type="date"></div>
      <button class="btn btn-primary btn-sm" onclick="addPassport()">Ajouter</button>
    </div>
  </div>`;
}

function addPassport() {
  const name = document.getElementById("pp-name").value.trim();
  if (!name) { toast("⚠️ Indique le titulaire"); return; }
  state.passports = state.passports || [];
  state.passports.push({ id: uid(), name, type: document.getElementById("pp-type").value, expires: document.getElementById("pp-exp").value });
  saveState();
  renderSettings(document.getElementById("main"));
  toast("🛂 Papier enregistré");
}

function deletePassport(id) {
  state.passports = (state.passports || []).filter(x => x.id !== id);
  saveState();
  renderSettings(document.getElementById("main"));
}

// Alerte sur le tableau de bord : papiers bientôt expirés (ou pendant/après un voyage à venir)
function passportAlertHTML() {
  const docs = state.passports || [];
  if (!docs.length) return "";
  const today = todayISO();
  const items = [];
  docs.forEach(d => {
    if (!d.expires) return;
    const days = daysBetween(today, d.expires);
    // pertinent si expiré, ou expire sous 6 mois, ou couvre mal un voyage à venir
    let warnTrip = null;
    state.trips.forEach(t => {
      if (t.end && t.end > today && t.status !== "idee" && t.status !== "termine") {
        // règle des 6 mois après le retour
        const need = addDaysISO(t.end, 180);
        if (d.expires < need && (!warnTrip || t.end < warnTrip.end)) warnTrip = t;
      }
    });
    if (days < 180 || warnTrip) items.push({ d, days, warnTrip });
  });
  if (!items.length) return "";
  const rows = items.sort((a, b) => a.days - b.days).map(({ d, days, warnTrip }) =>
    `<div class="row" style="padding:5px 0;cursor:pointer;" onclick="showView('settings')">
      <span>${days < 0 ? "⛔" : "⚠️"}</span>
      <span style="flex:1;">${d.type === "passeport" ? "🛂" : "🪪"} ${esc(d.name)} — ${days < 0 ? "papier expiré" : "expire dans " + days + " j"}${warnTrip ? ` <span class="muted small">(risqué pour « ${esc(warnTrip.title)} » : 6 mois de validité souvent exigés)</span>` : ""}</span>
    </div>`).join("");
  return `<div class="card" style="margin-bottom:24px;border-left:4px solid var(--danger);">
    <h3>🛂 Papiers d'identité à surveiller</h3>
    <div style="margin-top:8px;">${rows}</div>
  </div>`;
}

/* ===================== « Que voir autour ? » (Wikipédia geosearch) ===================== */

async function nearbyStep(tripId, stepId) {
  const s = getTrip(tripId).steps.find(x => x.id === stepId);
  if (!s) return;
  window._nearbyTrip = tripId;
  openModal("🏛️ À voir autour de " + esc(s.name), `<p class="muted">⏳ Recherche des lieux d'intérêt…</p>`);
  try {
    const url = `https://fr.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${s.lat}|${s.lng}&gsradius=10000&gslimit=20&format=json&origin=*`;
    const data = await (await fetch(url)).json();
    const places = (data.query && data.query.geosearch) || [];
    window._nearby = places;
    if (!places.length) { document.getElementById("modal-body").innerHTML = `<p class="muted">Aucun lieu trouvé dans un rayon de 10 km.</p>`; return; }
    // On référence chaque lieu par index : pas de chaîne utilisateur dans les onclick (anti-injection)
    const rows = places.map((p, i) => {
      const dist = haversineKm(s, { lat: p.lat, lng: p.lon });
      return `<div class="expense-row" style="cursor:pointer;" onclick="guideNearby(${i})">
        <span class="exp-cat">📍</span>
        <div class="exp-label"><div>${esc(p.title)}</div><div class="muted small">à ${fmtKm(dist)} · clic pour le guide 📖</div></div>
        <button class="icon-btn" title="Ajouter comme étape" onclick="event.stopPropagation();addNearbyStep(${i})">＋</button>
      </div>`;
    }).join("");
    document.getElementById("modal-body").innerHTML = `
      <p class="muted small" style="margin-bottom:10px;">${places.length} lieu(x) dans un rayon de 10 km (source : Wikipédia). Clique un nom pour le guide, ou ＋ pour l'ajouter à ton itinéraire.</p>
      <div style="max-height:50vh;overflow-y:auto;">${rows}</div>`;
  } catch (e) {
    document.getElementById("modal-body").innerHTML = `<p class="muted">❌ Recherche impossible (connexion ?).</p>`;
  }
}

function guideNearby(i) {
  const p = (window._nearby || [])[i];
  if (p) guideFor(p.title);
}

function addNearbyStep(i) {
  const p = (window._nearby || [])[i];
  if (p && window._nearbyTrip) addStepAt(window._nearbyTrip, p.lat, p.lon, p.title);
}

/* ===================== Comparateur de destinations (climat) ===================== */

const MOIS_NOMS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

function openDestCompare() {
  const wishes = state.wishlist;
  if (wishes.length < 2) { toast("Ajoute au moins 2 envies pour les comparer 💫"); return; }
  const nextMonth = new Date().getMonth();
  openModal("🌡️ Comparer mes destinations", `
    <p class="muted small" style="margin-bottom:12px;">Choisis 2 ou 3 destinations et un mois : l'app compare le climat (températures, pluie), la distance et le décalage horaire. Nécessite internet.</p>
    <div class="form-group"><label>Destinations à comparer</label>
      <div class="filters" style="margin:0;flex-direction:column;align-items:stretch;gap:4px;">
        ${wishes.map((w, i) => `<label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
          <input type="checkbox" class="cmp-wish" value="${i}" style="width:auto;"> ${flagFor(w.country)} ${esc(w.destination)}${w.country ? " <span class='muted small'>(" + esc(w.country) + ")</span>" : ""}</label>`).join("")}
      </div></div>
    <div class="form-group"><label>Mois envisagé</label>
      <select id="cmp-month">${MOIS_NOMS.map((m, i) => `<option value="${i}" ${i === nextMonth ? "selected" : ""}>${m}</option>`).join("")}</select></div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="runDestCompare()">🌡️ Comparer</button>
    </div>
    <div id="cmp-dest-result" style="margin-top:12px;"></div>`);
}

async function geocodeOne(q) {
  const res = await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=fr&q=" + encodeURIComponent(q));
  const d = await res.json();
  return d && d[0] ? { lat: +d[0].lat, lng: +d[0].lon } : null;
}

async function runDestCompare() {
  const picked = [...document.querySelectorAll(".cmp-wish:checked")].map(c => state.wishlist[+c.value]);
  if (picked.length < 2) { toast("Choisis au moins 2 destinations"); return; }
  if (picked.length > 3) { toast("3 destinations maximum à la fois"); return; }
  const month = +document.getElementById("cmp-month").value;
  const box = document.getElementById("cmp-dest-result");
  box.innerHTML = `<p class="muted small">⏳ Géolocalisation et climat en cours…</p>`;

  // Repère "maison" : France par défaut (Paris)
  const home = { lat: 48.8566, lng: 2.3522 };
  const year = new Date().getFullYear() - 1;
  const mm = String(month + 1).padStart(2, "0");
  const lastDay = new Date(year, month + 1, 0).getDate();

  try {
    const cols = [];
    for (const w of picked) {
      const loc = await geocodeOne(w.destination + (w.country ? ", " + w.country : ""));
      if (!loc) { cols.push({ w, err: true }); continue; }
      let climate = null;
      try {
        const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${loc.lat}&longitude=${loc.lng}&start_date=${year}-${mm}-01&end_date=${year}-${mm}-${lastDay}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto`;
        const d = await (await fetch(url)).json();
        if (d.daily) {
          const avg = a => a.reduce((s, x) => s + (x || 0), 0) / a.length;
          const rainyDays = d.daily.precipitation_sum.filter(x => x >= 1).length;
          climate = {
            tmax: Math.round(avg(d.daily.temperature_2m_max)),
            tmin: Math.round(avg(d.daily.temperature_2m_min)),
            rain: Math.round(d.daily.precipitation_sum.reduce((s, x) => s + (x || 0), 0)),
            rainyDays
          };
        }
      } catch (e) {}
      cols.push({ w, loc, climate, dist: haversineKm(home, loc) });
    }

    const rows = [
      ["🌡️ Temp. max moy.", c => c.climate ? c.climate.tmax + "°" : "—"],
      ["🌡️ Temp. min moy.", c => c.climate ? c.climate.tmin + "°" : "—"],
      ["🌧️ Pluie du mois", c => c.climate ? c.climate.rain + " mm" : "—"],
      ["☔ Jours de pluie", c => c.climate ? c.climate.rainyDays + " j" : "—"],
      ["✈️ Distance (Paris)", c => c.dist ? fmtKm(c.dist) : "—"],
      ["💰 Budget estimé", c => c.w.budget ? fmtMoney(c.w.budget) : "—"]
    ];
    box.innerHTML = `
      <p class="small" style="margin-bottom:8px;">Climat de référence : <b>${MOIS_NOMS[month]} ${year}</b> (données Open-Meteo).</p>
      <table class="phrase-table" style="width:100%;">
        <tr><td></td>${cols.map(c => `<td style="text-align:center;"><b>${flagFor(c.w.country)} ${esc(c.w.destination)}</b></td>`).join("")}</tr>
        ${rows.map(([label, fn]) => `<tr><td class="muted">${label}</td>${cols.map(c => `<td style="text-align:center;">${c.err ? "❓" : "<b>" + fn(c) + "</b>"}</td>`).join("")}</tr>`).join("")}
      </table>`;
  } catch (e) {
    box.innerHTML = `<p class="muted small">❌ Comparaison impossible (connexion ?).</p>`;
  }
}

/* ===================== Export / import ZIP complet (avec photos) ===================== */
/* Générateur ZIP maison (méthode STORE, sans compression ni librairie externe). */

function crc32(u8) {
  let c = ~0;
  for (let i = 0; i < u8.length; i++) {
    c ^= u8[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function makeZip(entries) {
  const enc = new TextEncoder();
  const chunks = [], central = [];
  let offset = 0;
  const u16 = n => [n & 0xff, (n >> 8) & 0xff];
  const u32 = n => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];
  for (const e of entries) {
    const name = enc.encode(e.name);
    const data = e.data;
    const crc = crc32(data), size = data.length;
    const local = [].concat(u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(crc), u32(size), u32(size), u16(name.length), u16(0));
    chunks.push(new Uint8Array(local), name, data);
    const cd = [].concat(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(crc), u32(size), u32(size), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset));
    central.push(new Uint8Array(cd), name);
    offset += local.length + name.length + size;
  }
  const cdStart = offset;
  let cdSize = 0;
  central.forEach(c => { chunks.push(c); cdSize += c.length; });
  const n = central.length / 2;
  chunks.push(new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0), u16(n), u16(n), u32(cdSize), u32(cdStart), u16(0))));
  return new Blob(chunks, { type: "application/zip" });
}

function readZip(buf) {
  const view = new DataView(buf), u8 = new Uint8Array(buf), dec = new TextDecoder();
  const files = {};
  let o = 0;
  while (o + 4 <= view.byteLength && view.getUint32(o, true) === 0x04034b50) {
    const nameLen = view.getUint16(o + 26, true);
    const extraLen = view.getUint16(o + 28, true);
    const size = view.getUint32(o + 22, true);
    const name = dec.decode(u8.subarray(o + 30, o + 30 + nameLen));
    const dataStart = o + 30 + nameLen + extraLen;
    files[name] = u8.subarray(dataStart, dataStart + size);
    o = dataStart + size;
  }
  return files;
}

async function exportZip() {
  toast("⏳ Préparation de la sauvegarde complète…");
  try {
    const enc = new TextEncoder();
    const entries = [{ name: "data.json", data: enc.encode(JSON.stringify(state, null, 1)) }];
    const db = await fdb();
    const all = await new Promise((res, rej) => {
      const rq = db.transaction("files").objectStore("files").getAll();
      rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
    });
    const manifest = [];
    for (const f of all) {
      entries.push({ name: "files/" + f.id, data: new Uint8Array(await f.blob.arrayBuffer()) });
      manifest.push({ id: f.id, owner: f.owner, name: f.name, type: f.type });
    }
    entries.push({ name: "files.json", data: enc.encode(JSON.stringify(manifest)) });
    const blob = makeZip(entries);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "mes-voyages-complet-" + todayISO() + ".zip";
    a.click();
    URL.revokeObjectURL(a.href);
    toast(`📦 Sauvegarde complète : ${state.trips.length} voyage(s) + ${manifest.length} photo(s)/fichier(s)`);
  } catch (e) {
    toast("❌ Export impossible : " + e.message);
  }
}

async function importZip(input) {
  const file = input.files[0];
  if (!file) return;
  if (!confirm("Remplacer TOUTES les données actuelles (voyages, envies ET photos) par cette sauvegarde complète ?")) { input.value = ""; return; }
  toast("⏳ Restauration en cours…");
  try {
    const files = readZip(await file.arrayBuffer());
    const dec = new TextDecoder();
    if (!files["data.json"]) throw new Error("fichier .zip invalide (data.json manquant)");
    const data = JSON.parse(dec.decode(files["data.json"]));
    if (!Array.isArray(data.trips)) throw new Error("format invalide");

    state = Object.assign({ trips: [], wishlist: [], trash: [], passports: [], settings: {} }, data);
    state.settings = Object.assign({ theme: "light", currency: "EUR", userName: "" }, data.settings);

    // Restauration des pièces jointes dans IndexedDB
    const manifest = files["files.json"] ? JSON.parse(dec.decode(files["files.json"])) : [];
    if (manifest.length) {
      const db = await fdb();
      for (const m of manifest) {
        const bytes = files["files/" + m.id];
        if (!bytes) continue;
        const blob = new Blob([bytes.slice()], { type: m.type || "application/octet-stream" });
        await new Promise((res, rej) => {
          const tx = db.transaction("files", "readwrite");
          tx.objectStore("files").put({ id: m.id, owner: m.owner, name: m.name, type: m.type, blob });
          tx.oncomplete = res; tx.onerror = () => rej(tx.error);
        });
      }
    }
    saveState();
    applyTheme();
    showView("dashboard");
    toast(`✅ Sauvegarde restaurée : ${state.trips.length} voyage(s) + ${manifest.length} fichier(s) !`);
  } catch (e) {
    toast("❌ Restauration impossible : " + e.message);
  }
  input.value = "";
}

/* ===================== Statistiques par voyageur ===================== */

function travelerRank(n) {
  if (n >= 10) return "🏆 Grand aventurier";
  if (n >= 5) return "🌍 Globe-trotteur";
  if (n >= 2) return "🧭 Voyageur";
  return "🌱 Explorateur en herbe";
}

function travelerStatsHTML() {
  // Agrège par prénom normalisé, à travers tous les voyages
  const by = {};
  state.trips.forEach(t => {
    const km = tripTotalKm(t);
    (t.people || []).forEach(p => {
      const key = (p.name || "").trim().toLowerCase();
      if (!key) return;
      const r = by[key] || (by[key] = { name: p.name, emoji: p.emoji, trips: 0, days: 0, paid: 0, defis: 0, km: 0, countries: new Set(), tripList: [], farewells: [] });
      r.trips++;
      r.days += tripDuration(t);
      r.km += km;
      if (t.country && countryInfo(t.country)) r.countries.add(t.country);
      r.paid += (t.expenses || []).filter(e => e.payer === p.id).reduce((s, e) => s + (+e.amount || 0), 0);
      r.defis += (t.defis || []).filter(d => d.by === p.id && d.done).length;
      r.tripList.push({ title: t.title, country: t.country, start: t.start });
      const fw = t.farewells && t.farewells[p.id];
      if (fw) r.farewells.push({ trip: t.title, text: fw });
    });
  });
  const people = Object.values(by).map(r => Object.assign(r, { countries: [...r.countries] }));
  if (!people.length) return "";
  people.sort((a, b) => b.trips - a.trips || b.days - a.days);
  window._travelers = people;
  const rows = people.map((p, i) => `
    <div class="row-between traveler-row" style="padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer;" onclick="openTravelerProfile(${i})">
      <span style="flex:1;"><b>${p.emoji || "🧑"} ${esc(p.name)}</b> <span class="muted small">· ${travelerRank(p.countries.length)}</span></span>
      <span class="muted small">${p.trips} voyage(s) · ${p.days} j · ${p.countries.length} pays${p.paid ? " · a payé " + fmtMoney(p.paid) : ""}${p.defis ? " · 🏅 " + p.defis : ""} ›</span>
    </div>`).join("");
  return `<div class="card" style="margin-bottom:20px;">
    <h3>🧑‍🤝‍🧑 Statistiques par voyageur</h3>
    <p class="muted small" style="margin:4px 0 6px;">Clique un voyageur pour voir sa fiche profil détaillée. 👇</p>
    <div style="margin-top:6px;">${rows}</div>
  </div>`;
}

function openTravelerProfile(i) {
  const p = (window._travelers || [])[i];
  if (!p) return;
  const stat = (v, l) => `<div class="stat-mini"><b>${v}</b><span>${l}</span></div>`;
  const trips = p.tripList.slice().sort((a, b) => (b.start || "").localeCompare(a.start || "")).map(tr =>
    `<div class="row" style="padding:3px 0;"><span>${flagFor(tr.country)}</span><span style="flex:1;">${esc(tr.title)}</span><span class="muted small">${tr.start ? fmtDateShort(tr.start) : ""}</span></div>`).join("");
  const chips = p.countries.length ? p.countries.map(c => `<span class="country-chip">${flagFor(c)} ${esc(c)}</span>`).join("") : `<span class="muted small">Aucun pays encore</span>`;
  const fw = p.farewells.length ? `<div style="margin-top:16px;"><b>💬 Ses mots de la fin</b>${p.farewells.map(f => `<p class="muted small" style="margin-top:4px;white-space:pre-wrap;">« ${esc(f.text)} » <span class="muted">— ${esc(f.trip)}</span></p>`).join("")}</div>` : "";
  openModal(`${p.emoji || "🧑"} ${esc(p.name)}`, `
    <p style="margin-bottom:12px;font-size:1.1rem;font-weight:700;">${travelerRank(p.countries.length)}</p>
    <div class="profile-stats">
      ${stat(p.trips, "voyages")}${stat(p.days, "jours")}${stat(p.countries.length, "pays")}
      ${stat(Math.round(p.km).toLocaleString("fr-FR") + " km", "parcourus")}${p.paid ? stat(fmtMoney(p.paid), "payé") : ""}${p.defis ? stat("🏅 " + p.defis, "défis") : ""}
    </div>
    <div style="margin-top:16px;"><b>🗺️ Pays visités</b><div class="row" style="flex-wrap:wrap;gap:6px;margin-top:8px;">${chips}</div></div>
    <div style="margin-top:16px;"><b>🧳 Ses voyages</b><div style="margin-top:6px;">${trips || '<span class="muted small">—</span>'}</div></div>
    ${fw}
    <div class="form-actions"><button class="btn btn-primary" onclick="closeModal()">Fermer</button></div>`);
}

/* ===================== Records familiaux ===================== */

function recordsHTML() {
  const recs = [];
  let topExp = null, topMeal = null, topLeg = null, topDay = null, topRated = null, topKmTrip = null;

  state.trips.forEach(t => {
    (t.expenses || []).forEach(e => {
      if (!topExp || +e.amount > +topExp.e.amount) topExp = { e, t };
      if (e.category === "restauration" && (!topMeal || +e.amount > +topMeal.e.amount)) topMeal = { e, t };
    });
    // journée la plus chère (par date)
    const byDay = {};
    (t.expenses || []).forEach(e => { if (e.date) byDay[e.date] = (byDay[e.date] || 0) + (+e.amount || 0); });
    Object.entries(byDay).forEach(([d, v]) => { if (!topDay || v > topDay.v) topDay = { d, v, t }; });
    // plus long tronçon
    const st = t.steps || [];
    for (let i = 1; i < st.length; i++) {
      const km = haversineKm(st[i - 1], st[i]);
      if (!topLeg || km > topLeg.km) topLeg = { km, from: st[i - 1].name, to: st[i].name, t };
    }
    const km = tripTotalKm(t);
    if (km && (!topKmTrip || km > topKmTrip.km)) topKmTrip = { km, t };
    if (t.awards && t.awards.note && (!topRated || t.awards.note > topRated.t.awards.note)) topRated = { t };
  });

  if (topExp && +topExp.e.amount) recs.push(`💸 <b>Plus grosse dépense :</b> ${fmtMoney(topExp.e.amount)} — ${esc(topExp.e.label)} <span class="muted small">(${esc(topExp.t.title)})</span>`);
  if (topMeal && +topMeal.e.amount) recs.push(`🍽️ <b>Repas le plus cher :</b> ${fmtMoney(topMeal.e.amount)} — ${esc(topMeal.e.label)} <span class="muted small">(${esc(topMeal.t.title)})</span>`);
  if (topDay) recs.push(`📅 <b>Journée la plus dépensière :</b> ${fmtMoney(topDay.v)} le ${fmtDateShort(topDay.d)} <span class="muted small">(${esc(topDay.t.title)})</span>`);
  if (topLeg) recs.push(`🛣️ <b>Plus long trajet :</b> ${fmtKm(topLeg.km)} de ${esc(topLeg.from)} à ${esc(topLeg.to)} <span class="muted small">(${esc(topLeg.t.title)})</span>`);
  if (topKmTrip) recs.push(`🌍 <b>Voyage le plus lointain :</b> ${fmtKm(topKmTrip.km)} parcourus <span class="muted small">(${esc(topKmTrip.t.title)})</span>`);
  if (topRated) recs.push(`⭐ <b>Voyage préféré :</b> ${"★".repeat(topRated.t.awards.note)} <span class="muted small">(${esc(topRated.t.title)})</span>`);

  if (!recs.length) return "";
  return `<div class="card" style="margin-bottom:20px;">
    <h3>🏆 Les records de la famille</h3>
    <div style="margin-top:10px;">${recs.map(r => `<div style="padding:5px 0;">${r}</div>`).join("")}</div>
  </div>`;
}

/* ===================== Corbeille du journal / des documents ===================== */

function itemTrashHTML(t, type) {
  const trash = (t.itemTrash || []).filter(x => x.type === type);
  if (!trash.length) return "";
  const label = type === "journal" ? "souvenir(s)" : "info(s)";
  const rows = trash.map(x => {
    const idx = (t.itemTrash || []).indexOf(x);
    return `<div class="row-between" style="padding:6px 0;border-bottom:1px solid var(--border);">
      <span>${type === "journal" ? (x.item.mood || "📔") : "📄"} ${esc(x.item.title)} <span class="muted small">supprimé le ${fmtDateShort(x.deletedAt)}</span></span>
      <div class="row">
        <button class="btn btn-secondary btn-sm" onclick="restoreItem('${t.id}',${idx})">↩️ Restaurer</button>
        <button class="icon-btn" title="Supprimer définitivement" onclick="purgeItem('${t.id}',${idx})">🔥</button>
      </div>
    </div>`;
  }).join("");
  return `<details class="card" style="margin-top:18px;">
    <summary style="cursor:pointer;font-weight:600;">🗑️ Corbeille — ${trash.length} ${label}</summary>
    <div style="margin-top:10px;">${rows}</div>
  </details>`;
}

function restoreItem(tripId, idx) {
  const t = getTrip(tripId);
  const x = (t.itemTrash || [])[idx];
  if (!x) return;
  if (x.type === "journal") (t.journal = t.journal || []).push(x.item);
  else (t.documents = t.documents || []).push(x.item);
  t.itemTrash.splice(idx, 1);
  saveState();
  renderTripDetail(document.getElementById("main"));
  toast("↩️ Restauré !");
}

function purgeItem(tripId, idx) {
  const t = getTrip(tripId);
  const x = (t.itemTrash || [])[idx];
  if (!x) return;
  if (!confirm("Supprimer définitivement « " + x.item.title + " » et ses pièces jointes ?")) return;
  deleteAttachmentsFor(x.item.id);
  t.itemTrash.splice(idx, 1);
  saveState();
  renderTripDetail(document.getElementById("main"));
  toast("🔥 Supprimé définitivement");
}

/* ===================== Pièce jointe compacte (ticket sur une dépense) ===================== */

function attachZoneCompactHTML(ownerId) {
  return `
    <div class="attach-zone" data-owner="${ownerId}" style="margin-top:4px;"></div>
    <label class="muted small" style="cursor:pointer;display:inline-block;margin-top:2px;" onclick="event.stopPropagation()">📎 joindre le ticket
      <input type="file" accept="image/*,application/pdf" multiple style="display:none" onchange="attachFile('${ownerId}',this)">
    </label>`;
}

/* ============================================================
   🛰️ PLANISPHÈRE — toutes les photos de voyage sur la Terre vue
   du ciel. Cadre coloré selon l'ancienneté (récent = chaud,
   ancien = froid), regroupement (clustering) + vignettes en cache,
   curseur temporel, filtres, lignes de parcours, animation et
   import de masse auto-trié.
   ============================================================ */

// Fonds de carte (satellite Esri sans clé + plan CARTO repli)
const PLAN_SAT = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const PLAN_LABELS = "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";
const PLAN_PLAN = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";

// Distance approx. en km entre 2 points (pour le tri auto à l'import)
function planKm(la1, ln1, la2, ln2) {
  const R = 6371, r = x => x * Math.PI / 180;
  const dLa = r(la2 - la1), dLn = r(ln2 - ln1);
  const s = Math.sin(dLa / 2) ** 2 + Math.cos(r(la1)) * Math.cos(r(la2)) * Math.sin(dLn / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Date d'une photo : champ explicite, sinon devinée d'après le nom (20250612_…), sinon date du voyage
function planPhotoDate(p, t) {
  if (p.date) return p.date;
  const m = (p.name || "").match(/(20\d{2})[-_.]?(\d{2})[-_.]?(\d{2})/);
  if (m) { const mm = +m[2], dd = +m[3]; if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) return `${m[1]}-${m[2]}-${m[3]}`; }
  if (t && t.start) return t.start;
  return null;
}

// Couleur du cadre : frac 0 = la plus ancienne (froid/violet) → 1 = la plus récente (chaud/rouge)
function planAgeColor(frac) {
  frac = Math.max(0, Math.min(1, isFinite(frac) ? frac : 0.5));
  const hue = 255 - frac * 243; // 255 (violet) → 12 (rouge)
  return `hsl(${hue.toFixed(0)},80%,52%)`;
}
function planFrac(time) {
  const P = window._plan; if (!P || time == null || P.hi <= P.lo) return 0.5;
  return (time - P.lo) / (P.hi - P.lo);
}

// Toutes les photos géolocalisées, tous voyages confondus, triées par date
function planAllPhotos() {
  const out = [];
  (state.trips || []).forEach(t => {
    (t.geophotos || []).forEach(p => {
      if (typeof p.lat !== "number" || typeof p.lng !== "number") return;
      const d = planPhotoDate(p, t);
      out.push({ id: p.id, name: p.name, lat: p.lat, lng: p.lng, date: d, t: d ? Date.parse(d) : null,
        tripId: t.id, tripTitle: t.title, country: t.country || "", color: t.color || "#4f6df5" });
    });
  });
  out.sort((a, b) => (a.t || 0) - (b.t || 0));
  return out;
}

// Vignette mise en cache dans IndexedDB (clé "thumb:<id>") → générée une seule fois
async function planThumbURL(id) {
  try {
    let rec = await fdbGet("thumb:" + id);
    if (!rec) {
      const orig = await fdbGet(id);
      if (!orig || !orig.blob) return null;
      let blob = orig.blob;
      try { const c = await shrinkImageBlob(orig.blob, 130, 0.6); blob = await new Promise(r => c.toBlob(r, "image/jpeg", 0.6)); } catch (e) {}
      try {
        const db = await fdb();
        await new Promise(res => { const tx = db.transaction("files", "readwrite"); tx.objectStore("files").put({ id: "thumb:" + id, owner: "thumbcache", type: "image/jpeg", blob }); tx.oncomplete = res; tx.onerror = res; });
      } catch (e) {}
      rec = { blob };
    }
    const url = URL.createObjectURL(rec.blob);
    (window._plan && window._plan.urls || []).push(url);
    return url;
  } catch (e) { return null; }
}

// File d'attente : on ne charge que les vignettes visibles, 6 en parallèle max
function planQueueThumb(id, el) { window._planQ = window._planQ || []; window._planQ.push([id, el]); planPumpThumb(); }
function planPumpThumb() {
  window._planActive = window._planActive || 0;
  while (window._planActive < 6 && window._planQ && window._planQ.length) {
    const [id, el] = window._planQ.shift();
    window._planActive++;
    planThumbURL(id).then(url => {
      if (!el.isConnected) return;
      if (url) { el.style.backgroundImage = `url(${url})`; el.classList.add("loaded"); }
      else { el.classList.add("missing"); el.textContent = "📷"; } // blob absent de cet appareil
    }).catch(() => {}).finally(() => { window._planActive--; planPumpThumb(); });
  }
}
function planLoadVisibleThumbs() {
  document.querySelectorAll("#planmap .ph-thumb[data-thumb]").forEach(el => {
    const id = el.getAttribute("data-thumb"); el.removeAttribute("data-thumb"); planQueueThumb(id, el);
  });
}

function planMarker(p) {
  const color = planAgeColor(planFrac(p.t));
  const icon = L.divIcon({ className: "ph-marker", iconSize: [46, 46], iconAnchor: [23, 23],
    html: `<div class="ph-frame" style="border-color:${color}"><span class="ph-thumb" data-thumb="${p.id}"></span></div>` });
  const m = L.marker([p.lat, p.lng], { icon });
  m._phFrac = planFrac(p.t);
  bindPhotoPopup(m, p.id, (p.name || "Photo") + (p.tripTitle ? " — " + p.tripTitle : ""));
  return m;
}

function planClusterIcon(cluster) {
  let sum = 0, n = 0;
  cluster.getAllChildMarkers().forEach(m => { if (typeof m._phFrac === "number") { sum += m._phFrac; n++; } });
  const c = cluster.getChildCount();
  const size = c > 200 ? 52 : c > 30 ? 46 : 40;
  return L.divIcon({ className: "", iconSize: [size, size],
    html: `<div class="plan-cluster" style="width:${size}px;height:${size}px;background:${planAgeColor(n ? sum / n : 0.5)}">${c}</div>` });
}

function planAddLayers(group, arr) { if (group.addLayers) group.addLayers(arr); else arr.forEach(m => group.addLayer(m)); }

function planCleanup() {
  if (window._planAnimTimer) { clearInterval(window._planAnimTimer); window._planAnimTimer = null; }
  (window._plan && window._plan.urls || []).forEach(u => { try { URL.revokeObjectURL(u); } catch (e) {} });
  if (window._plan && window._plan.map) { try { window._plan.map.remove(); } catch (e) {} }
  window._planQ = []; window._planActive = 0;
  window._plan = null;
}

async function renderPlanisphere(main) {
  planCleanup();
  const photos = planAllPhotos();
  const withDate = photos.filter(p => p.t != null);
  const lo = withDate.length ? withDate[0].t : Date.now();
  const hi = withDate.length ? withDate[withDate.length - 1].t : Date.now();
  const yMin = +new Date(lo).getFullYear(), yMax = +new Date(hi).getFullYear();
  const trips = (state.trips || []).filter(t => (t.geophotos || []).length);
  const countries = [...new Set(photos.map(p => p.country).filter(Boolean))].sort();

  main.innerHTML = `
    <h1 class="page-title">🛰️ Planisphère</h1>
    <p class="page-sub">Toutes tes photos sur la Terre vue du ciel — le cadre se colore selon l'ancienneté.</p>
    <div class="card plan-toolbar">
      <div class="plan-row">
        <label class="plan-field">Voyage
          <select id="plan-trip" onchange="planApplyFilters()">
            <option value="">Tous (${trips.length})</option>
            ${trips.map(t => `<option value="${t.id}">${esc(t.title)}</option>`).join("")}
          </select></label>
        <label class="plan-field">Pays
          <select id="plan-country" onchange="planApplyFilters()">
            <option value="">Tous</option>
            ${countries.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("")}
          </select></label>
        <label class="plan-field">Fond
          <select id="plan-base" onchange="planSetBase(this.value)">
            <option value="sat">🛰️ Satellite</option>
            <option value="sat-labels">🛰️ Satellite + noms</option>
            <option value="plan">🗺️ Plan</option>
          </select></label>
        <label class="plan-toggle" style="margin-top:14px;"><input type="checkbox" id="plan-lines" onchange="planApplyFilters()"> 🧵 Lignes de parcours</label>
      </div>
      <div class="plan-row">
        <span class="small" style="min-width:150px;">Période : <b id="plan-range">${yMin} – ${yMax}</b></span>
        <input type="range" id="plan-y0" min="${yMin}" max="${yMax}" value="${yMin}" oninput="planApplyFilters()" style="flex:1;min-width:120px;">
        <input type="range" id="plan-y1" min="${yMin}" max="${yMax}" value="${yMax}" oninput="planApplyFilters()" style="flex:1;min-width:120px;">
        <button class="btn btn-secondary btn-sm" id="plan-play" onclick="planPlay()" title="Voyage dans le temps">▶ Animer</button>
      </div>
      <div class="plan-row" style="justify-content:space-between;">
        <span class="plan-legend">${yMin}<span class="plan-gradient"></span>${yMax} <span class="muted small">(ancien → récent)</span></span>
        <label class="btn btn-primary btn-sm" style="cursor:pointer;">📥 Importer des photos
          <input type="file" accept="image/*" multiple style="display:none" onchange="planImport(this)"></label>
      </div>
    </div>
    <div id="planmap" class="map-container" style="height:600px;"></div>
    <div class="muted small" id="plan-info" style="margin-top:10px;"></div>`;

  if (typeof L === "undefined") {
    document.getElementById("planmap").outerHTML = `<div class="empty-state card"><span class="big-emoji">📡</span><p>Le planisphère a besoin d'une connexion internet (fond satellite).</p></div>`;
    return;
  }

  const map = L.map("planmap", { worldCopyJump: true, minZoom: 2, maxZoom: 19 }).setView([25, 10], 2);
  const cluster = L.markerClusterGroup
    ? L.markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 55, disableClusteringAtZoom: 17, spiderfyOnMaxZoom: true, iconCreateFunction: planClusterIcon })
    : L.layerGroup();
  cluster.addTo(map);
  window._plan = { photos, lo, hi, map, cluster, lines: L.layerGroup(), tiles: [], urls: [], filtered: photos };
  planSetBase("sat");
  map.on("moveend zoomend", planLoadVisibleThumbs);
  if (cluster.on) cluster.on("animationend", planLoadVisibleThumbs);

  planApplyFilters(true);
  if (photos.length) {
    try { map.fitBounds(L.latLngBounds(photos.map(p => [p.lat, p.lng])).pad(0.15)); } catch (e) {}
  }
  setTimeout(planLoadVisibleThumbs, 400);
}

function planSetBase(kind) {
  const P = window._plan; if (!P) return;
  P.tiles.forEach(l => P.map.removeLayer(l)); P.tiles = [];
  if (kind === "plan") {
    P.tiles.push(L.tileLayer(PLAN_PLAN, { maxZoom: 19, attribution: "© OpenStreetMap, © CARTO" }).addTo(P.map));
  } else {
    P.tiles.push(L.tileLayer(PLAN_SAT, { maxZoom: 19, attribution: "Imagery © Esri, Maxar, Earthstar Geographics" }).addTo(P.map));
    if (kind === "sat-labels") P.tiles.push(L.tileLayer(PLAN_LABELS, { maxZoom: 19 }).addTo(P.map));
  }
}

function planApplyFilters(skipStop) {
  const P = window._plan; if (!P) return;
  if (!skipStop && window._planAnimTimer) planPlay(); // une interaction stoppe l'animation
  const trip = (document.getElementById("plan-trip") || {}).value || "";
  const country = (document.getElementById("plan-country") || {}).value || "";
  let y0 = +(document.getElementById("plan-y0") || {}).value, y1 = +(document.getElementById("plan-y1") || {}).value;
  if (isFinite(y0) && isFinite(y1) && y0 > y1) { const s = y0; y0 = y1; y1 = s; }
  const rg = document.getElementById("plan-range"); if (rg && isFinite(y0)) rg.textContent = y0 === y1 ? y0 : `${y0} – ${y1}`;

  const filtered = P.photos.filter(p => {
    if (trip && p.tripId !== trip) return false;
    if (country && p.country !== country) return false;
    if (p.t != null && isFinite(y0)) { const y = new Date(p.t).getFullYear(); if (y < y0 || y > y1) return false; }
    return true;
  });
  P.filtered = filtered;

  P.cluster.clearLayers();
  planAddLayers(P.cluster, filtered.map(planMarker));

  P.lines.clearLayers();
  const showLines = (document.getElementById("plan-lines") || {}).checked;
  if (showLines) {
    const byTrip = {};
    filtered.forEach(p => { if (p.t == null) return; (byTrip[p.tripId] = byTrip[p.tripId] || { color: p.color, pts: [] }).pts.push(p); });
    Object.values(byTrip).forEach(g => {
      if (g.pts.length < 2) return;
      g.pts.sort((a, b) => a.t - b.t);
      L.polyline(g.pts.map(p => [p.lat, p.lng]), { color: g.color, weight: 2.5, opacity: 0.6, dashArray: "4 7" }).addTo(P.lines);
    });
    if (!P.map.hasLayer(P.lines)) P.lines.addTo(P.map);
  } else if (P.map.hasLayer(P.lines)) { P.map.removeLayer(P.lines); }

  const nTrips = new Set(filtered.map(p => p.tripId)).size;
  const info = document.getElementById("plan-info");
  if (info) info.textContent = filtered.length
    ? `📷 ${filtered.length} photo(s) · 🧳 ${nTrips} voyage(s)` + (P.photos.length !== filtered.length ? ` (sur ${P.photos.length})` : "")
    : "Aucune photo géolocalisée pour ces filtres. Importe des photos prises avec le GPS activé 📥";
  setTimeout(planLoadVisibleThumbs, 200);
}

// 🎬 Voyage dans le temps : les photos apparaissent dans l'ordre chronologique
function planPlay() {
  const P = window._plan; if (!P) return;
  const btn = document.getElementById("plan-play");
  if (window._planAnimTimer) { clearInterval(window._planAnimTimer); window._planAnimTimer = null; if (btn) btn.textContent = "▶ Animer"; const b = document.getElementById("plan-badge"); if (b) b.remove(); planApplyFilters(true); return; }
  const list = P.filtered.filter(p => p.t != null).slice().sort((a, b) => a.t - b.t);
  if (list.length < 2) { toast("Pas assez de photos datées pour l'animation 🎬"); return; }
  P.cluster.clearLayers();
  if (btn) btn.textContent = "⏹ Stop";
  const lo = list[0].t, hi = list[list.length - 1].t, steps = 60;
  let badge = document.getElementById("plan-badge");
  if (!badge) { badge = document.createElement("div"); badge.id = "plan-badge"; badge.className = "plan-date-badge"; document.getElementById("planmap").appendChild(badge); }
  let s = 0, i = 0;
  window._planAnimTimer = setInterval(() => {
    s++;
    const cursor = lo + (hi - lo) * (s / steps);
    const batch = [];
    while (i < list.length && list[i].t <= cursor) { batch.push(planMarker(list[i])); i++; }
    if (batch.length) planAddLayers(P.cluster, batch);
    badge.textContent = new Date(cursor).toLocaleDateString("fr-FR", { year: "numeric", month: "long" });
    if (s >= steps) {
      clearInterval(window._planAnimTimer); window._planAnimTimer = null;
      if (btn) btn.textContent = "▶ Animer";
      setTimeout(() => { if (badge) badge.remove(); }, 2500);
      planLoadVisibleThumbs();
    }
  }, 200);
}

// 📥 Import de masse : range chaque photo dans le bon voyage (date + proximité géo)
function planAssignTrip(gps, date) {
  const trips = state.trips || [];
  if (!trips.length) return null;
  let cands = trips;
  if (date) { const inRange = trips.filter(t => t.start && t.end && date >= t.start && date <= t.end); if (inRange.length) cands = inRange; }
  let best = null, bestD = Infinity;
  cands.forEach(t => {
    const pts = [...(t.steps || []).filter(s => s.lat && s.lng).map(s => [s.lat, s.lng]), ...(t.geophotos || []).map(p => [p.lat, p.lng])];
    pts.forEach(([la, ln]) => { const d = planKm(gps.lat, gps.lng, la, ln); if (d < bestD) { bestD = d; best = t; } });
  });
  if (best && (cands !== trips || bestD < 300)) return best; // date connue → on accepte ; sinon < 300 km
  if (cands !== trips) return cands[0]; // dans la fenêtre de dates mais aucun point de repère
  return null;
}

async function planImport(input) {
  const files = [...input.files]; input.value = "";
  if (!files.length) return;
  if (!(state.trips || []).length) { toast("Crée d'abord un voyage 🧳 pour y ranger les photos."); return; }
  const info = document.getElementById("plan-info");
  let done = 0, added = 0, nogps = 0, unmatched = 0; const touched = new Set();
  toast(`⏳ Analyse de ${files.length} photo(s)…`);
  for (const f of files) {
    done++;
    if (info) info.textContent = `⏳ Import ${done}/${files.length}…`;
    if (!f.type || !f.type.startsWith("image/")) continue;
    const meta = await readExifMeta(f);
    const gps = meta && meta.gps;
    if (!gps) { nogps++; continue; }
    const date = (meta && meta.date) || planPhotoDate({ name: f.name }, null);
    const t = planAssignTrip(gps, date);
    if (!t) { unmatched++; continue; }
    const norm = await normalizeFileBlob(f);
    if (!norm) continue;
    const id = uid();
    try {
      const db = await fdb();
      await new Promise((res, rej) => { const tx = db.transaction("files", "readwrite"); tx.objectStore("files").put({ id, owner: "geo:" + id, name: f.name, type: norm.type, blob: norm.blob }); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    } catch (e) { continue; }
    t.geophotos = t.geophotos || [];
    t.geophotos.push(date ? { id, name: f.name, lat: gps.lat, lng: gps.lng, date } : { id, name: f.name, lat: gps.lat, lng: gps.lng });
    added++; touched.add(t.title);
  }
  if (added) saveState();
  toast(`📷 ${added} photo(s) rangée(s) dans ${touched.size} voyage(s)`
    + (unmatched ? ` · ${unmatched} non rattachée(s)` : "")
    + (nogps ? ` · ${nogps} sans GPS` : ""));
  renderPlanisphere(document.getElementById("main"));
}

/* ===================== 🌐 Globe 3D (globe.gl / three.js) ===================== */

function renderGlobe(main) {
  // Points (étapes + photos) et arcs (trajets) de tous les voyages
  const pts = [], arcs = [];
  (state.trips || []).forEach(t => {
    const c = t.color || "#4f6df5";
    const steps = (t.steps || []).filter(s => typeof s.lat === "number" && typeof s.lng === "number");
    steps.forEach(s => pts.push({ lat: s.lat, lng: s.lng, color: c, size: 0.55, label: `${esc(s.name)} — ${esc(t.title)}` }));
    for (let i = 1; i < steps.length; i++) arcs.push({ startLat: steps[i - 1].lat, startLng: steps[i - 1].lng, endLat: steps[i].lat, endLng: steps[i].lng, color: c });
    (t.geophotos || []).forEach(p => { if (typeof p.lat === "number" && typeof p.lng === "number") pts.push({ lat: p.lat, lng: p.lng, color: c, size: 0.3, label: `📷 ${esc(p.name || "")} — ${esc(t.title)}` }); });
  });

  main.innerHTML = `
    <h1 class="page-title">🌐 Globe 3D</h1>
    <p class="page-sub">Fais tourner la Terre et retrouve tous tes voyages.</p>
    <div id="globe-box" style="height:600px;border-radius:20px;overflow:hidden;background:#000;position:relative;"></div>
    <p class="muted small" style="margin-top:10px;">${pts.length} lieu(x) · ${arcs.length} trajet(s) · glisse pour faire tourner, molette pour zoomer.</p>`;

  if (typeof Globe === "undefined") {
    document.getElementById("globe-box").outerHTML = `<div class="empty-state card"><span class="big-emoji">🌐</span><p>Le globe 3D a besoin d'une connexion internet.</p></div>`;
    return;
  }
  if (window._globe) { try { window._globe._destructor && window._globe._destructor(); } catch (e) {} window._globe = null; }

  const el = document.getElementById("globe-box");
  try {
    const g = Globe()(el)
      .globeImageUrl("https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg")
      .bumpImageUrl("https://unpkg.com/three-globe/example/img/earth-topology.png")
      .backgroundImageUrl("https://unpkg.com/three-globe/example/img/night-sky.png")
      .pointsData(pts).pointColor("color").pointAltitude(0.012).pointRadius("size").pointLabel("label")
      .arcsData(arcs).arcColor("color").arcStroke(0.5).arcAltitudeAutoScale(0.4)
      .arcDashLength(0.4).arcDashGap(0.2).arcDashAnimateTime(1600);
    g.width(el.clientWidth).height(600);
    if (g.controls()) { g.controls().autoRotate = true; g.controls().autoRotateSpeed = 0.55; }
    // Centre sur le barycentre des points s'il y en a
    if (pts.length) {
      const la = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
      const ln = pts.reduce((s, p) => s + p.lng, 0) / pts.length;
      g.pointOfView({ lat: la, lng: ln, altitude: 2.2 }, 0);
    }
    window._globe = g;
    window.addEventListener("resize", globeResize);
  } catch (e) {
    el.outerHTML = `<div class="empty-state card"><span class="big-emoji">🌐</span><p>Impossible d'afficher le globe 3D sur cet appareil (WebGL indisponible).</p></div>`;
  }
}

function globeResize() {
  const el = document.getElementById("globe-box");
  if (el && window._globe) window._globe.width(el.clientWidth);
}

/* ===================== ⬇️ Cartes hors-ligne (pré-cache des tuiles) ===================== */

function _lngToTileX(lng, z) { return Math.floor((lng + 180) / 360 * Math.pow(2, z)); }
function _latToTileY(lat, z) { const r = lat * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, z)); }

function _tileURL(tmpl, opts, z, x, y) {
  const subs = opts && opts.subdomains ? opts.subdomains : "abc";
  const s = subs[Math.abs(x + y) % subs.length];
  return tmpl.replace("{s}", s).replace("{z}", z).replace("{x}", x).replace("{y}", y).replace("{r}", (opts && opts.detectRetina && devicePixelRatio > 1) ? "@2x" : "");
}

async function downloadTripTiles(tripId) {
  const t = getTrip(tripId);
  const pts = [...(t.steps || []), ...(t.geophotos || [])].filter(p => typeof p.lat === "number" && typeof p.lng === "number");
  if (!pts.length) { toast("Ajoute des étapes sur la carte d'abord 🗺️"); return; }
  const map = window._leafletMap;
  if (typeof L === "undefined" || !map) { toast("Ouvre la carte du voyage d'abord 🗺️"); return; }
  // Récupère le fond de carte réellement utilisé (selon le thème)
  let tmpl = null, opts = null;
  Object.values(map._layers).forEach(l => { if (l._url && /\{z\}/.test(l._url)) { tmpl = l._url; opts = l.options; } });
  if (!tmpl) { toast("Fond de carte introuvable 🤔"); return; }

  const lats = pts.map(p => p.lat), lngs = pts.map(p => p.lng);
  const bounds = L.latLngBounds([[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]]);
  let baseZ = 8;
  try { baseZ = Math.max(3, Math.min(13, map.getBoundsZoom(bounds))); } catch (e) {}
  const maxZ = (opts && opts.maxZoom) || 19;
  const urls = [];
  const CAP = 600;
  for (let z = Math.max(3, baseZ - 1); z <= Math.min(maxZ, baseZ + 2) && urls.length < CAP; z++) {
    const x0 = _lngToTileX(bounds.getWest(), z), x1 = _lngToTileX(bounds.getEast(), z);
    const y0 = _latToTileY(bounds.getNorth(), z), y1 = _latToTileY(bounds.getSouth(), z);
    for (let x = x0; x <= x1 && urls.length < CAP; x++)
      for (let y = y0; y <= y1 && urls.length < CAP; y++)
        urls.push(_tileURL(tmpl, opts, z, x, y));
  }
  if (!urls.length) { toast("Zone trop petite pour le hors-ligne 🤔"); return; }

  const status = document.getElementById("geo-import-status");
  let ok = 0;
  for (let i = 0; i < urls.length; i++) {
    try { await fetch(urls[i], { mode: "no-cors" }); ok++; } catch (e) {}
    if (status && i % 12 === 0) status.textContent = `⬇️ Carte hors-ligne… ${i + 1}/${urls.length}`;
  }
  if (status) status.textContent = "";
  toast(`📥 Carte hors-ligne prête : ${ok} tuile(s) gardée(s) pour « ${esc(t.title)} » ✈️`);
}
