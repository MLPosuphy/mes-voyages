/* ============================================================
   Mes Voyages — logique de l'application
   Toutes les données sont stockées localement (localStorage).
   ============================================================ */

"use strict";

/* ===================== État global ===================== */

const STORAGE_KEY = "mesVoyages.v1";

let state = {
  trips: [],
  wishlist: [],
  trash: [],
  passports: [],
  settings: { theme: "light", currency: "EUR", userName: "" }
};

let currentView = "dashboard";
let currentTripId = null;
let currentTab = "itineraire";
let tripFilter = "tous";
let tripSearch = "";
let countdownTimer = null;

/* ===================== Persistance ===================== */

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state = Object.assign(state, parsed);
      state.settings = Object.assign({ theme: "light", currency: "EUR", userName: "" }, parsed.settings);
    }
  } catch (e) {
    console.error("Erreur de chargement :", e);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/* ===================== Utilitaires ===================== */

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function fmtMoney(n) {
  const cur = state.settings.currency || "EUR";
  try {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(n || 0);
  } catch (e) {
    return (n || 0) + " " + cur;
  }
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function fmtDateShort(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function todayISO() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function daysBetween(a, b) {
  return Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000);
}

function tripDuration(t) {
  if (!t.start || !t.end) return 0;
  return daysBetween(t.start, t.end) + 1;
}

function getTrip(id) {
  return state.trips.find(t => t.id === id);
}

function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), 2400);
}

/* ===================== Constantes ===================== */

const QUOTES = [
  "« Le monde est un livre, et ceux qui ne voyagent pas n'en lisent qu'une page. » — Saint Augustin",
  "« Voyager, c'est naître et mourir à chaque instant. » — Victor Hugo",
  "« Le véritable voyage de découverte ne consiste pas à chercher de nouveaux paysages, mais à avoir de nouveaux yeux. » — Marcel Proust",
  "« On voyage pour changer, non de lieu, mais d'idées. » — Hippolyte Taine",
  "« L'aventure, c'est le trésor que l'on découvre à chaque matin. » — Jacques Brel",
  "« Partir, c'est gagner un peu de soi. » — Proverbe voyageur",
  "« Un voyage de mille lieues commence toujours par un premier pas. » — Lao Tseu",
  "« Les voyages forment la jeunesse. » — Montaigne"
];

const STATUTS = {
  idee:     { label: "💭 Idée",       badge: "badge-idee" },
  planifie: { label: "🗓️ Planifié",  badge: "badge-planifie" },
  reserve:  { label: "✅ Réservé",    badge: "badge-reserve" },
  encours:  { label: "🌍 En cours",   badge: "badge-encours" },
  termine:  { label: "🏁 Terminé",    badge: "badge-termine" }
};

const COULEURS = ["#4f6df5", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];

const CAT_DEPENSES = {
  transport:    { label: "Transport",    emoji: "✈️", color: "#4f6df5" },
  hebergement:  { label: "Hébergement",  emoji: "🏨", color: "#8b5cf6" },
  restauration: { label: "Restauration", emoji: "🍽️", color: "#f59e0b" },
  activites:    { label: "Activités",    emoji: "🎟️", color: "#10b981" },
  shopping:     { label: "Shopping",     emoji: "🛍️", color: "#ec4899" },
  autre:        { label: "Autre",        emoji: "📦", color: "#64748b" }
};

const CAT_ACTIVITES = {
  transport:  "🚆 Transport",
  visite:     "🏛️ Visite",
  repas:      "🍽️ Repas",
  hebergement:"🏨 Hébergement",
  detente:    "🏖️ Détente",
  nature:     "🥾 Nature",
  soiree:     "🎉 Soirée",
  autre:      "📌 Autre"
};

const DOC_TYPES = {
  vol:         "✈️ Vol / Transport",
  hebergement: "🏨 Hébergement",
  reservation: "🎟️ Réservation",
  sante:       "💊 Santé / Assurance",
  contact:     "📞 Contact utile",
  autre:       "📄 Autre"
};

const HUMEURS = ["🤩", "😀", "🙂", "😐", "😞"];

const TRANSPORTS = {
  avion:   { label: "✈️ Avion",   emoji: "✈️", color: "#6366f1", dash: "10 10" },
  train:   { label: "🚆 Train",   emoji: "🚆", color: "#8b5cf6", dash: null },
  voiture: { label: "🚗 Voiture", emoji: "🚗", color: "#f59e0b", dash: null },
  bus:     { label: "🚌 Bus",     emoji: "🚌", color: "#14b8a6", dash: null },
  bateau:  { label: "⛴️ Bateau",  emoji: "⛴️", color: "#0ea5e9", dash: "2 8" },
  velo:    { label: "🚲 Vélo",    emoji: "🚲", color: "#10b981", dash: null },
  pied:    { label: "🥾 À pied",  emoji: "🥾", color: "#a16207", dash: "1 6" }
};

const PACK_TEMPLATES = {
  essentiels: { label: "🧳 Essentiels", items: ["Passeport / carte d'identité", "Billets / réservations", "Portefeuille + carte bancaire", "Téléphone + chargeur", "Batterie externe", "Trousse de toilette", "Médicaments", "Adaptateur de prise", "Écouteurs", "Lunettes de soleil"] },
  plage: { label: "🏖️ Plage", items: ["Maillot de bain", "Crème solaire", "Serviette de plage", "Tongs", "Chapeau / casquette", "Après-soleil", "Masque et tuba", "Sac étanche"] },
  ville: { label: "🏙️ Ville", items: ["Chaussures confortables", "Sac à dos de journée", "Guide / plan", "Tenue habillée pour le soir", "Parapluie pliable", "Gourde"] },
  montagne: { label: "🏔️ Montagne / Ski", items: ["Veste chaude / imperméable", "Gants", "Bonnet", "Lunettes de ski", "Crème solaire haute protection", "Chaussettes chaudes", "Polaire", "Baume à lèvres"] },
  rando: { label: "🥾 Randonnée / Camping", items: ["Chaussures de randonnée", "Gourde / poche à eau", "Lampe frontale", "Couteau multifonction", "Trousse de secours", "Vêtements de pluie", "Sac de couchage", "Encas énergétiques", "Carte / GPS"] }
};

/* Le référentiel pays (drapeaux, ISO, capitales…) vit dans data.js */
function flagFor(country) {
  if (!country) return "🌍";
  const info = countryInfo(country);
  return info ? info.flag : "🌍";
}

/* ===================== Navigation ===================== */

function showView(view) {
  currentView = view;
  currentTripId = null;
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  const main = document.getElementById("main");
  if (view === "dashboard") renderDashboard(main);
  else if (view === "trips") renderTrips(main);
  else if (view === "wishlist") renderWishlist(main);
  else if (view === "calendrier") renderCalendar(main);
  else if (view === "monde") renderMonde(main);
  else if (view === "planisphere") renderPlanisphere(main);
  else if (view === "globe") renderGlobe(main);
  else if (view === "stats") renderStats(main);
  else if (view === "settings") renderSettings(main);
  window.scrollTo(0, 0);
}

function openTrip(id, tab) {
  currentTripId = id;
  currentTab = tab || "itineraire";
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.view === "trips"));
  renderTripDetail(document.getElementById("main"));
  window.scrollTo(0, 0);
}

/* ===================== Modale ===================== */

function openModal(title, bodyHTML) {
  document.getElementById("modal-title").innerHTML = title;
  document.getElementById("modal-body").innerHTML = bodyHTML;
  document.getElementById("modal-overlay").classList.add("open");
}

function closeModal() {
  document.getElementById("modal-overlay").classList.remove("open");
}

/* Échap ferme la fenêtre modale */
document.addEventListener("keydown", e => {
  if (e.key === "Escape") closeModal();
});

/* ===================== Tableau de bord ===================== */

function renderDashboard(main) {
  const today = todayISO();
  const quote = QUOTES[new Date().getDate() % QUOTES.length];
  const name = state.settings.userName ? ", " + esc(state.settings.userName) : "";

  // Statistiques rapides
  const done = state.trips.filter(t => t.status === "termine");
  const countries = new Set(done.concat(state.trips.filter(t => t.status === "encours")).map(t => (t.country || "").trim().toLowerCase()).filter(Boolean));
  const totalDays = done.reduce((s, t) => s + tripDuration(t), 0);
  const totalSpent = state.trips.reduce((s, t) => s + (t.expenses || []).reduce((a, e) => a + (+e.amount || 0), 0), 0);

  // Voyage en cours / prochain voyage
  const ongoing = state.trips.find(t => t.start && t.end && t.start <= today && today <= t.end && t.status !== "idee");
  const upcoming = state.trips
    .filter(t => t.start && t.start > today && t.status !== "idee" && t.status !== "termine")
    .sort((a, b) => a.start.localeCompare(b.start))[0];

  let focusHTML = "";
  if (ongoing) {
    focusHTML = `
      <div class="card" style="margin-bottom:24px;">
        <div class="row-between">
          <h2>🌍 Voyage en cours : ${esc(ongoing.title)}</h2>
          <button class="btn btn-primary btn-sm" onclick="openTrip('${ongoing.id}')">Ouvrir</button>
        </div>
        <p class="muted" style="margin-top:6px;">${flagFor(ongoing.country)} ${esc(ongoing.destination)} — jour ${daysBetween(ongoing.start, today) + 1} sur ${tripDuration(ongoing)}. Profite bien ! ✨</p>
        ${todayActivitiesHTML(ongoing)}
      </div>`;
  } else if (upcoming) {
    focusHTML = `
      <div class="card" style="margin-bottom:24px;">
        <div class="row-between">
          <h2>⏳ Prochain départ : ${esc(upcoming.title)}</h2>
          <button class="btn btn-primary btn-sm" onclick="openTrip('${upcoming.id}')">Préparer</button>
        </div>
        <p class="muted" style="margin-top:4px;">${flagFor(upcoming.country)} ${esc(upcoming.destination)} · ${fmtDate(upcoming.start)}</p>
        <div class="countdown" id="countdown"></div>
      </div>`;
  }

  // Voyages récents / à venir (aperçu)
  const recent = state.trips.slice().sort((a, b) => (b.start || "").localeCompare(a.start || "")).slice(0, 3);

  main.innerHTML = `
    <div class="hero">
      <span class="plane">✈️</span>
      <h1>Bonjour${name} ! 👋</h1>
      <p class="quote">${quote}</p>
    </div>

    <div class="grid grid-4" style="margin-bottom:24px;">
      <div class="card stat-card"><div class="stat-num">${done.length}</div><div class="stat-label">Voyages terminés</div></div>
      <div class="card stat-card"><div class="stat-num">${countries.size}</div><div class="stat-label">Pays visités</div></div>
      <div class="card stat-card"><div class="stat-num">${totalDays}</div><div class="stat-label">Jours de voyage</div></div>
      <div class="card stat-card"><div class="stat-num">${fmtMoney(totalSpent)}</div><div class="stat-label">Dépensé au total</div></div>
    </div>

    ${focusHTML}
    ${passportAlertHTML()}
    ${todosAlertHTML()}
    ${albumNudgeHTML()}
    ${memoriesHTML()}

    <div class="row-between" style="margin-bottom:14px;">
      <h2>🧳 Mes derniers voyages</h2>
      <button class="btn btn-secondary btn-sm" onclick="showView('trips')">Tout voir</button>
    </div>
    ${recent.length ? `<div class="grid grid-3">${recent.map(tripCardHTML).join("")}</div>` : `
      <div class="empty-state card">
        <span class="big-emoji">🗺️</span>
        <p>Aucun voyage pour l'instant.<br>Crée ton premier voyage et commence l'aventure !</p>
        <button class="btn btn-primary" style="margin-top:16px;" onclick="openTripForm()">＋ Créer mon premier voyage</button>
      </div>`}
  `;

  if (upcoming && !ongoing) startCountdown(upcoming.start);
  if (ongoing) dashWeather(ongoing); // météo du jour automatique 🌤️
  hydrateTripCovers();
}

function startCountdown(startISO) {
  const target = new Date(startISO + "T00:00:00").getTime();
  function tick() {
    const el = document.getElementById("countdown");
    if (!el) { clearInterval(countdownTimer); return; }
    let diff = Math.max(0, target - Date.now());
    const j = Math.floor(diff / 86400000); diff -= j * 86400000;
    const h = Math.floor(diff / 3600000); diff -= h * 3600000;
    const m = Math.floor(diff / 60000); diff -= m * 60000;
    const s = Math.floor(diff / 1000);
    el.innerHTML = `
      <div class="unit"><b>${j}</b><span>jours</span></div>
      <div class="unit"><b>${h}</b><span>heures</span></div>
      <div class="unit"><b>${m}</b><span>min</span></div>
      <div class="unit"><b>${s}</b><span>sec</span></div>`;
  }
  tick();
  countdownTimer = setInterval(tick, 1000);
}

/* ===================== Liste des voyages ===================== */

function tripCardHTML(t) {
  const st = STATUTS[t.status] || STATUTS.idee;
  const dur = tripDuration(t);
  // Mini-jauge budget si un budget est défini
  let budgetHTML = "";
  if (+t.budget > 0) {
    const spent = (t.expenses || []).reduce((s, e) => s + (+e.amount || 0), 0);
    const pct = Math.min(100, Math.round(spent / t.budget * 100));
    budgetHTML = `<div class="trip-budget" title="${fmtMoney(spent)} dépensés sur ${fmtMoney(t.budget)}">
      <div class="budget-bar" style="height:6px;margin:0;flex:1;"><div class="fill ${spent > t.budget ? "over" : ""}" style="width:${pct}%"></div></div>
      <span class="muted small">${pct}%</span></div>`;
  }
  const c = esc(t.color || COULEURS[0]);
  return `
    <div class="card trip-card" onclick="openTrip('${t.id}')">
      <div class="trip-cover" data-cover="${t.id}" style="background-image:linear-gradient(135deg, ${c}, ${c}bb);">
        <span class="trip-flag">${flagFor(t.country)}</span>
        <span class="badge ${st.badge}">${st.label}</span>
      </div>
      <div class="trip-card-body">
        <h3>${esc(t.title)}</h3>
        <div class="trip-dest">${esc(t.destination)}${t.country ? " · " + esc(t.country) : ""}</div>
        <div class="trip-dates">📅 ${t.start ? fmtDateShort(t.start) + " → " + fmtDateShort(t.end) : "Dates à définir"}${dur ? ` · ${dur} j` : ""}${t.travelers ? ` · 👥 ${t.travelers}` : ""}</div>
        ${t.tags && t.tags.length ? `<div class="trip-tags">${t.tags.map(tag => `<span class="trip-tag">🏷️ ${esc(tag)}</span>`).join("")}</div>` : ""}
        ${budgetHTML}
      </div>
    </div>`;
}

/* Charge en arrière-plan la photo de couverture des cartes (1ʳᵉ photo du voyage). */
async function firstTripPhoto(t) {
  if (!t) return null;
  const isImg = f => f.type && f.type.startsWith("image/");
  try {
    for (const p of (t.geophotos || [])) { const r = await fdbGet(p.id); if (r && r.blob) return r.blob; }
    const journ = (t.journal || []).slice().sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    for (const j of journ) { const imgs = (await fdbList(j.id)).filter(isImg); if (imgs.length) return imgs[0].blob; }
    for (const s of (t.steps || [])) { const imgs = (await fdbList(s.id)).filter(isImg); if (imgs.length) return imgs[0].blob; }
  } catch (e) { /* IndexedDB indisponible */ }
  return null;
}

function hydrateTripCovers() {
  document.querySelectorAll(".trip-cover[data-cover]").forEach(async el => {
    if (el.dataset.done) return;
    el.dataset.done = "1";
    const blob = await firstTripPhoto(getTrip(el.dataset.cover));
    if (blob) {
      el.style.backgroundImage = `url(${URL.createObjectURL(blob)})`;
      el.classList.add("has-photo");
    }
  });
}

function renderTrips(main) {
  const today = todayISO();
  // Mise à jour automatique des statuts selon les dates
  state.trips.forEach(t => {
    if (t.status !== "idee" && t.start && t.end) {
      if (t.end < today && t.status !== "termine") t.status = "termine";
      else if (t.start <= today && today <= t.end && (t.status === "planifie" || t.status === "reserve")) t.status = "encours";
    }
  });
  saveState();

  let trips = state.trips.slice();
  if (tripFilter !== "tous") trips = trips.filter(t => t.status === tripFilter);
  if (tripSearch) {
    const q = tripSearch.toLowerCase();
    trips = trips.filter(t => (t.title + " " + t.destination + " " + (t.country || "") + " " + ((t.tags || []).join(" "))).toLowerCase().includes(q));
  }
  trips.sort((a, b) => (b.start || "9999").localeCompare(a.start || "9999"));

  const filterChips = [["tous", "Tous"], ["idee", "💭 Idées"], ["planifie", "🗓️ Planifiés"], ["reserve", "✅ Réservés"], ["encours", "🌍 En cours"], ["termine", "🏁 Terminés"]]
    .map(([k, l]) => `<button class="chip ${tripFilter === k ? "active" : ""}" onclick="tripFilter='${k}';renderTrips(document.getElementById('main'))">${l}</button>`).join("");

  const allTags = [...new Set(state.trips.flatMap(t => t.tags || []))].sort((a, b) => a.localeCompare(b, "fr"));
  const tagCloud = allTags.length
    ? `<div class="filters tag-cloud">${allTags.map(tag => `<button class="chip ${tripSearch === tag ? "active" : ""}" data-tag="${esc(tag)}" onclick="filterByTag(this.dataset.tag)">🏷️ ${esc(tag)}</button>`).join("")}</div>`
    : "";

  main.innerHTML = `
    <div class="row-between" style="margin-bottom:6px;">
      <div><h1 class="page-title">🧳 Mes voyages</h1><p class="page-sub">${state.trips.length} voyage${state.trips.length > 1 ? "s" : ""} dans le carnet</p></div>
      <div class="row" style="gap:8px;">
        <button class="btn btn-secondary" onclick="openTripFromPhotos()" title="Créer un voyage automatiquement à partir de tes photos (dates et lieux détectés)">📸 Depuis mes photos</button>
        <button class="btn btn-primary" onclick="openTripForm()">＋ Nouveau voyage</button>
      </div>
    </div>
    <div class="filters">
      ${filterChips}
      <input class="search-input" placeholder="🔍 Rechercher une destination…" value="${esc(tripSearch)}"
        oninput="tripSearch=this.value;renderTripsGridOnly()">
    </div>
    ${tagCloud}
    <div id="trips-grid">${tripsGridHTML(trips)}</div>
  `;
  hydrateTripCovers();
}

function filterByTag(tag) {
  tripSearch = tripSearch === tag ? "" : tag;
  renderTrips(document.getElementById("main"));
}

function tripsGridHTML(trips) {
  if (!trips.length) {
    return `<div class="empty-state card"><span class="big-emoji">🏝️</span>
      <p>Aucun voyage ne correspond.<br>Crée-en un, ou laisse tes photos faire le travail :</p>
      <div class="row" style="gap:8px;justify-content:center;margin-top:12px;">
        <button class="btn btn-secondary" onclick="openTripFromPhotos()">📸 Depuis mes photos</button>
        <button class="btn btn-primary" onclick="openTripForm()">＋ Nouveau voyage</button>
      </div></div>`;
  }
  return `<div class="grid grid-3">${trips.map(tripCardHTML).join("")}</div>`;
}

function renderTripsGridOnly() {
  let trips = state.trips.slice();
  if (tripFilter !== "tous") trips = trips.filter(t => t.status === tripFilter);
  if (tripSearch) {
    const q = tripSearch.toLowerCase();
    trips = trips.filter(t => (t.title + " " + t.destination + " " + (t.country || "") + " " + ((t.tags || []).join(" "))).toLowerCase().includes(q));
  }
  trips.sort((a, b) => (b.start || "9999").localeCompare(a.start || "9999"));
  const grid = document.getElementById("trips-grid");
  if (grid) grid.innerHTML = tripsGridHTML(trips);
  hydrateTripCovers();
}

/* ===================== Formulaire voyage ===================== */

function openTripForm(id) {
  const t = id ? getTrip(id) : null;
  const colorOpts = COULEURS.map(c =>
    `<div class="color-dot ${t && t.color === c || (!t && c === COULEURS[0]) ? "selected" : ""}" style="background:${c}" data-color="${c}"
      onclick="document.querySelectorAll('.color-dot').forEach(d=>d.classList.remove('selected'));this.classList.add('selected')"></div>`).join("");
  const statusOpts = Object.entries(STATUTS).map(([k, v]) =>
    `<option value="${k}" ${t && t.status === k ? "selected" : ""}>${v.label}</option>`).join("");

  openModal(t ? "✏️ Modifier le voyage" : "🌟 Nouveau voyage", `
    <div class="form-group"><label>Titre du voyage *</label>
      <input id="f-title" placeholder="Ex : Road trip en Italie" value="${t ? esc(t.title) : ""}"></div>
    <div class="form-row">
      <div class="form-group"><label>Destination (ville, région…) *</label>
        <input id="f-dest" placeholder="Ex : Rome, Florence, Venise" value="${t ? esc(t.destination) : ""}"></div>
      <div class="form-group"><label>Pays</label>
        <input id="f-country" placeholder="Ex : Italie" value="${t ? esc(t.country || "") : ""}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Date de départ</label>
        <input id="f-start" type="date" value="${t ? t.start || "" : ""}"></div>
      <div class="form-group"><label>Date de retour</label>
        <input id="f-end" type="date" value="${t ? t.end || "" : ""}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Statut</label><select id="f-status">${statusOpts}</select></div>
      <div class="form-group"><label>Nombre de voyageurs</label>
        <input id="f-travelers" type="number" min="1" value="${t ? t.travelers || 1 : 1}"></div>
      <div class="form-group"><label>Budget prévu</label>
        <input id="f-budget" type="number" min="0" step="10" placeholder="0" value="${t && t.budget ? t.budget : ""}"></div>
    </div>
    <div class="form-group"><label>Couleur du voyage</label><div class="color-options">${colorOpts}</div></div>
    <div class="form-group"><label>Étiquettes <span class="muted small">(séparées par des virgules)</span></label>
      <input id="f-tags" placeholder="Ex : road trip, plage, famille" value="${t && t.tags ? esc(t.tags.join(", ")) : ""}"></div>
    <div class="form-group"><label>Notes</label>
      <textarea id="f-notes" placeholder="Envies, idées, infos en vrac…">${t ? esc(t.notes || "") : ""}</textarea></div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="saveTripForm(${t ? `'${t.id}'` : "null"})">${t ? "Enregistrer" : "Créer le voyage"}</button>
    </div>
  `);
}

function saveTripForm(id) {
  const title = document.getElementById("f-title").value.trim();
  const dest = document.getElementById("f-dest").value.trim();
  if (!title || !dest) { toast("⚠️ Donne au moins un titre et une destination"); return; }

  const start = document.getElementById("f-start").value;
  const end = document.getElementById("f-end").value;
  if (start && end && end < start) { toast("⚠️ La date de retour est avant le départ"); return; }

  const selectedDot = document.querySelector(".color-dot.selected");
  const data = {
    title, destination: dest,
    country: document.getElementById("f-country").value.trim(),
    start, end,
    status: document.getElementById("f-status").value,
    travelers: +document.getElementById("f-travelers").value || 1,
    budget: +document.getElementById("f-budget").value || 0,
    color: selectedDot ? selectedDot.dataset.color : COULEURS[0],
    tags: (document.getElementById("f-tags").value || "").split(",").map(s => s.trim()).filter(Boolean),
    notes: document.getElementById("f-notes").value.trim()
  };

  if (id) {
    Object.assign(getTrip(id), data);
    toast("✅ Voyage mis à jour");
  } else {
    state.trips.push(Object.assign({
      id: uid(), activities: [], expenses: [], packing: [], documents: [], journal: [], steps: [],
      todos: [], shopping: [], people: []
    }, data));
    toast("🎉 Voyage créé ! Bon préparatifs !");
  }
  saveState();
  closeModal();
  if (id && currentTripId === id) renderTripDetail(document.getElementById("main"));
  else showView("trips");
}

/* ===== Créer un voyage automatiquement à partir d'un lot de photos =====
   Pour les voyages anciens ou « par flemme » : on lit les métadonnées EXIF
   (date + GPS) de toutes les photos, on devine la période et le lieu, puis
   on pré-remplit un formulaire avant de créer le voyage et d'y placer les photos. */

function openTripFromPhotos() {
  openModal("📸 Nouveau voyage depuis mes photos", `
    <p class="muted small" style="margin-bottom:12px;">
      Choisis <b>toutes les photos d'un même voyage</b>. Idéalement les photos d'origine prises avec le téléphone :
      elles contiennent souvent la <b>date</b> et le <b>lieu GPS</b> 📍.<br>
      <span class="small">⚠️ Attention : les photos reçues par WhatsApp / Messenger ont généralement perdu leur GPS.</span>
    </p>
    <label class="btn btn-primary btn-block" style="cursor:pointer;">📂 Choisir mes photos
      <input type="file" accept="image/*" multiple style="display:none" onchange="analyzePhotosForTrip(this)"></label>
    <div id="tfp-status" class="muted small" style="margin-top:12px;text-align:center;"></div>`);
}

// Horodatage d'une photo (ms) : EXIF complet (avec heure) > heure dans le nom de fichier > date seule
function photoTimestamp(meta, name) {
  if (meta && meta.dt) { const t = Date.parse(meta.dt); if (isFinite(t)) return t; }
  const fn = (name || "").match(/(20\d{2})[-_.]?(\d{2})[-_.]?(\d{2})[ _T-]?(\d{2})?(\d{2})?(\d{2})?/);
  if (fn) {
    const t = Date.parse(`${fn[1]}-${fn[2]}-${fn[3]}T${fn[4] || "12"}:${fn[5] || "00"}:${fn[6] || "00"}`);
    if (isFinite(t)) return t;
  }
  if (meta && meta.date) { const t = Date.parse(meta.date + "T12:00:00"); if (isFinite(t)) return t; }
  return null;
}

// Reverse-geocode best-effort (ville + pays) d'un point — sert à pré-remplir le formulaire
async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&zoom=10&accept-language=fr&lat=${lat}&lon=${lng}`);
    const d = await res.json();
    const a = (d && d.address) || {};
    return { city: a.city || a.town || a.village || a.county || a.state || "", country: a.country || "" };
  } catch (e) { return { city: "", country: "" }; }
}

async function analyzePhotosForTrip(input) {
  const files = [...input.files];
  input.value = "";
  if (!files.length) return;
  const status = document.getElementById("tfp-status");
  const metas = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (status) status.textContent = `⏳ Analyse des photos… ${i + 1}/${files.length}`;
    if (!f.type || !f.type.startsWith("image/")) continue;
    const meta = await readExifMeta(f);
    const gps = meta && meta.gps;
    const date = (meta && meta.date) || (typeof planPhotoDate === "function" ? planPhotoDate({ name: f.name }, null) : null);
    const ts = photoTimestamp(meta, f.name);
    metas.push({ file: f, gps, date, ts });
  }
  if (!metas.length) { if (status) status.textContent = "Aucune image lisible dans la sélection 🤔"; return; }
  window._tfp = { metas };

  const dates = metas.filter(m => m.date).map(m => m.date).sort();
  const geo = metas.filter(m => m.gps);
  const start = dates[0] || "";
  const end = dates[dates.length - 1] || "";

  // Lieu médian (robuste aux photos isolées) → reverse-geocode best-effort
  let place = { city: "", country: "" };
  if (geo.length) {
    const lat = geo.map(m => m.gps.lat).sort((a, b) => a - b)[Math.floor(geo.length / 2)];
    const lng = geo.map(m => m.gps.lng).sort((a, b) => a - b)[Math.floor(geo.length / 2)];
    if (status) status.textContent = "🌍 Identification du lieu…";
    place = await reverseGeocode(lat, lng);
  }
  showTripFromPhotosForm({ total: metas.length, geo: geo.length, dated: dates.length, start, end, place });
}

function showTripFromPhotosForm(s) {
  const guessTitle = s.place.city ? "Voyage à " + s.place.city
    : s.place.country ? "Voyage — " + s.place.country
    : (s.start ? "Voyage " + s.start.slice(0, 4) : "Mon voyage");
  const noGps = s.total - s.geo;
  openModal("📸 Créer le voyage", `
    <div class="card" style="margin-bottom:14px;padding:12px 14px;">
      📷 <b>${s.total}</b> photo(s) · 📍 <b>${s.geo}</b> géolocalisée(s) · 📅 <b>${s.dated}</b> datée(s)
      ${s.start ? `<br>📆 Période détectée : <b>${fmtDate(s.start)}</b> → <b>${fmtDate(s.end)}</b>` : `<br><span class="muted small">Aucune date détectée — renseigne-la ci-dessous.</span>`}
    </div>
    <div class="form-group"><label>Titre du voyage *</label>
      <input id="tfp-title" placeholder="Ex : Road trip en Italie" value="${esc(guessTitle)}"></div>
    <div class="form-row">
      <div class="form-group"><label>Destination *</label>
        <input id="tfp-dest" placeholder="Ex : Rome, Florence…" value="${esc(s.place.city || s.place.country || "")}"></div>
      <div class="form-group"><label>Pays</label>
        <input id="tfp-country" placeholder="Ex : Italie" value="${esc(s.place.country || "")}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Date de départ</label><input id="tfp-start" type="date" value="${s.start}"></div>
      <div class="form-group"><label>Date de retour</label><input id="tfp-end" type="date" value="${s.end}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Nombre de voyageurs</label><input id="tfp-travelers" type="number" min="1" value="1"></div>
      <div class="form-group"><label>Budget</label><input id="tfp-budget" type="number" min="0" step="10" placeholder="0"></div>
    </div>
    <p class="muted small">Les <b>${s.geo}</b> photo(s) géolocalisée(s) seront placées sur la carte du voyage.${noGps > 0 ? ` Les ${noGps} sans GPS ne seront pas placées (mais tu pourras les joindre au journal).` : ""}</p>
    ${s.geo >= 2 ? `<div class="form-group" style="margin-top:4px;">
      <label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;">
        <input type="checkbox" id="tfp-itinerary" checked style="width:auto;margin-top:3px;">
        <span>🧭 <b>Reconstruire l'itinéraire</b> à partir des photos<br>
          <span class="muted small">On regroupe tes photos par lieu et par jour pour deviner les étapes du voyage, dans l'ordre, avec le moyen de transport le plus probable. (Tu pourras tout ajuster ensuite.)</span></span></label>
    </div>` : ""}
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="window._tfp=null;closeModal()">Annuler</button>
      <button class="btn btn-primary" id="tfp-create" onclick="createTripFromPhotos()">🎉 Créer le voyage</button>
    </div>`);
}

/* Reconstruction d'itinéraire — regroupe les points photo {lat,lng,ts} en
   « séjours » successifs : un nouveau séjour démarre quand on s'éloigne de
   plus de gapKm du centre du séjour courant (centroïde glissant). */
function clusterStays(pts, gapKm) {
  const sorted = pts.filter(p => p.ts != null).sort((a, b) => a.ts - b.ts);
  const stays = [];
  let cur = null;
  for (const p of sorted) {
    if (cur) {
      const c = { lat: cur.sumLat / cur.n, lng: cur.sumLng / cur.n };
      if (haversineKm(c, p) <= gapKm) {
        cur.sumLat += p.lat; cur.sumLng += p.lng; cur.n++; cur.last = p.ts; cur.count++;
        continue;
      }
      stays.push(cur);
    }
    cur = { sumLat: p.lat, sumLng: p.lng, n: 1, first: p.ts, last: p.ts, count: 1 };
  }
  if (cur) stays.push(cur);
  return stays.map(c => ({ lat: c.sumLat / c.n, lng: c.sumLng / c.n, first: c.first, last: c.last, count: c.count }));
}

// On élargit le seuil tant qu'il y a trop d'étapes (évite un itinéraire illisible)
function reconstructStays(pts) {
  let gap = 30, stays = clusterStays(pts, gap);
  while (stays.length > 30 && gap < 600) { gap *= 1.7; stays = clusterStays(pts, gap); }
  return stays;
}

// Moyen de transport le plus probable entre 2 séjours (distance + vitesse implicite)
function guessLegTransport(a, b) {
  const km = haversineKm(a, b);
  const hours = (b.first - a.last) / 3600000;
  const speed = hours > 0.05 ? km / hours : Infinity;
  if (km > 600 || speed > 250) return "avion";
  if (km > 250 || speed > 120) return "train";
  return "voiture";
}

function isoOfDate(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

async function createTripFromPhotos() {
  const tfp = window._tfp;
  if (!tfp || !tfp.metas) { closeModal(); return; }
  const title = document.getElementById("tfp-title").value.trim();
  const dest = document.getElementById("tfp-dest").value.trim();
  if (!title || !dest) { toast("⚠️ Donne au moins un titre et une destination"); return; }
  const start = document.getElementById("tfp-start").value;
  const end = document.getElementById("tfp-end").value;
  if (start && end && end < start) { toast("⚠️ La date de retour est avant le départ"); return; }

  const today = todayISO();
  const status = (end && end < today) ? "termine"
    : (start && start <= today && (!end || today <= end)) ? "encours"
    : "planifie";

  const trip = Object.assign({
    id: uid(), activities: [], expenses: [], packing: [], documents: [], journal: [], steps: [],
    todos: [], shopping: [], people: [], geophotos: []
  }, {
    title, destination: dest,
    country: document.getElementById("tfp-country").value.trim(),
    start, end, status,
    travelers: +document.getElementById("tfp-travelers").value || 1,
    budget: +document.getElementById("tfp-budget").value || 0,
    color: COULEURS[state.trips.length % COULEURS.length],
    tags: ["photos"], notes: ""
  });

  const wantsItinerary = !!((document.getElementById("tfp-itinerary") || {}).checked);
  const btn = document.getElementById("tfp-create");
  if (btn) { btn.disabled = true; btn.textContent = "⏳ Import des photos…"; }

  let added = 0, nogps = 0;
  const geoPts = []; // pour reconstruire l'itinéraire
  for (let i = 0; i < tfp.metas.length; i++) {
    const m = tfp.metas[i];
    if (!m.gps) { nogps++; continue; }
    if (btn) btn.textContent = `⏳ Import ${i + 1}/${tfp.metas.length}…`;
    const norm = await normalizeFileBlob(m.file);
    if (!norm) continue;
    const id = uid();
    try {
      const db = await fdb();
      await new Promise((res, rej) => {
        const tx = db.transaction("files", "readwrite");
        tx.objectStore("files").put({ id, owner: "geo:" + id, name: m.file.name, type: norm.type, blob: norm.blob });
        tx.oncomplete = res; tx.onerror = () => rej(tx.error);
      });
    } catch (e) { continue; }
    trip.geophotos.push(m.date
      ? { id, name: m.file.name, lat: m.gps.lat, lng: m.gps.lng, date: m.date }
      : { id, name: m.file.name, lat: m.gps.lat, lng: m.gps.lng });
    geoPts.push({ lat: m.gps.lat, lng: m.gps.lng, ts: m.ts });
    added++;
  }

  // 🧭 Reconstruction de l'itinéraire : regroupe les photos en séjours ordonnés,
  // nomme chaque étape (reverse-geocode) et devine le transport entre elles.
  let stepCount = 0;
  if (wantsItinerary && geoPts.length >= 2) {
    const stays = reconstructStays(geoPts);
    for (let i = 0; i < stays.length; i++) {
      const c = stays[i];
      if (btn) btn.textContent = `🧭 Reconstruction… étape ${i + 1}/${stays.length}`;
      let name = "";
      try { const g = await reverseGeocode(c.lat, c.lng); name = g.city || g.country || ""; } catch (e) {}
      if (!name) name = "Étape " + (i + 1);
      const d1 = new Date(c.first), d2 = new Date(c.last);
      const sameDay = isoOfDate(d1) === isoOfDate(d2);
      const dateLabel = sameDay ? fmtDateShort(isoOfDate(d1)) : `${fmtDateShort(isoOfDate(d1))} → ${fmtDateShort(isoOfDate(d2))}`;
      trip.steps.push({
        id: uid(), name, lat: c.lat, lng: c.lng,
        transport: i === 0 ? "voiture" : guessLegTransport(stays[i - 1], c),
        notes: `📷 ${c.count} photo(s) · ${dateLabel}`,
        visited: true, visitedAt: isoOfDate(d1)
      });
      stepCount++;
      if (i < stays.length - 1) await new Promise(r => setTimeout(r, 1100)); // 1 req/s : politesse Nominatim
    }
  }

  state.trips.push(trip);
  saveState();
  window._tfp = null;
  closeModal();
  toast(`🎉 « ${title} » créé · ${added} photo(s)${stepCount ? ` · ${stepCount} étape(s) reconstruites 🧭` : ""}${nogps ? ` · ${nogps} sans GPS` : ""}`);
  openTrip(trip.id, (added || stepCount) ? "carte" : "itineraire");
}

function deleteTrip(id) {
  const t = getTrip(id);
  if (!confirm(`Supprimer « ${t.title} » ? (récupérable 10 suppressions durant via la corbeille des Paramètres)`)) return;
  state.trash = state.trash || [];
  state.trash.unshift({ trip: t, deletedAt: todayISO() });
  state.trash = state.trash.slice(0, 10);
  state.trips = state.trips.filter(x => x.id !== id);
  saveState();
  toast("🗑️ Voyage déplacé dans la corbeille");
  showView("trips");
}

/* ===================== Détail d'un voyage ===================== */

function renderTripDetail(main) {
  const t = getTrip(currentTripId);
  if (!t) { showView("trips"); return; }
  const st = STATUTS[t.status] || STATUTS.idee;
  const dur = tripDuration(t);
  const today = todayISO();
  let countdownNote = "";
  if (t.start && t.start > today) countdownNote = `🛫 Départ dans ${daysBetween(today, t.start)} jour(s)`;
  else if (t.start && t.end && t.start <= today && today <= t.end) countdownNote = `🌍 Jour ${daysBetween(t.start, today) + 1} / ${dur}`;

  const tabs = [
    ["itineraire", "🗓️ Itinéraire"],
    ["carte", "🗺️ Carte"],
    ["budget", "💰 Budget"],
    ["prepa", "✅ Préparatifs"],
    ["bagages", "🎒 Bagages"],
    ["documents", "📄 Documents"],
    ["pratique", "🧰 Pratique"],
    ["journal", "📔 Journal"],
    ["jeux", "🎮 Jeux"]
  ].map(([k, l]) => `<button class="tab ${currentTab === k ? "active" : ""}" onclick="currentTab='${k}';renderTripDetail(document.getElementById('main'))">${l}</button>`).join("");

  main.innerHTML = `
    <button class="btn btn-ghost btn-sm" style="margin-bottom:14px;" onclick="showView('trips')">← Retour aux voyages</button>
    <div class="trip-header" style="background:linear-gradient(120deg, ${esc(t.color || COULEURS[0])}, ${esc(t.color || COULEURS[0])}cc);">
      <div class="header-actions">
        <button class="icon-btn" title="Modifier" onclick="openTripForm('${t.id}')">✏️</button>
        <button class="icon-btn" title="Dupliquer ce voyage" onclick="duplicateTrip('${t.id}')">📑</button>
        <button class="icon-btn" title="Générer l'album souvenir (photos, journal, budget… tout !)" onclick="openAlbumOptions('${t.id}')">📕</button>
        <button class="icon-btn" title="Affiche souvenir à imprimer / encadrer" onclick="generatePoster('${t.id}')">🖼️</button>
        <button class="icon-btn" title="Exporter la page souvenir" onclick="exportTripHTML('${t.id}')">📤</button>
        <button class="icon-btn" title="Imprimer" onclick="window.print()">🖨️</button>
        <button class="icon-btn" title="Supprimer" onclick="deleteTrip('${t.id}')">🗑️</button>
      </div>
      <h1>${flagFor(t.country)} ${esc(t.title)}</h1>
      <div class="trip-meta">
        <span>📍 ${esc(t.destination)}${t.country ? ", " + esc(t.country) : ""}</span>
        ${t.start ? `<span>📅 ${fmtDate(t.start)} → ${fmtDate(t.end)} (${dur} j)</span>` : "<span>📅 Dates à définir</span>"}
        <span>👥 ${t.travelers || 1} voyageur(s)</span>
        <span class="badge ${st.badge}" style="background:rgba(255,255,255,0.25);color:#fff;">${st.label}</span>
        ${countdownNote ? `<span><b>${countdownNote}</b></span>` : ""}
      </div>
      ${t.notes ? `<p style="margin-top:12px;opacity:0.93;white-space:pre-wrap;font-size:0.9rem;">📝 ${esc(t.notes)}</p>` : ""}
    </div>
    <div class="tabs">${tabs}</div>
    <div id="tab-content"></div>
  `;

  const content = document.getElementById("tab-content");
  if (currentTab === "itineraire") renderItineraire(content, t);
  else if (currentTab === "carte") renderCarte(content, t);
  else if (currentTab === "budget") renderBudget(content, t);
  else if (currentTab === "prepa") renderPrepa(content, t);
  else if (currentTab === "bagages") renderBagages(content, t);
  else if (currentTab === "documents") renderDocuments(content, t);
  else if (currentTab === "pratique") renderPratique(content, t);
  else if (currentTab === "journal") renderJournal(content, t);
  else if (currentTab === "jeux") renderJeux(content, t);
}

/* ---------- Onglet Itinéraire ---------- */

function renderItineraire(el, t) {
  ensureActOrd(t);
  const acts = (t.activities || []).slice().sort((a, b) => a.date.localeCompare(b.date) || (a.ord || 0) - (b.ord || 0));
  const byDate = {};
  acts.forEach(a => { (byDate[a.date] = byDate[a.date] || []).push(a); });

  // Construire la liste des jours : ceux du voyage + ceux qui ont des activités hors plage
  let days = [];
  if (t.start && t.end) {
    for (let d = new Date(t.start + "T00:00:00"); ; d.setDate(d.getDate() + 1)) {
      const iso = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      days.push(iso);
      if (iso >= t.end) break;
      if (days.length > 120) break; // garde-fou
    }
  }
  Object.keys(byDate).forEach(d => { if (!days.includes(d)) days.push(d); });
  days.sort();

  const dayBlocks = days.map((iso, i) => {
    const list = (byDate[iso] || []).map(a => `
      <div class="activity ${a.done ? "done" : ""}" draggable="true" data-act="${a.id}" data-actdate="${iso}">
        <span class="act-drag" title="Glisser pour réordonner ou changer de jour">⠿</span>
        <span class="act-time">${a.time || "—"}</span>
        <div class="act-body">
          <div class="act-title">${CAT_ACTIVITES[a.category] ? CAT_ACTIVITES[a.category].split(" ")[0] : "📌"} ${esc(a.title)}</div>
          ${a.notes ? `<div class="act-notes">${esc(a.notes)}</div>` : ""}
          ${a.cost ? `<div class="act-cost">${fmtMoney(a.cost)}</div>` : ""}
        </div>
        <button class="icon-btn" title="${a.done ? "Marquer à faire" : "Marquer fait"}" onclick="toggleActivity('${t.id}','${a.id}')">${a.done ? "↩️" : "✔️"}</button>
        <button class="icon-btn" title="Modifier" onclick="openActivityForm('${t.id}','${a.id}')">✏️</button>
        <button class="icon-btn" title="Supprimer" onclick="deleteActivity('${t.id}','${a.id}')">🗑️</button>
      </div>`).join("");
    return `
      <div class="day-block">
        <div class="day-title">
          <span class="day-num">Jour ${i + 1}</span> ${fmtDate(iso)}
          <button class="icon-btn" title="Ajouter une activité ce jour" onclick="openActivityForm('${t.id}',null,'${iso}')">＋</button>
        </div>
        ${list || `<p class="muted small" style="padding-left:6px;">Rien de prévu — journée libre ! 😎</p>`}
      </div>`;
  }).join("");

  el.innerHTML = `
    <div class="row-between" style="margin-bottom:16px;">
      <p class="muted">Planifie ton voyage jour par jour : transports, visites, restos…</p>
      <div class="row">
        <button class="btn btn-ghost btn-sm" title="Exporter vers Google Agenda / Outlook" onclick="exportICS('${t.id}')">📅 .ics</button>
        <button class="btn btn-primary btn-sm" onclick="openActivityForm('${t.id}')">＋ Ajouter une activité</button>
      </div>
    </div>
    ${days.length ? `<div class="itinerary" style="--trip-c:${esc(t.color || COULEURS[0])}">${dayBlocks}</div>` : `<div class="empty-state card"><span class="big-emoji">🗓️</span><p>Définis les dates du voyage (bouton ✏️ en haut)<br>ou ajoute une première activité pour démarrer l'itinéraire.</p></div>`}
  `;
}

function openActivityForm(tripId, actId, presetDate) {
  const t = getTrip(tripId);
  const a = actId ? t.activities.find(x => x.id === actId) : null;
  const catOpts = Object.entries(CAT_ACTIVITES).map(([k, l]) =>
    `<option value="${k}" ${a && a.category === k ? "selected" : ""}>${l}</option>`).join("");

  openModal(a ? "✏️ Modifier l'activité" : "＋ Nouvelle activité", `
    <div class="form-group"><label>Titre *</label>
      <input id="a-title" placeholder="Ex : Visite du Colisée" value="${a ? esc(a.title) : ""}"></div>
    <div class="form-row">
      <div class="form-group"><label>Date *</label>
        <input id="a-date" type="date" value="${a ? a.date : presetDate || t.start || todayISO()}"></div>
      <div class="form-group"><label>Heure</label>
        <input id="a-time" type="time" value="${a ? a.time || "" : ""}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Catégorie</label><select id="a-cat">${catOpts}</select></div>
      <div class="form-group"><label>Coût estimé</label>
        <input id="a-cost" type="number" min="0" step="1" placeholder="0" value="${a && a.cost ? a.cost : ""}"></div>
    </div>
    <div class="form-group"><label>Notes (adresse, n° de résa…)</label>
      <textarea id="a-notes">${a ? esc(a.notes || "") : ""}</textarea></div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="saveActivityForm('${tripId}',${a ? `'${a.id}'` : "null"})">Enregistrer</button>
    </div>
  `);
}

function saveActivityForm(tripId, actId) {
  const t = getTrip(tripId);
  const title = document.getElementById("a-title").value.trim();
  const date = document.getElementById("a-date").value;
  if (!title || !date) { toast("⚠️ Titre et date obligatoires"); return; }
  const data = {
    title, date,
    time: document.getElementById("a-time").value,
    category: document.getElementById("a-cat").value,
    cost: +document.getElementById("a-cost").value || 0,
    notes: document.getElementById("a-notes").value.trim()
  };
  if (actId) Object.assign(t.activities.find(x => x.id === actId), data);
  else t.activities.push(Object.assign({ id: uid(), done: false, ord: activityInsertOrd(t, data.date, data.time) }, data));
  saveState();
  closeModal();
  renderTripDetail(document.getElementById("main"));
  toast("✅ Activité enregistrée");
}

function toggleActivity(tripId, actId) {
  const a = getTrip(tripId).activities.find(x => x.id === actId);
  a.done = !a.done;
  saveState();
  renderTripDetail(document.getElementById("main"));
}

function deleteActivity(tripId, actId) {
  const t = getTrip(tripId);
  t.activities = t.activities.filter(x => x.id !== actId);
  saveState();
  renderTripDetail(document.getElementById("main"));
  toast("🗑️ Activité supprimée");
}

/* ---------- Onglet Carte ---------- */

function haversineKm(a, b) {
  const R = 6371, rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function fmtKm(km) {
  const v = km >= 100 ? Math.round(km) : Math.round(km * 10) / 10;
  return v.toLocaleString("fr-FR") + " km";
}

function tripTotalKm(t) {
  const steps = t.steps || [];
  let total = 0;
  for (let i = 1; i < steps.length; i++) {
    total += (typeof legMetrics === "function") ? legMetrics(steps[i - 1], steps[i]).dist : haversineKm(steps[i - 1], steps[i]);
  }
  return total;
}

function renderCarte(el, t) {
  t.steps = t.steps || [];

  if (typeof L === "undefined") {
    el.innerHTML = `<div class="empty-state card"><span class="big-emoji">📡</span>
      <p>La carte a besoin d'une connexion internet pour charger le fond de carte.<br>
      Reconnecte-toi puis recharge la page — tes étapes, elles, sont bien sauvegardées.</p></div>`;
    return;
  }

  const totalKm = tripTotalKm(t);

  const rows = t.steps.map((s, i) => {
    let legHTML = `<span class="muted small">🏁 Point de départ</span>`;
    if (i > 0) {
      const opts = Object.entries(TRANSPORTS).map(([k, tr]) =>
        `<option value="${k}" ${s.transport === k ? "selected" : ""}>${tr.label}</option>`).join("");
      legHTML = `
        <select class="transport-select" title="Transport depuis l'étape précédente"
          onchange="setStepTransport('${t.id}','${s.id}',this.value)">${opts}</select>
        <span class="muted small">${legLineHTML(t.steps[i - 1], s)}</span>`;
    }
    return `
      <div class="step-row" data-dropowner="${s.id}">
        <div class="step-num ${s.visited ? "visited" : ""}" style="background:${esc(t.color || COULEURS[0])}">${i + 1}</div>
        <div class="step-body">
          <b>${esc(s.name)}</b>${s.visited ? ` <span class="step-visited">✅ Visité${s.visitedAt ? " le " + fmtDateShort(s.visitedAt) : ""}</span>` : ""}
          <div class="step-leg">${legHTML}</div>
          ${s.notes ? `<div class="muted small" style="margin-top:3px;white-space:pre-wrap;">📝 ${esc(s.notes)}</div>` : ""}
          ${attachZoneHTML(s.id)}
        </div>
        <button class="icon-btn" title="Guide Wikipédia" onclick="guideStep('${t.id}','${s.id}')">📖</button>
        <button class="icon-btn" title="Que voir autour ?" onclick="nearbyStep('${t.id}','${s.id}')">🏛️</button>
        <button class="icon-btn" title="Ouvrir dans Google Maps" onclick="openStepInMaps('${t.id}','${s.id}')">🧭</button>
        <button class="icon-btn" title="Météo 7 jours" onclick="stepWeather('${t.id}','${s.id}')">🌦️</button>
        <button class="icon-btn" title="${s.visited ? "Visité ✓ — cliquer pour annuler" : "Marquer comme visité"}" onclick="toggleStepVisited('${t.id}','${s.id}')">${s.visited ? "✅" : "⬜"}</button>
        <button class="icon-btn" title="Monter" ${i === 0 ? "disabled style='opacity:0.25'" : ""} onclick="moveStep('${t.id}','${s.id}',-1)">⬆️</button>
        <button class="icon-btn" title="Descendre" ${i === t.steps.length - 1 ? "disabled style='opacity:0.25'" : ""} onclick="moveStep('${t.id}','${s.id}',1)">⬇️</button>
        <button class="icon-btn" title="Modifier" onclick="openStepForm('${t.id}','${s.id}')">✏️</button>
        <button class="icon-btn" title="Supprimer" onclick="deleteStep('${t.id}','${s.id}')">🗑️</button>
      </div>`;
  }).join("");

  const legend = Object.values(TRANSPORTS).map(tr =>
    `<span class="country-chip" style="border-left:4px solid ${tr.color}">${tr.label}</span>`).join("");

  el.innerHTML = `
    <div class="card map-search" style="margin-bottom:18px;">
      <div class="row">
        <input class="search-input" id="step-search" placeholder="🔍 Chercher un lieu (ville, monument, plage…)"
          onkeydown="if(event.key==='Enter')searchPlace('${t.id}')">
        <button class="btn btn-primary btn-sm" onclick="searchPlace('${t.id}')">Rechercher</button>
        <button class="btn btn-ghost btn-sm" id="click-add-btn" onclick="toggleClickAdd()">📍 Ajouter d'un clic sur la carte</button>
        <button class="btn btn-ghost btn-sm" title="Me localiser sur la carte" onclick="whereAmI('${t.id}')">🧭 Où suis-je ?</button>
        <label class="btn btn-ghost btn-sm" style="cursor:pointer;" title="Importer des photos contenant leurs coordonnées GPS">📷 Importer des photos géolocalisées
          <input type="file" accept="image/*" multiple style="display:none" onchange="importGeoPhotos('${t.id}',this)">
        </label>
        <button class="btn btn-ghost btn-sm" title="Exporter l'itinéraire en GPX (GPS, Google Earth…)" onclick="exportGPX('${t.id}')">📤 GPX</button>
        <label class="btn btn-ghost btn-sm" style="cursor:pointer;" title="Importer une trace ou des points GPX">📥 GPX
          <input type="file" accept=".gpx,application/gpx+xml,text/xml" style="display:none" onchange="importGPX('${t.id}',this)">
        </label>
        <button class="btn btn-ghost btn-sm" title="Enregistrer la carte de la zone pour la consulter hors-ligne (avion, étranger…)" onclick="downloadTripTiles('${t.id}')">⬇️ Carte hors-ligne</button>
      </div>
      <div id="geo-import-status" class="muted small"></div>
      <div id="search-results"></div>
    </div>

    <div id="map" class="map-container"></div>

    <div class="card" style="margin-top:18px;">
      <div class="row-between" style="margin-bottom:12px;">
        <h3>🧭 Étapes du voyage (${t.steps.length})${(() => { const v = t.steps.filter(s => s.visited).length; return v ? ` · ✅ ${v} visitée${v > 1 ? "s" : ""}` : ""; })()}</h3>
        ${t.steps.length > 1 ? (() => { const e = tripEstimates(t); return `<div class="row" style="gap:8px;">
          <span class="badge badge-planifie">${fmtKm(e.km)} · ⏱️ ~${fmtH(e.h)} · 🌱 ${Math.round(e.co2)} kg CO₂/pers</span>
          ${t.steps.length >= 3 ? `<button class="icon-btn" title="Optimiser l'ordre des étapes (trajet le plus court)" onclick="optimizeRoute('${t.id}')">🧮</button>` : ""}
          <button class="icon-btn" title="Recalculer les trajets sur routes" onclick="retryRoutes('${t.id}')">🔄</button>
        </div>`; })() : ""}
      </div>
      ${rows || `<p class="muted" style="padding:8px 0;">Aucune étape pour l'instant. Cherche un lieu ci-dessus ou active le mode 📍 puis clique sur la carte.<br>
        L'ordre des étapes définit la route ; choisis ensuite le transport de chaque tronçon. Astuce : les marqueurs se déplacent à la souris !</p>`}
      ${t.steps.length > 1 ? `<div style="margin-top:14px;border-top:1px solid var(--border);padding-top:12px;">${legend}</div>` : ""}
    </div>
    ${geoPhotoGalleryHTML(t)}
  `;

  initStepMap(t);
  loadAttachZones();
  loadGeoGallery(t);
  if (typeof hydrateRoutes === "function") hydrateRoutes(t); // calcule les trajets routiers en arrière-plan
}

function initStepMap(t) {
  if (window._leafletMap) { try { window._leafletMap.remove(); } catch (e) {} window._leafletMap = null; }
  const map = L.map("map");
  window._leafletMap = map;
  if (typeof baseTiles === "function") baseTiles(map, 19);
  else L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);

  const pts = t.steps.map(s => [s.lat, s.lng]);

  t.steps.forEach((s, i) => {
    // Tronçon depuis l'étape précédente, stylé selon le transport
    if (i > 0) {
      const prev = t.steps[i - 1];
      const tr = TRANSPORTS[s.transport] || TRANSPORTS.voiture;
      const geom = (typeof legGeom === "function") ? legGeom(prev, s) : [[prev.lat, prev.lng], [s.lat, s.lng]];
      const routed = geom.length > 2; // suit les vraies routes
      // Liseré blanc + trait coloré : effet « tracé de voyage » plus net.
      // smoothFactor bas sur les tronçons routés pour bien épouser les routes.
      if (routed) L.polyline(geom, { color: "#ffffff", weight: 8, opacity: 0.9, lineJoin: "round", lineCap: "round", smoothFactor: 0.5 }).addTo(map);
      L.polyline(geom, {
        color: tr.color, weight: routed ? 5 : 4, opacity: routed ? 0.95 : 0.85,
        dashArray: routed ? null : tr.dash, lineJoin: "round", lineCap: "round", smoothFactor: routed ? 0.5 : 1
      }).addTo(map);
      geom.forEach(c => pts.push(c)); // la carte cadre aussi sur le tracé
      const mid = routed ? geom[Math.floor(geom.length / 2)] : [(prev.lat + s.lat) / 2, (prev.lng + s.lng) / 2];
      L.marker(mid, {
        icon: L.divIcon({ className: "leg-emoji-icon", html: `<div class="leg-emoji">${tr.emoji}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] }),
        interactive: false
      }).addTo(map);
    }
    // Marqueur numéroté et déplaçable
    const marker = L.marker([s.lat, s.lng], {
      draggable: true,
      icon: L.divIcon({ className: "leg-emoji-icon", html: `<div class="step-marker" style="background:${esc(t.color || COULEURS[0])}">${i + 1}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] })
    }).addTo(map);
    const baseHTML = `<b>${i + 1}. ${esc(s.name)}</b>${s.notes ? "<br>" + esc(s.notes) : ""}`;
    marker.bindPopup(baseHTML);
    enrichStepPopup(marker, s.id, baseHTML);
    marker.on("dragend", ev => {
      const ll = ev.target.getLatLng();
      s.lat = ll.lat; s.lng = ll.lng;
      saveState();
      renderTripDetail(document.getElementById("main"));
      toast("📍 Étape déplacée");
    });
  });

  addGeoPhotoMarkers(map, t, pts);

  // Entrées de journal géolocalisées 📔
  (t.journal || []).filter(j => j.lat && j.lng).forEach(j => {
    L.marker([j.lat, j.lng], {
      icon: L.divIcon({ className: "leg-emoji-icon", html: `<div class="photo-marker">📔</div>`, iconSize: [30, 30], iconAnchor: [15, 15] })
    }).addTo(map).bindPopup(`<b>${j.mood || "📔"} ${esc(j.title)}</b><br>${fmtDate(j.date)}`);
    pts.push([j.lat, j.lng]);
  });

  if (pts.length > 1) map.fitBounds(pts, { padding: [45, 45] });
  else if (pts.length === 1) map.setView(pts[0], 10);
  else map.setView([46.6, 2.4], 5);

  map.on("click", e => {
    if (!window._addOnClick) return;
    window._addOnClick = false;
    addStepAt(t.id, e.latlng.lat, e.latlng.lng, "Étape " + (t.steps.length + 1));
  });
}

function toggleClickAdd() {
  window._addOnClick = !window._addOnClick;
  const btn = document.getElementById("click-add-btn");
  if (btn) btn.classList.toggle("btn-primary", window._addOnClick);
  toast(window._addOnClick ? "📍 Clique sur la carte pour poser l'étape" : "Mode clic désactivé");
}

async function searchPlace(tripId) {
  const q = document.getElementById("step-search").value.trim();
  if (!q) return;
  const box = document.getElementById("search-results");
  box.innerHTML = `<p class="muted small" style="margin-top:10px;">⏳ Recherche en cours…</p>`;
  try {
    const res = await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=5&accept-language=fr&q=" + encodeURIComponent(q));
    const data = await res.json();
    window._searchResults = data;
    if (!data.length) {
      box.innerHTML = `<p class="muted small" style="margin-top:10px;">Aucun résultat pour « ${esc(q)} ». Essaie avec le nom de la ville.</p>`;
      return;
    }
    box.innerHTML = data.map((r, i) =>
      `<button class="search-result" onclick="addStepFromResult('${tripId}',${i})">📍 ${esc(r.display_name)}</button>`).join("");
  } catch (e) {
    box.innerHTML = `<p class="muted small" style="margin-top:10px;">❌ Recherche impossible (pas de connexion ?). Tu peux quand même ajouter une étape d'un clic sur la carte.</p>`;
  }
}

function addStepFromResult(tripId, i) {
  const r = (window._searchResults || [])[i];
  if (!r) return;
  addStepAt(tripId, +r.lat, +r.lon, r.display_name.split(",")[0]);
}

function addStepAt(tripId, lat, lng, name) {
  const t = getTrip(tripId);
  t.steps = t.steps || [];
  t.steps.push({ id: uid(), name, lat, lng, transport: "voiture", notes: "" });
  saveState();
  renderTripDetail(document.getElementById("main"));
  toast("🧭 Étape « " + name + " » ajoutée");
}

function setStepTransport(tripId, stepId, transport) {
  const s = getTrip(tripId).steps.find(x => x.id === stepId);
  s.transport = transport;
  saveState();
  renderTripDetail(document.getElementById("main"));
}

function moveStep(tripId, stepId, dir) {
  const steps = getTrip(tripId).steps;
  const i = steps.findIndex(x => x.id === stepId);
  const j = i + dir;
  if (j < 0 || j >= steps.length) return;
  [steps[i], steps[j]] = [steps[j], steps[i]];
  saveState();
  renderTripDetail(document.getElementById("main"));
}

function deleteStep(tripId, stepId) {
  const t = getTrip(tripId);
  deleteAttachmentsFor(stepId);
  t.steps = t.steps.filter(x => x.id !== stepId);
  saveState();
  renderTripDetail(document.getElementById("main"));
  toast("🗑️ Étape supprimée");
}

function openStepForm(tripId, stepId) {
  const t = getTrip(tripId);
  const s = t.steps.find(x => x.id === stepId);
  const i = t.steps.indexOf(s);
  const opts = Object.entries(TRANSPORTS).map(([k, tr]) =>
    `<option value="${k}" ${s.transport === k ? "selected" : ""}>${tr.label}</option>`).join("");

  openModal("✏️ Modifier l'étape", `
    <div class="form-group"><label>Nom de l'étape *</label>
      <input id="st-name" value="${esc(s.name)}"></div>
    ${i > 0 ? `<div class="form-group"><label>Transport depuis « ${esc(t.steps[i - 1].name)} »</label>
      <select id="st-transport">${opts}</select></div>` : ""}
    <div class="form-group"><label>Notes (hébergement, durée du trajet…)</label>
      <textarea id="st-notes">${esc(s.notes || "")}</textarea></div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="saveStepForm('${tripId}','${stepId}')">Enregistrer</button>
    </div>
  `);
}

function saveStepForm(tripId, stepId) {
  const s = getTrip(tripId).steps.find(x => x.id === stepId);
  const name = document.getElementById("st-name").value.trim();
  if (!name) { toast("⚠️ Donne un nom à l'étape"); return; }
  s.name = name;
  const tSel = document.getElementById("st-transport");
  if (tSel) s.transport = tSel.value;
  s.notes = document.getElementById("st-notes").value.trim();
  saveState();
  closeModal();
  renderTripDetail(document.getElementById("main"));
  toast("✅ Étape mise à jour");
}

function toggleStepVisited(tripId, stepId) {
  const s = getTrip(tripId).steps.find(x => x.id === stepId);
  if (!s) return;
  s.visited = !s.visited;
  s.visitedAt = s.visited ? todayISO() : null;
  saveState();
  renderTripDetail(document.getElementById("main"));
  toast(s.visited ? "✅ Étape marquée comme visitée !" : "Étape remise « à visiter »");
}

/* ---------- Onglet Budget ---------- */

function renderBudget(el, t) {
  const expenses = (t.expenses || []).slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const total = expenses.reduce((s, e) => s + (+e.amount || 0), 0);
  const budget = +t.budget || 0;
  const pct = budget ? Math.min(100, Math.round(total / budget * 100)) : 0;
  const over = budget && total > budget;
  const plannedCost = (t.activities || []).reduce((s, a) => s + (+a.cost || 0), 0);

  // Répartition par catégorie (avec enveloppes 🎯 si définies)
  const byCat = {};
  expenses.forEach(e => { byCat[e.category] = (byCat[e.category] || 0) + (+e.amount || 0); });
  const env = t.catBudgets || {};
  const maxCat = Math.max(1, ...Object.values(byCat));
  const catBars = Object.entries(CAT_DEPENSES)
    .filter(([k]) => byCat[k] || env[k])
    .sort((a, b) => (byCat[b[0]] || 0) - (byCat[a[0]] || 0))
    .map(([k, c]) => {
      const v = byCat[k] || 0;
      const hasEnv = env[k] > 0;
      const pctEnv = hasEnv ? Math.round(v / env[k] * 100) : 0;
      const overEnv = hasEnv && v > env[k];
      const width = hasEnv ? Math.min(100, pctEnv) : Math.round(v / maxCat * 100);
      return `
      <div class="cat-bar">
        <span class="cat-name">${c.emoji} ${c.label}</span>
        <div class="cat-track"><div class="cat-fill" style="width:${width}%;background:${overEnv ? "var(--danger)" : c.color}"></div></div>
        <span class="cat-val">${fmtMoney(v)}${hasEnv ? ` <span class="${overEnv ? "todo-late" : "muted"} small">/ ${fmtMoney(env[k])}${overEnv ? " 🔥" : ""}</span>` : ""}</span>
      </div>`;
    }).join("");

  const rows = expenses.map(e => {
    const c = CAT_DEPENSES[e.category] || CAT_DEPENSES.autre;
    return `
      <div class="expense-row">
        <span class="exp-cat" title="${c.label}">${c.emoji}</span>
        <div class="exp-label">
          <div>${esc(e.label)}</div>
          <div class="muted small">${e.date ? fmtDateShort(e.date) : ""}${e.payer && payerName(t, e.payer) ? " · payé par " + payerName(t, e.payer) : ""}${e.local ? ` · 💱 ${(+e.local.amount).toLocaleString("fr-FR")} ${esc(e.local.cur)}` : ""}</div>
          ${attachZoneCompactHTML(e.id)}
        </div>
        <span class="exp-amount">${fmtMoney(e.amount)}</span>
        <button class="icon-btn" onclick="openExpenseForm('${t.id}','${e.id}')">✏️</button>
        <button class="icon-btn" onclick="deleteExpense('${t.id}','${e.id}')">🗑️</button>
      </div>`;
  }).join("");

  el.innerHTML = `
    <div class="grid grid-2" style="margin-bottom:18px;">
      <div class="card">
        <h3>💰 Budget global</h3>
        <p style="margin-top:10px;font-size:1.5rem;font-weight:700;">${fmtMoney(total)} <span class="muted" style="font-size:0.95rem;font-weight:400;">dépensés${budget ? " sur " + fmtMoney(budget) : ""}</span></p>
        ${budget ? `
          <div class="budget-bar"><div class="fill ${over ? "over" : ""}" style="width:${pct}%"></div></div>
          <p class="small ${over ? "" : "muted"}" style="${over ? "color:var(--danger);font-weight:600;" : ""}">
            ${over ? `🔥 Dépassement de ${fmtMoney(total - budget)} !` : `Il reste ${fmtMoney(budget - total)} (${100 - pct}%)`}
          </p>` : `<p class="muted small">Définis un budget prévu dans les infos du voyage (✏️) pour suivre ta jauge.</p>`}
        ${plannedCost ? `<p class="muted small" style="margin-top:8px;">🗓️ Coût estimé des activités planifiées : <b>${fmtMoney(plannedCost)}</b></p>` : ""}
        ${t.travelers > 1 && total ? `<p class="muted small" style="margin-top:4px;">👥 Soit ${fmtMoney(total / t.travelers)} par personne</p>` : ""}
      </div>
      <div class="card">
        <div class="row-between">
          <h3>📊 Répartition par catégorie</h3>
          <button class="btn btn-ghost btn-sm" title="Fixer un plafond par catégorie" onclick="openEnvelopesForm('${t.id}')">🎯 Enveloppes</button>
        </div>
        <div style="margin-top:14px;">${catBars || `<p class="muted small">Ajoute des dépenses pour voir la répartition.</p>`}</div>
      </div>
    </div>
    <div class="card">
      <div class="row-between" style="margin-bottom:10px;">
        <h3>🧾 Dépenses (${expenses.length})</h3>
        <button class="btn btn-primary btn-sm" onclick="openExpenseForm('${t.id}')">＋ Ajouter une dépense</button>
      </div>
      ${rows || `<p class="muted" style="padding:14px 0;">Aucune dépense enregistrée pour l'instant.</p>`}
    </div>
    ${spendingCurveHTML(t)}
    ${budgetExtrasHTML(t)}
  `;
  loadAttachZones();
}

function openExpenseForm(tripId, expId) {
  const t = getTrip(tripId);
  const e = expId ? t.expenses.find(x => x.id === expId) : null;
  const catOpts = Object.entries(CAT_DEPENSES).map(([k, c]) =>
    `<option value="${k}" ${e && e.category === k ? "selected" : ""}>${c.emoji} ${c.label}</option>`).join("");

  openModal(e ? "✏️ Modifier la dépense" : "＋ Nouvelle dépense", `
    <div class="form-group"><label>Libellé *</label>
      <input id="e-label" placeholder="Ex : Billets d'avion A/R" value="${e ? esc(e.label) : ""}"></div>
    <div class="form-row">
      <div class="form-group"><label>Montant *</label>
        <input id="e-amount" type="number" min="0" step="0.01" value="${e ? e.amount : ""}"></div>
      <div class="form-group"><label>Catégorie</label><select id="e-cat">${catOpts}</select></div>
      <div class="form-group"><label>Date</label>
        <input id="e-date" type="date" value="${e ? e.date || "" : todayISO()}"></div>
    </div>
    ${(t.people || []).length ? `<div class="form-group"><label>Payé par</label>
      <select id="e-payer"><option value="">— non précisé —</option>
        ${t.people.map(p => `<option value="${p.id}" ${e && e.payer === p.id ? "selected" : ""}>${p.emoji} ${esc(p.name)}</option>`).join("")}
      </select></div>` : ""}
    <div class="form-row">
      <div class="form-group"><label>💱 Ou montant en devise locale</label>
        <input id="e-local" type="number" min="0" step="0.01" placeholder="Ex : 1500" value="${e && e.local ? e.local.amount : ""}"></div>
      <div class="form-group"><label>Devise locale</label>
        <select id="e-localcur">${DEVISES_CONV.map(c => `<option ${(e && e.local ? e.local.cur === c : c === "USD") ? "selected" : ""}>${c}</option>`).join("")}</select></div>
    </div>
    <p class="muted small" style="margin-top:-6px;">Si tu remplis la devise locale, le montant en ${state.settings.currency || "EUR"} est calculé automatiquement (taux du jour).</p>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="saveExpenseForm('${tripId}',${e ? `'${e.id}'` : "null"})">Enregistrer</button>
    </div>
  `);
}

async function saveExpenseForm(tripId, expId) {
  const t = getTrip(tripId);
  const label = document.getElementById("e-label").value.trim();
  let amount = +document.getElementById("e-amount").value;
  let local = null;
  const localAmt = +document.getElementById("e-local").value;
  if (localAmt > 0) {
    try {
      const rates = await ratesGet();
      const localCur = document.getElementById("e-localcur").value;
      const userCur = state.settings.currency || "EUR";
      amount = Math.round(localAmt / rates[localCur] * rates[userCur] * 100) / 100;
      local = { amount: localAmt, cur: localCur };
    } catch (err) {
      toast("❌ Taux indisponibles (hors connexion ?) — saisis directement le montant en " + (state.settings.currency || "EUR"));
      return;
    }
  }
  if (!label || !amount) { toast("⚠️ Libellé et montant obligatoires"); return; }
  const data = { label, amount, local, category: document.getElementById("e-cat").value, date: document.getElementById("e-date").value };
  const payerSel = document.getElementById("e-payer");
  if (payerSel) data.payer = payerSel.value;
  if (expId) Object.assign(t.expenses.find(x => x.id === expId), data);
  else t.expenses.push(Object.assign({ id: uid() }, data));
  saveState();
  closeModal();
  renderTripDetail(document.getElementById("main"));
  toast("💸 Dépense enregistrée");
}

function deleteExpense(tripId, expId) {
  const t = getTrip(tripId);
  deleteAttachmentsFor(expId); // nettoie le ticket joint éventuel
  t.expenses = t.expenses.filter(x => x.id !== expId);
  saveState();
  renderTripDetail(document.getElementById("main"));
}

/* ---------- Onglet Bagages ---------- */

function renderBagages(el, t) {
  const items = t.packing || [];
  const done = items.filter(i => i.done).length;
  const pct = items.length ? Math.round(done / items.length * 100) : 0;

  const templateBtns = Object.entries(PACK_TEMPLATES).map(([k, tpl]) =>
    `<button class="chip" onclick="applyPackTemplate('${t.id}','${k}')">${tpl.label}</button>`).join("");

  const list = filterPackItems(t, items).map(i => `
    <div class="pack-item ${i.done ? "done" : ""}">
      <input type="checkbox" id="pk-${i.id}" ${i.done ? "checked" : ""} onchange="togglePackItem('${t.id}','${i.id}')">
      <label for="pk-${i.id}">${esc(i.label)}</label>
      ${packOwnerBtnHTML(t, i)}
      <button class="icon-btn" onclick="deletePackItem('${t.id}','${i.id}')">🗑️</button>
    </div>`).join("");

  el.innerHTML = `
    <div class="card" style="margin-bottom:18px;">
      <div class="row" style="margin-bottom:8px;">
        <h3 style="flex-shrink:0;">🎒 Valise prête à ${pct}%</h3>
        <div class="progress-pill"><div class="fill" style="width:${pct}%"></div></div>
        <span class="muted small" style="flex-shrink:0;">${done}/${items.length}</span>
      </div>
      <p class="muted small">Modèles rapides (ajoute les éléments manquants) :</p>
      <div class="filters" style="margin:10px 0 0;">${templateBtns}</div>
      ${typeof smartPackHTML === "function" ? smartPackHTML(t) : ""}
      ${packFilterHTML(t)}
    </div>
    <div class="card">
      <div class="row" style="margin-bottom:12px;">
        <input class="search-input" id="pack-new" placeholder="Ajouter un élément… (Entrée pour valider)"
          onkeydown="if(event.key==='Enter')addPackItem('${t.id}')">
        <button class="btn btn-primary btn-sm" onclick="addPackItem('${t.id}')">Ajouter</button>
        ${items.length ? `<button class="btn btn-ghost btn-sm" onclick="resetPackChecks('${t.id}')">Tout décocher</button>` : ""}
      </div>
      ${list || `<p class="muted" style="padding:10px 0;">Liste vide — utilise un modèle ci-dessus ou ajoute tes propres éléments.</p>`}
    </div>
  `;
}

function addPackItem(tripId) {
  const input = document.getElementById("pack-new");
  const label = input.value.trim();
  if (!label) return;
  getTrip(tripId).packing.push({ id: uid(), label, done: false });
  saveState();
  renderTripDetail(document.getElementById("main"));
  const newInput = document.getElementById("pack-new");
  if (newInput) newInput.focus();
}

function applyPackTemplate(tripId, key) {
  const t = getTrip(tripId);
  const existing = new Set(t.packing.map(i => i.label.toLowerCase()));
  let added = 0;
  PACK_TEMPLATES[key].items.forEach(label => {
    if (!existing.has(label.toLowerCase())) {
      t.packing.push({ id: uid(), label, done: false });
      added++;
    }
  });
  saveState();
  renderTripDetail(document.getElementById("main"));
  toast(added ? `🎒 ${added} élément(s) ajouté(s)` : "Tout y est déjà !");
}

function togglePackItem(tripId, itemId) {
  const i = getTrip(tripId).packing.find(x => x.id === itemId);
  i.done = !i.done;
  saveState();
  renderTripDetail(document.getElementById("main"));
}

function deletePackItem(tripId, itemId) {
  const t = getTrip(tripId);
  t.packing = t.packing.filter(x => x.id !== itemId);
  saveState();
  renderTripDetail(document.getElementById("main"));
}

function resetPackChecks(tripId) {
  getTrip(tripId).packing.forEach(i => i.done = false);
  saveState();
  renderTripDetail(document.getElementById("main"));
}

/* ---------- Onglet Documents ---------- */

function renderDocuments(el, t) {
  const docs = t.documents || [];
  const cards = docs.map(d => `
    <div class="card doc-card" data-dropowner="${d.id}">
      <div class="row-between">
        <h3><span class="doc-type">${(DOC_TYPES[d.type] || DOC_TYPES.autre).split(" ")[0]}</span>${esc(d.title)}</h3>
        <div>
          <button class="icon-btn" title="Copier (n° de réservation…)" onclick="copyDoc('${t.id}','${d.id}')">📋</button>
          <button class="icon-btn" onclick="openDocForm('${t.id}','${d.id}')">✏️</button>
          <button class="icon-btn" onclick="deleteDoc('${t.id}','${d.id}')">🗑️</button>
        </div>
      </div>
      <pre>${esc(d.content)}</pre>
      ${attachZoneHTML(d.id)}
    </div>`).join("");

  el.innerHTML = `
    <div class="row-between" style="margin-bottom:16px;">
      <p class="muted">Numéros de réservation, adresses, contacts… Joins les billets en PDF/photo : le QR code est toujours sous la main ! 📎</p>
      <button class="btn btn-primary btn-sm" onclick="openDocForm('${t.id}')">＋ Ajouter une info</button>
    </div>
    ${cards || `<div class="empty-state card"><span class="big-emoji">📄</span><p>Aucune information enregistrée.<br>Note ici les numéros de vol, l'adresse de l'hôtel, etc.</p></div>`}
    ${itemTrashHTML(t, "doc")}
  `;
  loadAttachZones();
}

function openDocForm(tripId, docId) {
  const t = getTrip(tripId);
  const d = docId ? t.documents.find(x => x.id === docId) : null;
  const typeOpts = Object.entries(DOC_TYPES).map(([k, l]) =>
    `<option value="${k}" ${d && d.type === k ? "selected" : ""}>${l}</option>`).join("");

  openModal(d ? "✏️ Modifier l'information" : "＋ Nouvelle information", `
    <div class="form-row">
      <div class="form-group"><label>Titre *</label>
        <input id="d-title" placeholder="Ex : Vol Paris → Rome" value="${d ? esc(d.title) : ""}"></div>
      <div class="form-group"><label>Type</label><select id="d-type">${typeOpts}</select></div>
    </div>
    <div class="form-group"><label>Contenu *</label>
      <textarea id="d-content" style="min-height:120px;" placeholder="N° de réservation : ABC123&#10;Terminal 2E, 14h35&#10;…">${d ? esc(d.content) : ""}</textarea></div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="saveDocForm('${tripId}',${d ? `'${d.id}'` : "null"})">Enregistrer</button>
    </div>
  `);
}

function saveDocForm(tripId, docId) {
  const t = getTrip(tripId);
  const title = document.getElementById("d-title").value.trim();
  const content = document.getElementById("d-content").value.trim();
  if (!title || !content) { toast("⚠️ Titre et contenu obligatoires"); return; }
  const data = { title, content, type: document.getElementById("d-type").value };
  if (docId) Object.assign(t.documents.find(x => x.id === docId), data);
  else t.documents.push(Object.assign({ id: uid() }, data));
  saveState();
  closeModal();
  renderTripDetail(document.getElementById("main"));
  toast("📄 Information enregistrée");
}

function deleteDoc(tripId, docId) {
  const t = getTrip(tripId);
  const doc = t.documents.find(x => x.id === docId);
  if (!doc) return;
  t.itemTrash = t.itemTrash || [];
  t.itemTrash.unshift({ type: "doc", item: doc, deletedAt: todayISO() });
  t.itemTrash = t.itemTrash.slice(0, 20);
  t.documents = t.documents.filter(x => x.id !== docId);
  saveState();
  renderTripDetail(document.getElementById("main"));
  toast("🗑️ Information mise à la corbeille (récupérable plus bas)");
}

/* ---------- Onglet Journal ---------- */

function renderJournal(el, t) {
  const entries = (t.journal || []).slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const cards = entries.map(j => `
    <div class="card journal-entry" data-dropowner="${j.id}" title="Astuce : dépose des photos directement sur cette carte !">
      <div class="row-between">
        <div class="row">
          <span class="mood">${j.mood || "🙂"}</span>
          <div>
            <b>${esc(j.title)}</b>
            <div class="journal-date">${fmtDate(j.date)}${j.lat ? ` · <span title="Écrit à ${j.lat.toFixed(3)}, ${j.lng.toFixed(3)} — visible sur la carte 🗺️">📍</span>` : ""}</div>
          </div>
        </div>
        <div>
          <button class="icon-btn" onclick="openJournalForm('${t.id}','${j.id}')">✏️</button>
          <button class="icon-btn" onclick="deleteJournal('${t.id}','${j.id}')">🗑️</button>
        </div>
      </div>
      <p>${esc(j.content)}</p>
      ${attachZoneHTML(j.id)}
    </div>`).join("");

  el.innerHTML = `
    ${bestOfHTML(t)}
    ${capsuleCardHTML(t)}
    ${typeof foodCardHTML === "function" ? foodCardHTML(t) : ""}
    <div class="row-between" style="margin-bottom:16px;">
      <p class="muted">Raconte tes journées : souvenirs, anecdotes, coups de cœur… (🎤 dictée vocale dans le formulaire !)</p>
      <div class="row" style="flex-shrink:0;">
        <label class="btn btn-ghost btn-sm" style="cursor:pointer;" title="Les photos sont rangées au bon jour grâce à leur date (EXIF)">📸 Importer des photos
          <input type="file" accept="image/*" multiple style="display:none" onchange="importJournalPhotos('${t.id}',this)">
        </label>
        <button class="btn btn-ghost btn-sm" title="Toutes les photos du voyage en plein écran" onclick="startSlideshow('${t.id}')">▶️ Diaporama</button>
        <button class="btn btn-ghost btn-sm" title="Créer un collage des photos du voyage" onclick="generateCollage('${t.id}')">🧩 Collage</button>
        <button class="btn btn-ghost btn-sm" title="Générer une carte postale à envoyer" onclick="openPostcard('${t.id}')">💌 Carte postale</button>
        <button class="btn btn-primary btn-sm" onclick="openJournalForm('${t.id}')">＋ Nouvelle entrée</button>
      </div>
    </div>
    ${cards || `<div class="empty-state card"><span class="big-emoji">📔</span><p>Le carnet est vierge.<br>Écris ta première entrée et garde tes souvenirs pour toujours !</p></div>`}
    ${itemTrashHTML(t, "journal")}
  `;
  loadAttachZones();
}

function openJournalForm(tripId, entryId) {
  const t = getTrip(tripId);
  const j = entryId ? t.journal.find(x => x.id === entryId) : null;
  window._jpos = j && j.lat ? { lat: j.lat, lng: j.lng } : null;
  window._jaudio = [];
  const moods = HUMEURS.map(m =>
    `<button type="button" class="chip mood-chip ${j && j.mood === m || (!j && m === "🙂") ? "active" : ""}" data-mood="${m}" style="font-size:1.2rem;"
      onclick="document.querySelectorAll('.mood-chip').forEach(c=>c.classList.remove('active'));this.classList.add('active')">${m}</button>`).join("");

  openModal(j ? "✏️ Modifier l'entrée" : "📔 Nouvelle entrée de journal", `
    <div class="form-row">
      <div class="form-group"><label>Titre *</label>
        <input id="j-title" placeholder="Ex : Première journée à Rome !" value="${j ? esc(j.title) : ""}"></div>
      <div class="form-group"><label>Date</label>
        <input id="j-date" type="date" value="${j ? j.date : todayISO()}"></div>
    </div>
    <div class="form-group"><label>Humeur du jour</label><div class="filters" style="margin:0;">${moods}</div></div>
    <div class="form-group"><label>📍 Position (apparaîtra sur la carte du voyage)</label>
      <div class="row">
        <button type="button" class="btn btn-secondary btn-sm" onclick="captureJournalPos()">📍 Capturer ma position</button>
        <span class="muted small" id="j-geo-status">${j && j.lat ? `enregistrée 📍 (${j.lat.toFixed(3)}, ${j.lng.toFixed(3)})` : "aucune"}</span>
      </div></div>
    <div class="form-group"><label>🎙️ Note audio (l'ambiance d'un lieu, un rire, le bruit des vagues…)</label>
      <div class="row">
        <button type="button" class="btn btn-secondary btn-sm" id="j-audio-btn" onclick="toggleAudioRec()">🎙️ Enregistrer une note audio</button>
        <span class="muted small" id="j-audio-status">aucune</span>
      </div></div>
    <div class="form-group"><label>Récit *</label>
      <textarea id="j-content" style="min-height:140px;" placeholder="Aujourd'hui, on a…">${j ? esc(j.content) : ""}</textarea></div>
    ${stickersHTML()}
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="saveJournalForm('${tripId}',${j ? `'${j.id}'` : "null"})">Enregistrer</button>
    </div>
  `);
}

function saveJournalForm(tripId, entryId) {
  const t = getTrip(tripId);
  const title = document.getElementById("j-title").value.trim();
  const content = document.getElementById("j-content").value.trim();
  if (!title || !content) { toast("⚠️ Titre et récit obligatoires"); return; }
  const moodChip = document.querySelector(".mood-chip.active");
  const data = { title, content, date: document.getElementById("j-date").value || todayISO(), mood: moodChip ? moodChip.dataset.mood : "🙂" };
  if (window._jpos) { data.lat = window._jpos.lat; data.lng = window._jpos.lng; }
  let theId = entryId;
  if (entryId) Object.assign(t.journal.find(x => x.id === entryId), data);
  else { theId = uid(); t.journal.push(Object.assign({ id: theId }, data)); }
  flushPendingAudio(theId); // notes audio 🎙️ en attente
  saveState();
  closeModal();
  renderTripDetail(document.getElementById("main"));
  toast("📔 Souvenir enregistré");
}

function deleteJournal(tripId, entryId) {
  const t = getTrip(tripId);
  const entry = t.journal.find(x => x.id === entryId);
  if (!entry) return;
  t.itemTrash = t.itemTrash || [];
  t.itemTrash.unshift({ type: "journal", item: entry, deletedAt: todayISO() });
  t.itemTrash = t.itemTrash.slice(0, 20);
  t.journal = t.journal.filter(x => x.id !== entryId);
  saveState();
  renderTripDetail(document.getElementById("main"));
  toast("🗑️ Souvenir mis à la corbeille (récupérable plus bas)");
}

/* ===================== Liste d'envies ===================== */

function renderWishlist(main) {
  const wishes = state.wishlist.slice().sort((a, b) => (b.priority || 0) - (a.priority || 0));
  const cards = wishes.map(w => `
    <div class="card wish-card">
      <div class="row-between">
        <span class="wish-flag">${flagFor(w.country)}</span>
        <span class="priority" title="Priorité">${"★".repeat(w.priority || 1)}${"☆".repeat(3 - (w.priority || 1))}</span>
      </div>
      <h3 style="margin:8px 0 2px;">${esc(w.destination)}</h3>
      <div class="muted small">${esc(w.country || "")}</div>
      ${w.season ? `<div class="small" style="margin-top:8px;">🗓️ Idéal : ${esc(w.season)}</div>` : ""}
      ${w.budget ? `<div class="small">💰 Budget estimé : ${fmtMoney(w.budget)}</div>` : ""}
      ${w.notes ? `<p class="muted small" style="margin-top:8px;white-space:pre-wrap;">${esc(w.notes)}</p>` : ""}
      <div class="row" style="margin-top:14px;">
        <button class="btn btn-primary btn-sm" onclick="wishToTrip('${w.id}')">🚀 Transformer en voyage</button>
        <button class="icon-btn" onclick="openWishForm('${w.id}')">✏️</button>
        <button class="icon-btn" onclick="deleteWish('${w.id}')">🗑️</button>
      </div>
    </div>`).join("");

  main.innerHTML = `
    <div class="row-between" style="margin-bottom:6px;">
      <div><h1 class="page-title">💫 Liste d'envies</h1><p class="page-sub">Toutes les destinations qui te font rêver</p></div>
      <div class="row">
        ${state.wishlist.length >= 2 ? `<button class="btn btn-secondary" onclick="openDestCompare()">🌡️ Comparer</button>` : ""}
        <button class="btn btn-secondary" onclick="openWhereTo()">💡 Où partir ?</button>
        <button class="btn btn-secondary" onclick="openRoulette()">🎲 Surprends-moi</button>
        <button class="btn btn-primary" onclick="openWishForm()">＋ Ajouter un rêve</button>
      </div>
    </div>
    ${wishes.length ? `<div class="grid grid-3">${cards}</div>` : `
      <div class="empty-state card"><span class="big-emoji">🌠</span><p>Aucune destination de rêve pour l'instant.<br>Japon ? Islande ? Patagonie ? Note tout ici !</p></div>`}
  `;
}

function openWishForm(id) {
  const w = id ? state.wishlist.find(x => x.id === id) : null;
  openModal(w ? "✏️ Modifier le rêve" : "💫 Nouvelle destination de rêve", `
    <div class="form-row">
      <div class="form-group"><label>Destination *</label>
        <input id="w-dest" placeholder="Ex : Kyoto" value="${w ? esc(w.destination) : ""}"></div>
      <div class="form-group"><label>Pays</label>
        <input id="w-country" placeholder="Ex : Japon" value="${w ? esc(w.country || "") : ""}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Priorité</label>
        <select id="w-priority">
          <option value="1" ${w && w.priority === 1 ? "selected" : ""}>★☆☆ Un jour peut-être</option>
          <option value="2" ${w && w.priority === 2 ? "selected" : ""}>★★☆ J'aimerais beaucoup</option>
          <option value="3" ${w && w.priority === 3 ? "selected" : ""}>★★★ Rêve absolu !</option>
        </select></div>
      <div class="form-group"><label>Saison idéale</label>
        <input id="w-season" placeholder="Ex : Printemps (cerisiers)" value="${w ? esc(w.season || "") : ""}"></div>
      <div class="form-group"><label>Budget estimé</label>
        <input id="w-budget" type="number" min="0" step="50" value="${w && w.budget ? w.budget : ""}"></div>
    </div>
    <div class="form-group"><label>Pourquoi cette destination ?</label>
      <textarea id="w-notes" placeholder="Ce qui te fait rêver là-bas…">${w ? esc(w.notes || "") : ""}</textarea></div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="saveWishForm(${w ? `'${w.id}'` : "null"})">Enregistrer</button>
    </div>
  `);
}

function saveWishForm(id) {
  const dest = document.getElementById("w-dest").value.trim();
  if (!dest) { toast("⚠️ Indique au moins la destination"); return; }
  const data = {
    destination: dest,
    country: document.getElementById("w-country").value.trim(),
    priority: +document.getElementById("w-priority").value,
    season: document.getElementById("w-season").value.trim(),
    budget: +document.getElementById("w-budget").value || 0,
    notes: document.getElementById("w-notes").value.trim()
  };
  if (id) Object.assign(state.wishlist.find(x => x.id === id), data);
  else state.wishlist.push(Object.assign({ id: uid() }, data));
  saveState();
  closeModal();
  renderWishlist(document.getElementById("main"));
  toast("💫 Rêve enregistré");
}

function deleteWish(id) {
  state.wishlist = state.wishlist.filter(x => x.id !== id);
  saveState();
  renderWishlist(document.getElementById("main"));
}

function wishToTrip(id) {
  const w = state.wishlist.find(x => x.id === id);
  const trip = {
    id: uid(),
    title: "Voyage à " + w.destination,
    destination: w.destination,
    country: w.country || "",
    start: "", end: "",
    status: "idee",
    travelers: 1,
    budget: w.budget || 0,
    color: COULEURS[Math.floor(Math.random() * COULEURS.length)],
    notes: w.notes || "",
    activities: [], expenses: [], packing: [], documents: [], journal: [], steps: [],
    todos: [], shopping: [], people: []
  };
  state.trips.push(trip);
  state.wishlist = state.wishlist.filter(x => x.id !== id);
  saveState();
  toast("🚀 Le rêve devient projet !");
  openTrip(trip.id);
}

/* ===================== Statistiques ===================== */

function renderStats(main) {
  const trips = state.trips;
  const visited = trips.filter(t => t.status === "termine" || t.status === "encours");
  const countries = {};
  visited.forEach(t => {
    const c = (t.country || "").trim();
    if (c) countries[c.toLowerCase()] = c;
  });

  const totalDays = visited.reduce((s, t) => s + tripDuration(t), 0);
  const totalSpent = trips.reduce((s, t) => s + (t.expenses || []).reduce((a, e) => a + (+e.amount || 0), 0), 0);
  const totalActivities = trips.reduce((s, t) => s + (t.activities || []).length, 0);
  const totalJournal = trips.reduce((s, t) => s + (t.journal || []).length, 0);
  const totalKm = visited.reduce((s, t) => s + tripTotalKm(t), 0);

  // Voyages par année
  const byYear = {};
  visited.forEach(t => {
    if (!t.start) return;
    const y = t.start.slice(0, 4);
    byYear[y] = byYear[y] || { count: 0, days: 0 };
    byYear[y].count++;
    byYear[y].days += tripDuration(t);
  });
  const years = Object.keys(byYear).sort();
  const maxCount = Math.max(1, ...years.map(y => byYear[y].count));
  const yearBars = years.map(y => `
    <div class="year-bar">
      <span class="yb-year">${y}</span>
      <div class="yb-track"><div class="yb-fill" style="width:${Math.round(byYear[y].count / maxCount * 100)}%"></div></div>
      <span class="yb-val">${byYear[y].count} voyage(s) · ${byYear[y].days} j</span>
    </div>`).join("");

  // Voyage le plus long / le plus cher
  const longest = visited.slice().sort((a, b) => tripDuration(b) - tripDuration(a))[0];
  const tripSpend = t => (t.expenses || []).reduce((a, e) => a + (+e.amount || 0), 0);
  const priciest = trips.slice().sort((a, b) => tripSpend(b) - tripSpend(a))[0];

  const countryChips = Object.values(countries).sort().map(c =>
    `<span class="country-chip">${flagFor(c)} ${esc(c)}</span>`).join("");

  main.innerHTML = `
    <div class="row-between" style="align-items:flex-start;">
      <div><h1 class="page-title">📊 Statistiques</h1>
      <p class="page-sub">Ton palmarès de globe-trotteur</p></div>
      <button class="btn btn-secondary btn-sm" title="Diaporama plein écran de toutes tes photos" onclick="startPresentation()">📺 Mode présentation</button>
    </div>

    <div class="grid grid-4" style="margin-bottom:20px;">
      <div class="card stat-card"><div class="stat-num">${visited.length}</div><div class="stat-label">Voyages réalisés</div></div>
      <div class="card stat-card"><div class="stat-num">${Object.keys(countries).length}</div><div class="stat-label">Pays visités</div></div>
      <div class="card stat-card"><div class="stat-num">${totalDays}</div><div class="stat-label">Jours en voyage</div></div>
      <div class="card stat-card"><div class="stat-num">${fmtMoney(totalSpent)}</div><div class="stat-label">Dépensé au total</div></div>
    </div>
    <div class="grid grid-3" style="margin-bottom:20px;">
      <div class="card stat-card"><div class="stat-num">${totalActivities}</div><div class="stat-label">Activités planifiées</div></div>
      <div class="card stat-card"><div class="stat-num">${totalJournal}</div><div class="stat-label">Souvenirs dans le journal</div></div>
      <div class="card stat-card"><div class="stat-num">${Math.round(totalKm).toLocaleString("fr-FR")} km</div>
        <div class="stat-label">Parcourus sur les cartes${totalKm ? ` · ${(totalKm / 40075 * 100).toFixed(1)} % du tour du monde 🌍` : ""}</div></div>
    </div>

    <div class="card" style="margin-bottom:20px;">
      <h3>🗺️ Pays visités</h3>
      <div style="margin-top:12px;">${countryChips || `<p class="muted small">Termine un premier voyage pour remplir ta carte du monde !</p>`}</div>
    </div>

    <div class="card" style="margin-bottom:20px;">
      <h3>📅 Voyages par année</h3>
      <div style="margin-top:14px;">${yearBars || `<p class="muted small">Pas encore de voyage daté et terminé.</p>`}</div>
    </div>

    ${longest || (priciest && tripSpend(priciest)) ? `
    <div class="grid grid-2">
      ${longest ? `<div class="card"><h3>🏆 Voyage le plus long</h3>
        <p style="margin-top:8px;">${flagFor(longest.country)} <b>${esc(longest.title)}</b> — ${tripDuration(longest)} jours</p></div>` : ""}
      ${priciest && tripSpend(priciest) ? `<div class="card"><h3>💎 Voyage le plus dépensier</h3>
        <p style="margin-top:8px;">${flagFor(priciest.country)} <b>${esc(priciest.title)}</b> — ${fmtMoney(tripSpend(priciest))}</p></div>` : ""}
    </div>` : ""}

    <div style="margin-top:20px;"></div>
    ${typeof lifeMapHTML === "function" ? lifeMapHTML() : ""}
    ${statsExtraHTML(trips, visited)}
  `;
  if (typeof initLifeMap === "function") initLifeMap();
}

/* ===================== Paramètres ===================== */

function renderSettings(main) {
  const s = state.settings;
  main.innerHTML = `
    <h1 class="page-title">⚙️ Paramètres</h1>
    <p class="page-sub">Personnalisation et sauvegarde de tes données</p>

    <div class="card" style="margin-bottom:18px;max-width:560px;">
      <h3>👤 Profil</h3>
      <div class="form-group" style="margin-top:14px;"><label>Ton prénom (pour l'accueil)</label>
        <input id="s-name" value="${esc(s.userName || "")}" placeholder="Ex : Mateo"></div>
      <div class="form-group"><label>Devise</label>
        <select id="s-currency">
          ${["EUR", "USD", "GBP", "CHF", "CAD", "JPY"].map(c => `<option ${s.currency === c ? "selected" : ""}>${c}</option>`).join("")}
        </select></div>
      <button class="btn btn-primary btn-sm" onclick="saveSettings()">Enregistrer</button>
    </div>

    ${themePickerHTML()}

    ${passportsHTML()}

    ${familySettingsHTML()}

    <div class="card" style="margin-bottom:18px;max-width:560px;">
      <h3>💾 Sauvegarde</h3>
      <p class="muted small" style="margin:10px 0 14px;">Tes données sont stockées dans ce navigateur, sur cet ordinateur.
      Exporte régulièrement une sauvegarde pour ne rien perdre (changement de PC, nettoyage du navigateur…).</p>
      <div class="row" style="flex-wrap:wrap;">
        <button class="btn btn-secondary btn-sm" onclick="exportData()">⬇️ Exporter (JSON, sans photos)</button>
        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('import-file').click()">⬆️ Importer un JSON</button>
        <input type="file" id="import-file" accept=".json" style="display:none" onchange="importData(this)">
      </div>
      <div class="row" style="flex-wrap:wrap;margin-top:10px;">
        <button class="btn btn-primary btn-sm" onclick="exportZip()">📦 Sauvegarde COMPLÈTE (avec photos)</button>
        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('import-zip').click()">📂 Restaurer une sauvegarde complète</button>
        <input type="file" id="import-zip" accept=".zip" style="display:none" onchange="importZip(this)">
      </div>
      <p class="muted small" style="margin-top:10px;">📦 La <b>sauvegarde complète (.zip)</b> contient tout, <b>photos comprises</b> — c'est elle qu'il faut utiliser pour déménager vers un autre PC/navigateur sans rien perdre.</p>
    </div>

    <div class="card" style="margin-bottom:18px;max-width:560px;">
      <h3>📱 Consultation sur mobile</h3>
      <p class="muted small" style="margin:10px 0 12px;">Pour consulter tes voyages sur ton téléphone : héberge l'app (voir <b>GUIDE-MOBILE.md</b>), ouvre-la sur le tél, puis colle ici le <b>lien public pCloud</b> de ton fichier <code>carnet-famille.json</code> → le texte se charge tout seul (lecture seule, toujours à jour). Pour voir aussi les <b>photos</b>, fais une fois « 📂 Restaurer une sauvegarde complète » (ZIP) ci-dessus, sur le téléphone.</p>
      <div class="form-group"><label>Lien du carnet (pCloud) — propre à cet appareil</label>
        <input id="remote-url" placeholder="https://…pcloud.link/…?code=…  (ou lien direct)" value="${typeof getRemoteURL === "function" ? esc(getRemoteURL()) : ""}"></div>
      <div class="row" style="flex-wrap:wrap;">
        <button class="btn btn-primary btn-sm" onclick="saveRemoteURL()">💾 Enregistrer &amp; charger</button>
        ${typeof getRemoteURL === "function" && getRemoteURL() ? `<button class="btn btn-secondary btn-sm" onclick="loadRemoteCarnet()">🔄 Recharger maintenant</button>` : ""}
      </div>
      <p class="muted small" style="margin-top:10px;">ℹ️ À régler <b>sur le téléphone</b> — le PC, lui, garde son mode famille pCloud habituel.</p>
    </div>

    ${settingsExtraHTML()}

    <div class="card" style="max-width:560px;border-color:var(--danger);">
      <h3 style="color:var(--danger);">⚠️ Zone dangereuse</h3>
      <p class="muted small" style="margin:10px 0 14px;">Efface tous les voyages, envies et réglages. Irréversible (pense à exporter avant !).</p>
      <button class="btn btn-danger btn-sm" onclick="resetAll()">Tout effacer</button>
    </div>
  `;
}

function saveSettings() {
  state.settings.userName = document.getElementById("s-name").value.trim();
  state.settings.currency = document.getElementById("s-currency").value;
  saveState();
  toast("✅ Paramètres enregistrés");
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "mes-voyages-sauvegarde-" + todayISO() + ".json";
  a.click();
  URL.revokeObjectURL(a.href);
  toast("⬇️ Sauvegarde téléchargée");
}

function importData(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data.trips)) throw new Error("format invalide");
      if (!confirm("Remplacer les données actuelles par cette sauvegarde ?")) return;
      state = Object.assign({ trips: [], wishlist: [], trash: [], passports: [], settings: {} }, data);
      state.settings = Object.assign({ theme: "light", currency: "EUR", userName: "" }, data.settings);
      saveState();
      applyTheme();
      showView("dashboard");
      toast("✅ Sauvegarde importée !");
    } catch (e) {
      toast("❌ Fichier de sauvegarde invalide");
    }
  };
  reader.readAsText(file);
  input.value = "";
}

function resetAll() {
  if (!confirm("Vraiment TOUT effacer ? Cette action est irréversible.")) return;
  if (!confirm("Dernière chance : as-tu exporté une sauvegarde ?")) return;
  state = { trips: [], wishlist: [], trash: [], passports: [], settings: { theme: state.settings.theme, currency: "EUR", userName: "" } };
  saveState();
  showView("dashboard");
  toast("🧹 Données effacées");
}

/* ===================== Thème ===================== */

function applyTheme() {
  const theme = state.settings.theme || "light";
  document.documentElement.dataset.theme = theme;
  const icon = document.getElementById("theme-icon");
  const label = document.getElementById("theme-label");
  if (icon) icon.textContent = theme === "dark" ? "☀️" : "🌙";
  if (label) label.textContent = theme === "dark" ? "Mode clair" : "Mode sombre";
}

function toggleTheme() {
  state.settings.theme = state.settings.theme === "dark" ? "light" : "dark";
  saveState();
  applyTheme();
}

/* ===================== Démarrage ===================== */
/* Le démarrage (loadState, thème, vue initiale) est assuré par features.js,
   chargé après ce fichier, afin que toutes les fonctions soient disponibles. */
